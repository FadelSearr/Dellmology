"""Order Flow Heatmap Aggregator

Aggregates raw `order_flow_heatmap` rows into 1-minute buckets and writes
to `order_flow_heatmap_1min`. Provides a simple query helper to retrieve
recent aggregated heatmap for a symbol.
"""
import logging
from datetime import datetime, timezone
from typing import List, Dict

from ..utils.db_utils import get_db_connection
from sqlalchemy import text

logger = logging.getLogger(__name__)


def aggregate_one_minute(symbols: List[str] = None):
    """Aggregate latest raw heatmap into 1-minute table for given symbols."""
    try:
        with get_db_connection() as conn:
            if not symbols:
                rows = conn.execute(text("SELECT DISTINCT symbol FROM order_flow_heatmap ORDER BY symbol LIMIT 50")).fetchall()
                symbols = [r[0] for r in rows]

            for sym in symbols:
                try:
                    # Aggregate into 1-minute buckets for last 5 minutes
                    insert_q = """
                    INSERT INTO order_flow_heatmap_1min (bucket, symbol, price, avg_bid_vol, avg_ask_vol, avg_net_vol, avg_ratio, avg_intensity, trade_count)
                    SELECT date_trunc('minute', time) AS bucket, symbol, price,
                           AVG(bid_volume) AS avg_bid_vol,
                           AVG(ask_volume) AS avg_ask_vol,
                           AVG(net_volume) AS avg_net_vol,
                           AVG(bid_ask_ratio) AS avg_ratio,
                           AVG(intensity) AS avg_intensity,
                           SUM(trade_count) AS trade_count
                    FROM order_flow_heatmap
                    WHERE symbol = :sym
                      AND time > NOW() - INTERVAL '10 minutes'
                    GROUP BY bucket, symbol, price
                    ON CONFLICT (bucket, symbol, price) DO UPDATE SET
                          avg_bid_vol = EXCLUDED.avg_bid_vol,
                          avg_ask_vol = EXCLUDED.avg_ask_vol,
                          avg_net_vol = EXCLUDED.avg_net_vol,
                          avg_ratio = EXCLUDED.avg_ratio,
                          avg_intensity = EXCLUDED.avg_intensity,
                          trade_count = EXCLUDED.trade_count
                    """
                    conn.execute(text(insert_q), {"sym": sym})
                except Exception:
                    logger.exception(f"Aggregation failed for {sym}")
            try:
                conn.commit()
            except Exception:
                pass
    except Exception:
        logger.exception("aggregate_one_minute failed")


def fetch_recent_aggregated(symbol: str, limit: int = 60) -> List[Dict]:
    """Return recent aggregated heatmap rows for a symbol (most recent first)."""
    try:
        with get_db_connection() as conn:
            q = text("SELECT bucket AS time, price, avg_bid_vol, avg_ask_vol, avg_net_vol, avg_ratio, avg_intensity, trade_count FROM order_flow_heatmap_1min WHERE symbol = :sym ORDER BY bucket DESC LIMIT :lim")
            rows = conn.execute(q, {"sym": symbol, "lim": int(limit)}).fetchall()
            return [dict(r._mapping) for r in rows]
    except Exception:
        logger.exception("fetch_recent_aggregated failed")
        return []


if __name__ == '__main__':
    aggregate_one_minute()
