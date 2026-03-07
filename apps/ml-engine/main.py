# Python API Entry Point
"""
Main API application using FastAPI
Dellmology Pro REST API
"""

import logging
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
import sys
from pathlib import Path

# Setup path for imports
sys.path.insert(0, str(Path(__file__).parent))

from config import Config, validate_config, setup_logging
from dellmology.analysis.screener_api import router as screener_router
from dellmology.analysis.runtime_api import router as runtime_router
from dellmology.intelligence.api import router as xai_router
from broker_flow import main as broker_flow_main
from exit_whale import main as exit_whale_main
from apscheduler.schedulers.background import BackgroundScheduler
from dellmology.utils.model_retrain_scheduler import schedule_retraining
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
    scheduler.start()
    logger.info("Scheduled broker flow job (18:00 daily)")
    logger.info("Scheduled exit whale detection job (18:15 daily)")

    # Schedule automated model retraining (default: weekdays 17:00)
    try:
        schedule_retraining(lambda: model_registry.trigger_retrain(epochs=5))
        logger.info("Model retraining scheduler initialized")
    except Exception:
        logger.exception("Failed to initialize model retraining scheduler")

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

@app.get("/models/status")
async def get_model_status():
    """Return champion/challenger status and metrics"""
    return model_registry.get_status()

@app.post("/models/retrain")
async def retrain_model(request: Request, epochs: int = 5):
    """Trigger an asynchronous retrain job. Returns job id."""
    # simple admin token protection
    token = request.headers.get('x-admin-token')
    if not token or token != Config.ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    job_id = model_registry.trigger_retrain(epochs=epochs)
    return {"job_id": job_id, "status": "started"}


@app.get('/models/checkpoints')
async def list_checkpoints():
    return {'checkpoints': retrain_manager.list_checkpoints()}


@app.post('/models/checkpoint')
async def save_checkpoint(request: Request):
    token = request.headers.get('x-admin-token')
    if not token or token != Config.ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail='Unauthorized')
    body = await request.json()
    model_name = body.get('model_name')
    metrics = body.get('metrics', {})
    name = retrain_manager.save_checkpoint(model_name, metrics, metadata=body.get('metadata'))
    return {'saved': True, 'name': name}


@app.post('/models/backtest')
async def models_backtest(request: Request):
    token = request.headers.get('x-admin-token')
    if not token or token != Config.ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail='Unauthorized')
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
    token = request.headers.get('x-admin-token')
    if not token or token != Config.ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    body = await request.json()
    require_backtest = bool(body.get('require_backtest', False))
    start_date = body.get('start_date') or Config.BACKTEST_START_DATE
    end_date = body.get('end_date') or Config.BACKTEST_END_DATE

    if require_backtest:
        status = model_registry.get_status()
        challenger = status.get('challenger')
        if not challenger:
            return {"promoted": False, "reason": "no_challenger_present"}
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





@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "service": "dellmology-api"
    }


@app.get("/config")
async def get_config_endpoint():
    """Get current configuration (sanitized)"""
    config = Config.to_dict()
    # Hide sensitive data
    for key in ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'REDIS_HOST']:
        if key in config:
            config[key] = '***' if config[key] else None
    return config


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
