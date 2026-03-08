from fastapi import APIRouter, Request, HTTPException
from typing import List
import logging
from sqlalchemy import text

from dellmology.utils.db_utils import get_db_connection, init_db
import hashlib

# Config may be available as local `config` module or via dellmology.utils.config
try:
    from config import Config
except Exception:
    try:
        from dellmology.utils.config import Config
    except Exception:
        # fallback placeholder when running in test environments without full config
        class _FallbackConfig:
            ADMIN_TOKEN = None

        Config = _FallbackConfig()

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _check_admin(request: Request):
    # Accept `Authorization: Bearer <token>` or legacy `x-admin-token` header.
    auth = request.headers.get('authorization') or request.headers.get('Authorization')
    x_token = request.headers.get('x-admin-token')
    token = None
    if auth and auth.lower().startswith('bearer '):
        token = auth.split(None, 1)[1]
    elif x_token:
        token = x_token

    # Accept either the ADMIN_TOKEN or ML_ENGINE_KEY for server-to-server calls.
    if token and (token == Config.ADMIN_TOKEN or token == getattr(Config, 'ML_ENGINE_KEY', None)):
        return

    # If ADMIN_JWT_SECRET is set, attempt JWT validation (HS256 by default).
    if getattr(Config, 'ADMIN_JWT_SECRET', ''):
        try:
            import jwt
            payload = jwt.decode(token, Config.ADMIN_JWT_SECRET, algorithms=[getattr(Config, 'ADMIN_JWT_ALGORITHM', 'HS256')], options={"verify_aud": False})
            if payload.get('role') in ('admin', 'service_role'):
                return
        except Exception:
            pass

    # If ADMIN_JWKS_URL is set, attempt RS256/JWKS validation using PyJWKClient
    jwks_url = getattr(Config, 'ADMIN_JWKS_URL', '')
    if jwks_url:
        try:
            from jwt import PyJWKClient
            import jwt
            jwk_client = PyJWKClient(jwks_url)
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            decode_kwargs = {}
            aud = getattr(Config, 'ADMIN_JWKS_AUDIENCE', '')
            if aud:
                decode_kwargs['audience'] = aud
            payload = jwt.decode(token, signing_key.key, algorithms=[signing_key.alg], options={"verify_aud": bool(aud)}, **decode_kwargs)
            if payload.get('role') in ('admin', 'service_role'):
                return
        except Exception:
            pass

    raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/audit")
async def list_audit(request: Request, limit: int = 100, table_name: str = None, since: str = None):
    """List recent audit entries from `ml_audit_log`.

    Protected by `x-admin-token` header.
    """
    _check_admin(request)
    try:
        init_db()
    except Exception:
        # init_db may raise if DB is not available; return empty list gracefully
        logger.warning('Database not initialized, returning empty audit list')
        return {"entries": []}

    try:
        with get_db_connection() as conn:
            base_q = "SELECT id, table_name, operation, changed_by, changed_at, payload FROM public.ml_audit_log"
            where_clauses = []
            params = {}
            if table_name:
                where_clauses.append("table_name = :table_name")
                params['table_name'] = table_name
            if since:
                where_clauses.append("changed_at >= :since")
                params['since'] = since

            if where_clauses:
                base_q = base_q + " WHERE " + " AND ".join(where_clauses)

            base_q = base_q + " ORDER BY changed_at DESC LIMIT :limit"
            params['limit'] = int(limit)

            q = text(base_q)
            res = conn.execute(q, params)
            rows = res.fetchall()
            entries = [dict(r._mapping) for r in rows]
        return {"entries": entries}
    except Exception as e:
        logger.exception('Failed to fetch audit logs')
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audit/clear")
async def clear_audit(request: Request, older_than_days: int = 365):
    """Delete audit entries older than `older_than_days`.

    Protected by `x-admin-token` header.
    """
    _check_admin(request)
    try:
        init_db()
    except Exception:
        logger.warning('Database not initialized, nothing to clear')
        return {"deleted": 0}

    try:
        with get_db_connection() as conn:
            q = text("DELETE FROM public.ml_audit_log WHERE changed_at < now() - (:days || ' days')::interval RETURNING id")
            res = conn.execute(q, {"days": int(older_than_days)})
            deleted = len(res.fetchall())
        return {"deleted": deleted}
    except Exception as e:
        logger.exception('Failed to clear audit logs')
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audit/verify")
async def verify_audit_chain(request: Request):
    """Verify the immutable runtime_config_audit chain integrity.

    Returns a summary with counts of mismatches and whether the chain is valid.
    Protected by `x-admin-token` header.
    """
    _check_admin(request)
    try:
        init_db()
    except Exception:
        logger.warning('Database not initialized, cannot verify audit chain')
        raise HTTPException(status_code=500, detail='Database not available')

    try:
        with get_db_connection() as conn:
            q = text("""
              SELECT id, config_key, old_value, new_value, actor, source, payload_hash, previous_hash, record_hash
              FROM runtime_config_audit
              ORDER BY id ASC
            """)
            res = conn.execute(q)
            rows = [dict(r._mapping) for r in res.fetchall()]

        previous_record_hash = None
        hash_mismatches = 0
        linkage_mismatches = 0

        for row in rows:
            prev_hash = row.get('previous_hash') or 'GENESIS'
            parts = [
                prev_hash,
                row.get('config_key') or '',
                row.get('old_value') if row.get('old_value') is not None else 'NULL',
                row.get('new_value') or '',
                row.get('actor') or '',
                row.get('source') or '',
                row.get('payload_hash') or '',
            ]
            expected = hashlib.sha256('|'.join(parts).encode('utf-8')).hexdigest()
            if expected != (row.get('record_hash') or ''):
                hash_mismatches += 1

            if row.get('previous_hash') != (previous_record_hash or None):
                linkage_mismatches += 1

            previous_record_hash = row.get('record_hash')

        result = {
            'valid': hash_mismatches == 0 and linkage_mismatches == 0,
            'checkedRows': len(rows),
            'hashMismatches': hash_mismatches,
            'linkageMismatches': linkage_mismatches,
        }
        return result
    except Exception as e:
        logger.exception('Failed to verify audit chain')
        raise HTTPException(status_code=500, detail=str(e))
