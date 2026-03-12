from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
import os
import logging

from dellmology.intelligence import llm_backend
import config as cfg

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)


def _is_admin(request: Request) -> bool:
    token = request.headers.get('x-admin-token') or request.headers.get('authorization')
    if token and token.lower().startswith('bearer '):
        token = token.split(' ', 1)[1].strip()
    env_admin = os.getenv('ADMIN_TOKEN') or os.getenv('ML_ENGINE_KEY')
    # If no admin token configured in the environment (local dev), allow access
    # to admin endpoints to simplify local testing. In production, always set
    # ADMIN_TOKEN or ML_ENGINE_KEY and this will enforce authentication.
    if not env_admin:
        return True
    return bool(token and env_admin and token == env_admin)


class ValidateKeyRequest(BaseModel):
    provider: str = 'openai'
    api_key: str
    model: str | None = None


@router.post('/llm/validate')
async def validate_llm_key(req: ValidateKeyRequest, request: Request):
    if not _is_admin(request):
        raise HTTPException(status_code=401, detail='Unauthorized')
    res = llm_backend.validate_key(req.api_key, provider=req.provider, model=req.model)
    return res


@router.get('/llm/status')
async def llm_status(request: Request):
    if not _is_admin(request):
        raise HTTPException(status_code=401, detail='Unauthorized')
    # return config values but mask API key
    data = {
        'enabled': cfg.Config.LLM_ENABLED,
        'provider': cfg.Config.LLM_PROVIDER,
        'endpoint': cfg.Config.LLM_ENDPOINT,
        'model': os.getenv('LLM_MODEL', 'gpt-4o-mini'),
        'api_key_set': bool(cfg.Config.LLM_API_KEY),
    }
    # If local provider, include local model readiness info
    try:
        if (getattr(cfg.Config, 'LLM_PROVIDER', '') or os.getenv('LLM_PROVIDER', '')).strip() == 'local':
            local_status = llm_backend.local_model_status()
            # If not preloaded yet, attempt a best-effort preload so status shows
            # 'preloaded' for local development environments where the app
            # may not have preloaded on startup.
            if not local_status.get('preloaded'):
                try:
                    llm_backend.preload_local_model(os.getenv('LLM_MODEL'))
                    local_status = llm_backend.local_model_status()
                except Exception:
                    pass
            data['local_model'] = local_status
    except Exception:
        # best-effort, don't fail status endpoint
        data['local_model'] = {'ok': False, 'model_path': None, 'preloaded': False}
    return data


class ToggleRequest(BaseModel):
    enabled: bool


@router.post('/llm/enable')
async def llm_enable(req: ToggleRequest, request: Request):
    if not _is_admin(request):
        raise HTTPException(status_code=401, detail='Unauthorized')
    # Update runtime flag (does not persist to disk)
    cfg.Config.LLM_ENABLED = bool(req.enabled)
    return {'ok': True, 'enabled': cfg.Config.LLM_ENABLED}


@router.post('/llm/preload')
async def llm_preload(request: Request):
    if not _is_admin(request):
        raise HTTPException(status_code=401, detail='Unauthorized')
    model_path = os.getenv('LLM_MODEL')
    try:
        llm_backend.preload_local_model(model_path)
        status = llm_backend.local_model_status()
        return {'ok': True, 'local_model': status}
    except Exception as exc:
        logger.exception('Failed to preload local model')
        raise HTTPException(status_code=500, detail=str(exc))
