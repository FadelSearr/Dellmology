from fastapi import APIRouter, HTTPException
import logging
from sqlalchemy import text
import os
import json
import requests

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
            # Prefer direct relation check to avoid TimescaleDB metadata inconsistencies
            exists_q = text("SELECT 1 FROM pg_class WHERE relname = :view AND relkind = 'm'")
            for v in targets:
                if v not in known:
                    results[v] = {'skipped': True, 'reason': 'unknown_view'}
                    continue
                try:
                    # Use a fresh connection for each view check and CALL to isolate transactions
                    with get_db_connection() as single_conn:
                        r = single_conn.execute(exists_q, {'view': v}).fetchone()
                        if not r:
                            results[v] = {'skipped': True, 'reason': 'view_not_present'}
                            continue
                        single_conn.execute(text("CALL refresh_continuous_aggregate(:view, NULL, NULL)"), {'view': v})
                        results[v] = {'refreshed': True}
                except Exception as ie:
                    logger.exception('Failed to refresh %s', v)
                    results[v] = {'refreshed': False, 'error': str(ie)}

        return {'results': results}
    except Exception as e:
        logger.exception('Failed refresh_continuous_aggregates')
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/retrain-status')
def retrain_status():
    """Return current retrain scheduler status."""
    try:
        from dellmology.utils.model_retrain_scheduler import get_status
        return get_status()
    except Exception as e:
        logger.exception('Failed to get retrain status')
        raise HTTPException(status_code=500, detail=str(e))


@router.post('/retrain-schedule')
def retrain_schedule(body: dict):
    """Update retrain schedule.

    Body: { "cron": "<min hour day month dow>", "epochs": 5 }
    """
    cron = body.get('cron')
    epochs = int(body.get('epochs', 5))
    if not cron:
        raise HTTPException(status_code=400, detail='cron required')
    try:
        from dellmology.utils.model_retrain_scheduler import reschedule
        reschedule(cron, epochs=epochs)
        return {'updated': True, 'cron': cron}
    except Exception as e:
        logger.exception('Failed to update retrain schedule')
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/retrain-eval-status')
def retrain_eval_status():
    """Return evaluation scheduler status and next run time."""
    try:
        from dellmology.utils.model_retrain_scheduler import get_eval_status
        return get_eval_status()
    except Exception as e:
        logger.exception('Failed to get eval status')
        raise HTTPException(status_code=500, detail=str(e))


@router.post('/retrain-eval-schedule')
def retrain_eval_schedule(body: dict):
    """Update evaluation schedule.

    Body: { "cron": "min hour day month dow", "auto_promote": true }
    """
    cron = body.get('cron')
    auto_promote = bool(body.get('auto_promote', False))
    if not cron:
        raise HTTPException(status_code=400, detail='cron required')
    try:
        from dellmology.utils.model_retrain_scheduler import start_eval_scheduler
        from dellmology.models.model_registry import registry

        # schedule evaluation job that calls registry.evaluate_and_promote
        start_eval_scheduler(lambda: registry.evaluate_and_promote(auto_promote=auto_promote), cron)
        return {'updated': True, 'cron': cron, 'auto_promote': auto_promote}
    except Exception as e:
        logger.exception('Failed to update eval schedule')
        raise HTTPException(status_code=500, detail=str(e))


@router.post('/evaluate-promote')
def evaluate_promote(body: dict | None = None):
    """Evaluate current challenger against champion and optionally promote.

    Body example: { "auto_promote": true }
    """
    try:
        auto = False
        if body and isinstance(body, dict):
            auto = bool(body.get('auto_promote', False))
        from dellmology.models.model_registry import registry
        result = registry.evaluate_and_promote(auto_promote=auto)

        # Best-effort: persist evaluation result to ml_model_evaluations table
        try:
            init_db()
            with get_db_connection() as conn:
                try:
                    insert_q = text(
                        "INSERT INTO public.ml_model_evaluations (model_name, champion, challenger, metrics, passed, created_at) VALUES (:name, :champ, :challenger, :metrics::jsonb, :passed, now())"
                    )
                    conn.execute(insert_q, {
                        'name': result.get('challenger'),
                        'champ': result.get('champion'),
                        'challenger': result.get('challenger'),
                        'metrics': json.dumps(result.get('challenger_metrics', {})),
                        'passed': bool(result.get('passed', False)),
                    })
                except Exception:
                    # Table may not exist in minimal DB; ignore
                    pass
        except Exception:
            logger.debug('DB not available; skipping evaluation persistence')

        # Best-effort: record UPS event to local UPS log (apps/ml-engine/logs/ups_events.jsonl)
        try:
            from pathlib import Path
            logs_dir = Path(__file__).parent.parent.parent / 'logs'
            logs_dir.mkdir(parents=True, exist_ok=True)
            out_file = logs_dir / 'ups_events.jsonl'
            ups_entry = {
                'ts': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
                'source': 'model_evaluation',
                'type': 'evaluation',
                'payload': result
            }
            try:
                with out_file.open('a', encoding='utf-8') as fh:
                    fh.write(json.dumps(ups_entry, ensure_ascii=False) + '\n')
            except Exception:
                logger.exception('Failed to write UPS event for evaluation')

            # Best-effort: send Telegram notification if configured
            try:
                bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
                chat_id = os.getenv('TELEGRAM_CHAT_ID')
                if bot_token and chat_id:
                    # Compose a concise message
                    champ = result.get('champion')
                    chall = result.get('challenger')
                    passed = result.get('passed')
                    metrics = result.get('challenger_metrics') or {}
                    metric_snippet = ''
                    if isinstance(metrics, dict) and metrics:
                        metric_snippet = ' | ' + ', '.join(f"{k}={v}" for k, v in list(metrics.items())[:5])
                    msg = f"Model evaluation: challenger={chall} champion={champ} passed={passed}{metric_snippet}"
                    try:
                        requests.post(f"https://api.telegram.org/bot{bot_token}/sendMessage", json={
                            'chat_id': chat_id,
                            'text': msg
                        }, timeout=10)
                    except Exception:
                        logger.exception('Telegram notify failed')
            except Exception:
                logger.exception('Failed to prepare/send Telegram notification')

        return result
    except Exception as e:
        logger.exception('Failed to evaluate/promote challenger')
        raise HTTPException(status_code=500, detail=str(e))
