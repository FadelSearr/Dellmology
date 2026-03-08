from fastapi import APIRouter, HTTPException
from typing import List
import logging
from sqlalchemy import text

from dellmology.utils.db_utils import get_db_connection, init_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/aggregates", tags=["aggregates"])


@router.get('/order_flow/heatmap/1min')
def get_order_flow_heatmap_1min(limit: int = 100):
    """Return recent buckets from the continuous aggregate `order_flow_heatmap_1min_mv`.

    This endpoint is read-only and safe to call without admin privileges.
    """
    try:
        init_db()
    except Exception:
        logger.warning('Database not initialized, returning empty result')
        return {'buckets': []}

    try:
        with get_db_connection() as conn:
            q = text("SELECT bucket, symbol, avg_bid_vol, avg_ask_vol, avg_net_vol, avg_ratio, avg_intensity FROM public.order_flow_heatmap_1min_mv ORDER BY bucket DESC LIMIT :limit")
            res = conn.execute(q, {'limit': int(limit)})
            rows = res.fetchall()
            entries = [dict(r._mapping) for r in rows]
        return {'buckets': entries}
    except Exception as e:
        logger.exception('Failed to query continuous aggregate')
        raise HTTPException(status_code=500, detail=str(e))
