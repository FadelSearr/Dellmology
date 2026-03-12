from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging

from dellmology.intelligence import llm_backend

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)


class NarrativeRequest(BaseModel):
    stats: Optional[Dict[str, Any]] = None
    top_pick: Optional[Dict[str, Any]] = None
    symbol: Optional[str] = None


@router.post('/narrative')
async def generate_narrative(req: NarrativeRequest, request: Request):
    """Generate a short AI narrative using configured LLM provider.

    Body: { stats: {...}, top_pick: {...}, symbol: 'AALI' }
    """
    try:
        payload = {
            'stats': req.stats or {},
            'top_pick': req.top_pick or {},
        }
        # Call LLM backend; returns string or None
        text = llm_backend.call_llm(payload, symbol=req.symbol)
        return {'ok': True, 'narrative': text, 'payload': payload}
    except Exception as exc:
        logger.exception('Narrative generation failed')
        raise HTTPException(status_code=500, detail=str(exc))

