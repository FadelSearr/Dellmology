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
    token = request.headers.get('x-admin-token')
    if not token or token != Config.ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/audit")
async def list_audit(request: Request, limit: int = 100):
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
            q = text("SELECT id, table_name, operation, changed_by, changed_at, payload FROM public.ml_audit_log ORDER BY changed_at DESC LIMIT :limit")
            res = conn.execute(q, {"limit": int(limit)})
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
