from fastapi import APIRouter, HTTPException
import logging
from sqlalchemy import text

from dellmology.utils.db_utils import init_db, get_db_connection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.get('/rls-smoke')
def rls_smoke_check():
    """Run lightweight RLS smoke checks and return role/table/policy info.

    This is safe to call in CI to verify RLS skeletons were applied. It does
    not require admin privileges but will return DB-visible info only.
    """
    try:
        init_db()
    except Exception:
        logger.warning('Database not initialized for RLS smoke check')
        raise HTTPException(status_code=503, detail='database_not_ready')

    try:
        results = {}
        with get_db_connection() as conn:
            # Roles check
            r = conn.execute(text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','service_role')")).fetchall()
            results['roles'] = [row[0] for row in r]

            # Table rowsecurity status for key tables
            tables = [
                'trades','broker_summaries','daily_prices','cnn_predictions','broker_flow',
                'order_flow_heatmap','order_flow_anomalies','order_events','broker_zscore',
                'market_depth','haka_haki_summary'
            ]
            q = text("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename = ANY(:tbls)")
            rows = conn.execute(q, {'tbls': tables}).fetchall()
            results['tables'] = [dict(r._mapping) for r in rows]

            # Policies
            q2 = text(
                "SELECT schemaname, tablename, policyname, permissive, roles, cmd FROM pg_policies WHERE schemaname='public' AND tablename = ANY(:tbls) ORDER BY tablename, policyname"
            )
            p = conn.execute(q2, {'tbls': tables}).fetchall()
            results['policies'] = [dict(r._mapping) for r in p]

        return results
    except Exception as e:
        logger.exception('RLS smoke check failed')
        raise HTTPException(status_code=500, detail=str(e))


@router.post('/refresh-aggregates')
def refresh_continuous_aggregates(view: str | None = None):
    """Refresh or schedule refresh for Timescale continuous aggregates.

    If `view` is provided, attempt to refresh that materialized view; otherwise
    attempt to refresh all known aggregates defined in `db/init/06-performance-aggregates.sql`.
    This call is guarded and will return a helpful message when TimescaleDB
    is not available in the target database.
    """
    try:
        init_db()
    except Exception:
        logger.warning('Database not initialized for refresh_continuous_aggregates')
        raise HTTPException(status_code=503, detail='database_not_ready')

    known = [
        'order_flow_heatmap_1min_mv',
        'order_flow_anomaly_5min_mv',
        'market_depth_summary_hourly_mv'
    ]
    targets = [view] if view else known

    try:
        with get_db_connection() as conn:
            # Ensure TimescaleDB extension exists
            ext = conn.execute(text("SELECT COUNT(*) FROM pg_extension WHERE extname = 'timescaledb'")).scalar()
            if not ext or int(ext) == 0:
                return {'refreshed': False, 'reason': 'timescaledb_not_available'}

            results = {}
            for v in targets:
                if v not in known:
                    results[v] = {'skipped': True, 'reason': 'unknown_view'}
                    continue
                try:
                    # refresh_continuous_aggregate is a PROCEDURE in newer TimescaleDB
                    # Use CALL to invoke it and handle per-view errors gracefully.
                    conn.execute(text("CALL refresh_continuous_aggregate(:view, NULL, NULL)"), {'view': v})
                    results[v] = {'refreshed': True}
                except Exception as ie:
                    logger.exception('Failed to refresh %s', v)
                    results[v] = {'refreshed': False, 'error': str(ie)}

        return {'results': results}
    except Exception as e:
        logger.exception('Failed refresh_continuous_aggregates')
        raise HTTPException(status_code=500, detail=str(e))
