# Python API Entry Point
"""
Main API application using FastAPI
Dellmology Pro REST API
"""

import logging
from fastapi import FastAPI, Request, HTTPException
import base64
import json as _json
import hmac
import hashlib
from dellmology.utils.jwks import verify_jwt_rs256
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
import sys
from pathlib import Path
import json
import os

# Setup path for imports
sys.path.insert(0, str(Path(__file__).parent))

from config import Config, validate_config, setup_logging
from dellmology.analysis.screener_api import router as screener_router
from dellmology.analysis.runtime_api import router as runtime_router
from dellmology.intelligence.api import router as xai_router
from dellmology.api.audit_api import router as audit_router
from dellmology.api.aggregates_api import router as aggregates_router
from dellmology.api.maintenance_api import router as maintenance_router
from broker_flow import main as broker_flow_main
from exit_whale import main as exit_whale_main
from apscheduler.schedulers.background import BackgroundScheduler
from dellmology.utils.model_retrain_scheduler import start_scheduler, get_status, reschedule
from dellmology.utils.model_retrain_scheduler import start_eval_scheduler, get_eval_status, reschedule_eval
from dellmology.utils.db_utils import init_db, get_db_connection, get_db_health
try:
    import boto3
except Exception:
    boto3 = None
from sqlalchemy import text
from dellmology.models.model_registry import registry as model_registry
from dellmology.models import retrain_manager
from dellmology.backtest.backtest_runner import run_backtest

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)

# Create FastAPI app
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle manager replacing deprecated on_event startup."""
    logger.info("Starting Dellmology API...")
    if not validate_config():
        logger.error("Configuration validation failed!")
        raise RuntimeError("Invalid configuration")
    logger.info("Configuration validated successfully")

    scheduler = BackgroundScheduler()
    scheduler.add_job(lambda: broker_flow_main(), 'cron', hour=18, minute=0, id='broker_flow')
    scheduler.add_job(lambda: exit_whale_main(), 'cron', hour=18, minute=15, id='exit_whale')
    # Daily champion/challenger evaluation and auto-promote (after market close)
    def _auto_promote_job():
        try:
            logger.info('Running scheduled champion/challenger evaluation')
            status = model_registry.get_status()
            challenger = status.get('challenger')
            if not challenger:
                logger.info('No challenger present, skipping auto-promote')
                return
            # run backtest for challenger
            from dellmology.backtest.backtest_runner import run_backtest
            start = Config.BACKTEST_START_DATE
            end = Config.BACKTEST_END_DATE
            metrics = run_backtest(challenger, start, end)
            trades = int(metrics.get('trades', 0) or 0)
            net = metrics.get('net_return_pct')
            logger.info(f'Challenger backtest metrics: trades={trades} net={net}')
            if trades >= int(Config.PROMOTE_MIN_TRADES) and net is not None and float(net) >= float(Config.PROMOTE_MIN_NET_RETURN):
                ok = model_registry.promote_challenger()
                logger.info(f'Auto-promote result: {ok}')
            else:
                logger.info('Challenger did not meet promotion thresholds')
        except Exception:
            logger.exception('Auto-promote job failed')

    scheduler.add_job(_auto_promote_job, 'cron', hour=19, minute=0, id='auto_promote')
    scheduler.start()
    logger.info("Scheduled broker flow job (18:00 daily)")
    logger.info("Scheduled exit whale detection job (18:15 daily)")

    # Schedule automated model retraining (default: weekdays 17:00)
    try:
        # Start retraining scheduler with default cron (5pm weekdays)
        start_scheduler(lambda epochs=5: model_registry.trigger_retrain(epochs=epochs))
        logger.info("Model retraining scheduler initialized")
    except Exception:
        logger.exception("Failed to initialize model retraining scheduler")

    try:
        # Start evaluation scheduler (default daily 19:00) — read cron from env or use default
        eval_cron = os.getenv('RETRAIN_EVAL_CRON', '0 19 * * *')
        # By default do not auto-promote on scheduled runs; use API to enable
        start_eval_scheduler(lambda: model_registry.evaluate_and_promote(auto_promote=False), eval_cron)
        logger.info(f"Model evaluation scheduler initialized with cron {eval_cron}")
    except Exception:
        logger.exception("Failed to initialize evaluation scheduler")

    # Start Telegram UPS notifier if configured
    try:
        from dellmology.telegram.notifier import UPSNotifier
        notifier = UPSNotifier()
        notifier.start()
        logger.info('Telegram UPS notifier started (if credentials present)')
    except Exception:
        logger.exception('Failed to start UPS notifier')

    try:
        yield
    finally:
        try:
            scheduler.shutdown(wait=False)
            logger.info("Scheduler shut down")
        except Exception:
            pass


app = FastAPI(
    title="Dellmology Pro API",
    description="Advanced stock market analysis platform",
    version="2.0.0",
    lifespan=lifespan,
)


def _require_admin(request: Request):
    """Validate admin token from `x-admin-token` or `Authorization: Bearer <token>`"""
    token = request.headers.get('x-admin-token')
    if not token:
        auth = request.headers.get('authorization') or request.headers.get('Authorization')
        if auth and auth.lower().startswith('bearer '):
            token = auth.split(' ', 1)[1].strip()
    # If ADMIN_JWT_SECRET is configured, accept and validate JWTs (HS256)
    if token:
        # Quick path: plain token equality with static ADMIN_TOKEN or ML_ENGINE_KEY
        if token == Config.ADMIN_TOKEN or token == Config.ML_ENGINE_KEY:
            return
        # Try JWT verification if secret is available
        if Config.ADMIN_JWT_SECRET:
            payload = _verify_jwt_hs256(token, Config.ADMIN_JWT_SECRET)
            if payload and isinstance(payload, dict):
                role = payload.get('role') or payload.get('roles')
                if role == 'admin' or role == 'service_role' or (isinstance(role, list) and 'admin' in role):
                    return
        # If JWKS URL configured, try RS256 verification via JWKS
        if Config.ADMIN_JWKS_URL:
            payload = verify_jwt_rs256(token, Config.ADMIN_JWKS_URL, Config.ADMIN_JWKS_AUDIENCE, Config.ADMIN_JWKS_CACHE_TTL)
            if payload and isinstance(payload, dict):
                role = payload.get('role') or payload.get('roles')
                if role == 'admin' or role == 'service_role' or (isinstance(role, list) and 'admin' in role):
                    return
    raise HTTPException(status_code=401, detail='Unauthorized')


def _verify_jwt_hs256(token: str, secret: str):
    """Lightweight HS256 JWT verification without external deps.
    Returns payload dict on success or None on failure.
    """
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header_b, payload_b, sig_b = parts
        def _b64u_decode(x):
            rem = len(x) % 4
            if rem:
                x += '=' * (4 - rem)
            return base64.urlsafe_b64decode(x.encode('utf-8'))

        header = _json.loads(_b64u_decode(header_b))
        alg = header.get('alg', '')
        if alg.upper() != 'HS256':
            return None
        signing_input = (header_b + '.' + payload_b).encode('utf-8')
        expected = hmac.new(secret.encode('utf-8'), signing_input, hashlib.sha256).digest()
        sig = _b64u_decode(sig_b)
        if not hmac.compare_digest(expected, sig):
            return None
        payload = _json.loads(_b64u_decode(payload_b))
        return payload
    except Exception:
        return None


@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    """Best-effort audit of admin requests. Does not block request on failure."""
    is_admin = False
    try:
        token = request.headers.get('x-admin-token') or request.headers.get('authorization')
        if token and token.startswith('Bearer '):
            token = token.split(' ', 1)[1].strip()
        if token and (token == Config.ADMIN_TOKEN or token == Config.ML_ENGINE_KEY):
            is_admin = True
        elif token and Config.ADMIN_JWT_SECRET:
            payload = _verify_jwt_hs256(token, Config.ADMIN_JWT_SECRET)
            if payload and (payload.get('role') == 'admin' or payload.get('role') == 'service_role' or (isinstance(payload.get('role'), list) and 'admin' in payload.get('role'))):
                is_admin = True
    except Exception:
        is_admin = False

    # Read body safely for logging and restore for downstream handlers
    body_bytes = b''
    try:
        body_bytes = await request.body()
    except Exception:
        body_bytes = b''

    # Re-insert body for downstream
    async def receive_gen():
        more_body = False
        return {"type": "http.request", "body": body_bytes, "more_body": more_body}

    try:
        request._receive = receive_gen  # type: ignore[attr-defined]
    except Exception:
        pass

    response = await call_next(request)

    if is_admin:
        # Best-effort write to audit table
        try:
            init_db()
            payload_text = ''
            if body_bytes:
                try:
                    payload_text = body_bytes.decode('utf-8')
                except Exception:
                    payload_text = '[binary]'
            if len(payload_text) > 4000:
                payload_text = payload_text[:4000] + '...'
            with get_db_connection() as conn:
                # If running against Supabase with RLS, set a session var so
                # service-role/admin operations can be recognized by DB policies.
                try:
                    conn.execute(text("SELECT set_config('dellmology.is_service_role','true', true)"))
                except Exception:
                    # Ignore if DB does not allow set_config or variable not defined
                    pass
                try:
                    # Set current app user for DB-level audit triggers
                    conn.execute(text("SELECT set_config('app.current_user','admin', true)"))
                except Exception:
                    pass

                q = text("INSERT INTO public.ml_audit_log (table_name, operation, changed_by, payload) VALUES (:table_name, :op, :user, :payload)")
                conn.execute(q, {
                    'table_name': request.url.path,
                    'op': request.method,
                    'user': 'admin',
                    'payload': payload_text
                })
        except Exception:
            logger.exception('Failed to write audit log')

    return response

@app.get("/models/status")
async def get_model_status():
    """Return champion/challenger status and metrics"""
    return model_registry.get_status()

@app.post("/models/retrain")
async def retrain_model(request: Request, epochs: int = 5):
    """Trigger an asynchronous retrain job. Returns job id."""
    _require_admin(request)
    job_id = model_registry.trigger_retrain(epochs=epochs)
    return {"job_id": job_id, "status": "started"}


@app.get('/models/checkpoints')
async def list_checkpoints():
    return {'checkpoints': retrain_manager.list_checkpoints()}


@app.post('/models/checkpoint')
async def save_checkpoint(request: Request):
    _require_admin(request)
    body = await request.json()
    model_name = body.get('model_name')
    metrics = body.get('metrics', {})
    name = retrain_manager.save_checkpoint(model_name, metrics, metadata=body.get('metadata'))
    return {'saved': True, 'name': name}


@app.post('/models/backtest')
async def models_backtest(request: Request):
    _require_admin(request)
    body = await request.json()
    model_name = body.get('model_name')
    start_date = body.get('start_date') or '2023-01-01'
    end_date = body.get('end_date') or datetime.utcnow().date().isoformat()
    result = run_backtest(model_name, start_date, end_date)
    return {'backtest': result}

@app.post("/models/promote")
async def promote_model(request: Request):
    """Promote current challenger to champion.
    Body (json): { "require_backtest": bool, "start_date": str, "end_date": str }
    If require_backtest is true, run backtest on the challenger and only promote if
    the net_return_pct meets `Config.PROMOTE_MIN_NET_RETURN`.
    """
    _require_admin(request)
    body = await request.json()
    require_backtest = bool(body.get('require_backtest', False))
    start_date = body.get('start_date') or Config.BACKTEST_START_DATE
    end_date = body.get('end_date') or Config.BACKTEST_END_DATE

    if require_backtest:
        status = model_registry.get_status()
        challenger = status.get('challenger')
        if not challenger:
            return {"promoted": False, "reason": "no_challenger_present"}
        # Run backtest on the challenger and evaluate metrics
        metrics = run_backtest(challenger, start_date, end_date)
        net = metrics.get('net_return_pct')
        trades = int(metrics.get('trades', 0)) if metrics.get('trades') is not None else 0
        if net is None:
            return {'promoted': False, 'reason': 'backtest_failed', 'metrics': metrics}
        if trades < int(Config.PROMOTE_MIN_TRADES):
            return {'promoted': False, 'reason': 'insufficient_trades', 'metrics': metrics}
        if float(net) < float(Config.PROMOTE_MIN_NET_RETURN):
            return {'promoted': False, 'reason': 'insufficient_performance', 'metrics': metrics}

    ok = model_registry.promote_challenger()
    return {"promoted": ok}


@app.post('/models/apply_checkpoint')
async def apply_checkpoint(request: Request):
    """Apply a saved checkpoint as the current challenger.

    Body: { "name": "checkpoint_name" }
    Protected by admin token.
    """
    _require_admin(request)
    body = await request.json()
    name = body.get('name')
    if not name:
        raise HTTPException(status_code=400, detail='name required')

    chk = retrain_manager.load_checkpoint(name)
    if not chk:
        return {'applied': False, 'reason': 'not_found'}

    # Set as challenger in registry
    try:
        with model_registry._lock:
            model_registry.challenger = chk.get('model_name') or f"checkpoint_{name}"
            model_registry.challenger_metrics = chk.get('metrics', {})
            model_registry.challenger_checkpoint = name
    except Exception:
        raise HTTPException(status_code=500, detail='failed_to_apply')

    # Best-effort persist to DB
    try:
        with model_registry._lock:
            with model_registry:
                pass
    except Exception:
        pass

    return {'applied': True, 'name': name}

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(screener_router)
app.include_router(runtime_router)
app.include_router(xai_router)
app.include_router(audit_router)
app.include_router(aggregates_router)
app.include_router(maintenance_router)





@app.get("/health")
async def health_check():
    """Health check endpoint"""
    health = {
        "status": "healthy",
        "version": "2.0.0",
        "service": "dellmology-api",
        "database": None,
        "s3": None
    }
    try:
        dbh = get_db_health()
        health['database'] = dbh
        if not dbh.get('connected'):
            health['status'] = 'degraded'
    except Exception:
        health['database'] = {'connected': False}
        health['status'] = 'degraded'

    # Check S3/MinIO if configured
    try:
        bucket = os.getenv('AWS_S3_BUCKET') or os.getenv('S3_BUCKET')
        access = os.getenv('AWS_ACCESS_KEY_ID')
        secret = os.getenv('AWS_SECRET_ACCESS_KEY')
        endpoint = os.getenv('S3_ENDPOINT')
        if boto3 and access and secret and bucket:
            session = boto3.session.Session()
            s3 = session.client('s3', aws_access_key_id=access, aws_secret_access_key=secret, endpoint_url=endpoint)
            try:
                s3.head_bucket(Bucket=bucket)
                health['s3'] = {'bucket': bucket, 'accessible': True}
            except Exception:
                health['s3'] = {'bucket': bucket, 'accessible': False}
                health['status'] = 'degraded'
        else:
            health['s3'] = {'configured': False}
    except Exception:
        health['s3'] = {'accessible': False}
        health['status'] = 'degraded'

    return health


@app.get("/config")
async def get_config_endpoint():
    """Get current configuration (sanitized)"""
    config = Config.to_dict()
    # Hide sensitive data
    for key in ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'REDIS_HOST']:
        if key in config:
            config[key] = '***' if config[key] else None
    return config


@app.post('/ups')
async def ups_event(request: Request):
    """Receive lightweight UPS/heartbeat/status events from services or webhooks.
    Body: { source: str, type: str, payload: dict }
    Saves events to `logs/ups_events.jsonl`.
    """
    body = await request.json()
    source = body.get('source', 'unknown')
    ev_type = body.get('type', 'event')
    payload = body.get('payload', {})

    logs_dir = Path(__file__).parent / 'logs'
    logs_dir.mkdir(parents=True, exist_ok=True)
    out_file = logs_dir / 'ups_events.jsonl'

    entry = {
        'ts': datetime.utcnow().isoformat() + 'Z',
        'source': source,
        'type': ev_type,
        'payload': payload
    }
    try:
        with out_file.open('a', encoding='utf-8') as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + '\n')
    except Exception:
        logger.exception('Failed to write UPS event')
        raise HTTPException(status_code=500, detail='failed_to_record')

    return {'recorded': True}


@app.get('/ups')
async def list_ups(limit: int = 50):
    """Return last N UPS events from the local logfile."""
    logs_dir = Path(__file__).parent / 'logs'
    out_file = logs_dir / 'ups_events.jsonl'
    if not out_file.exists():
        return {'events': []}
    try:
        with out_file.open('r', encoding='utf-8') as fh:
            lines = fh.read().splitlines()[-limit:]
            events = [json.loads(l) for l in lines if l.strip()]
        return {'events': events}
    except Exception:
        logger.exception('Failed to read UPS events')
        raise HTTPException(status_code=500, detail='failed_to_read')


if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting API server on {Config.API_HOST}:{Config.API_PORT}")
    uvicorn.run(
        "main:app",
        host=Config.API_HOST,
        port=Config.API_PORT,
        workers=Config.API_WORKERS,
        reload=True
    )
