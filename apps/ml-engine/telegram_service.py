import os
import json
import logging
from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import JSONResponse
from typing import Optional, List
from datetime import datetime, timedelta
from telegram_notifier import TelegramNotifier, TelegramAlertManager
from model_retrain_scheduler import start_scheduler, stop_scheduler, get_scheduler
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Dellmology Telegram Service")

notifier = TelegramNotifier()
alert_manager = TelegramAlertManager(notifier)

# In-memory history (replace with database in production)
alert_history: List[dict] = []
MAX_HISTORY = 100


@app.on_event("startup")
async def startup_event():
    """Initialize scheduler on app startup."""
    logger.info("Starting model retrain scheduler...")
    try:
        start_scheduler()
        logger.info("Model retrain scheduler started successfully")
    except Exception as e:
        logger.error(f"Failed to start retrain scheduler: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up scheduler on app shutdown."""
    logger.info("Stopping model retrain scheduler...")
    try:
        stop_scheduler()
        logger.info("Model retrain scheduler stopped")
    except Exception as e:
        logger.error(f"Error stopping scheduler: {e}")


async def verify_auth(authorization: Optional[str] = Header(None)) -> bool:
    """Verify API key"""
    expected_key = os.getenv('ML_ENGINE_KEY', 'test-key-123')
    if not authorization or authorization != f"Bearer {expected_key}":
        return False
    return True


@app.post("/telegram/alert")
async def send_alert(
    payload: dict,
    authorization: Optional[str] = Header(None)
):
    """Send alert to Telegram"""
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        alert_type = payload.get('type')
        symbol = payload.get('symbol')
        data = payload.get('data', {})

        # Route to appropriate handler
        if alert_type == 'trading':
            success = await alert_manager.send_alert_if_cooldown_passed(
                f"{symbol}_trading",
                notifier.send_trading_alert,
                symbol=symbol,
                signal=data.get('signal', 'BUY'),
                price=data.get('price', 0),
                reason=data.get('reason', ''),
                confidence=data.get('confidence', 75)
            )

        elif alert_type == 'market':
            success = await alert_manager.send_alert_if_cooldown_passed(
                f"{symbol}_market",
                notifier.send_market_analysis,
                symbol=symbol,
                regime=data.get('regime', 'NEUTRAL'),
                ups_score=data.get('ups_score', 50),
                whale_activity=data.get('whale_activity', 'None'),
                recommendation=data.get('recommendation', '')
            )

        elif alert_type == 'broker':
            success = await alert_manager.send_alert_if_cooldown_passed(
                f"{symbol}_broker_{data.get('broker_id', '')}",
                notifier.send_broker_alert,
                symbol=symbol,
                broker_id=data.get('broker_id', ''),
                net_value=data.get('net_value', 0),
                z_score=data.get('z_score', 0),
                action=data.get('action', 'TRADING')
            )

        elif alert_type == 'wash_sale':
            success = await alert_manager.send_alert_if_cooldown_passed(
                f"{symbol}_wash_sale",
                notifier.send_wash_sale_alert,
                symbol=symbol,
                wash_sale_score=data.get('wash_sale_score', 0),
                total_volume=data.get('total_volume', 0),
                net_accumulation=data.get('net_accumulation', 0)
            )

        elif alert_type == 'screener':
            success = await notifier.send_screener_results(
                mode=data.get('mode', 'DAYTRADE'),
                stocks=data.get('stocks', []),
                timestamp=data.get('timestamp', datetime.now().isoformat())
            )

        elif alert_type == 'backtest':
            success = await alert_manager.send_alert_if_cooldown_passed(
                f"{symbol}_backtest",
                notifier.send_backtest_report,
                symbol=symbol,
                win_rate=data.get('win_rate', 0),
                total_profit=data.get('total_profit', 0),
                sharpe_ratio=data.get('sharpe_ratio', 0)
            )

        else:
            raise ValueError(f"Unknown alert type: {alert_type}")

        # Add to history
        alert_record = {
            'id': len(alert_history) + 1,
            'type': alert_type,
            'symbol': symbol,
            'success': success,
            'timestamp': datetime.now().isoformat(),
            'data': data
        }
        alert_history.append(alert_record)

        # Keep history size bounded
        if len(alert_history) > MAX_HISTORY:
            alert_history.pop(0)

        return JSONResponse({
            'success': success,
            'alert_id': alert_record['id'],
            'type': alert_type,
            'symbol': symbol,
            'timestamp': alert_record['timestamp']
        })

    except Exception as e:
        logger.error(f"Error sending alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- CNN Training & Prediction API ---

@app.post("/cnn/predict")
async def api_cnn_predict(
    payload: dict,
    authorization: Optional[str] = Header(None)
):
    """Generate a CNN prediction for a symbol and store it in DB."""
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    symbol = payload.get('symbol')
    use_real = payload.get('real', True)
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    from predict import cnn_predict, connect_to_db
    engine = connect_to_db()
    result = cnn_predict(symbol, engine, use_real_model=use_real)
    return JSONResponse({'success': True, 'result': result})


@app.post("/cnn/train")
async def api_cnn_train(
    payload: dict,
    authorization: Optional[str] = Header(None)
):
    """Trigger model training for a symbol (runs asynchronously)."""
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    symbol = payload.get('symbol')
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    # Run training in background thread/process
    import threading, subprocess

    def train_job(sym: str):
        try:
            subprocess.run(["python", "train.py", sym], cwd=os.getcwd())
        except Exception as e:
            logger.error(f"Training job failed: {e}")

    threading.Thread(target=train_job, args=(symbol,)).start()
    return JSONResponse({'success': True, 'message': f'Training started for {symbol}'})


@app.post("/xai/explain")
async def api_xai_explain(
    payload: dict,
    authorization: Optional[str] = Header(None)
):
    """Generate an XAI explanation for the latest window of a symbol."""
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    symbol = payload.get('symbol')
    top_k = int(payload.get('top_k', 10))
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    try:
        from xai_explainer import explain_symbol
        from predict import connect_to_db

        engine = connect_to_db()
        result = explain_symbol(symbol, engine, top_k=top_k)
        return JSONResponse({'success': True, 'explanation': result})
    except FileNotFoundError as fe:
        raise HTTPException(status_code=500, detail=str(fe))
    except Exception as e:
        logger.error(f"XAI explanation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Model Retrain Scheduler Endpoints ---

@app.post("/retrain/trigger")
async def trigger_retrain(
    payload: dict,
    authorization: Optional[str] = Header(None)
):
    """Manually trigger model retrain for a symbol (or all symbols if not specified)."""
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    symbol = payload.get('symbol')
    try:
        scheduler = get_scheduler()
        result = scheduler.trigger_retrain_now(symbol)
        return JSONResponse({'success': True, 'retrain_result': result})
    except Exception as e:
        logger.error(f"Retrain trigger error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/retrain/status")
async def get_retrain_status(authorization: Optional[str] = Header(None)):
    """Get model retrain scheduler status and history."""
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        scheduler = get_scheduler()
        status = scheduler.get_status()
        return JSONResponse({'success': True, 'status': status})
    except Exception as e:
        logger.error(f"Retrain status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/metrics")
async def ingest_metrics(
    payload: dict,
    authorization: Optional[str] = Header(None)
):
    """Ingest model training metrics (can be called by training job).
    Accepts either a single metric dict or a dict with 'history' list for epoch-level records.
    """
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        from predict import connect_to_db
        engine = connect_to_db()

        # If payload contains 'history' (list of epoch dicts), insert each as an epoch record
        if isinstance(payload, dict) and 'history' in payload and isinstance(payload['history'], list):
            symbol = payload.get('symbol')
            inserted = 0
            insert_sql = """
            INSERT INTO model_metrics (symbol, trained_at, training_loss, validation_accuracy, training_time_seconds, model_size_mb, notes)
            VALUES (:symbol, COALESCE(:trained_at, now()), :training_loss, :validation_accuracy, :training_time_seconds, :model_size_mb, :notes);
            """
            with engine.begin() as conn:
                for item in payload['history']:
                    trained_at = item.get('timestamp') or payload.get('trained_at')
                    training_loss = item.get('loss')
                    validation_accuracy = item.get('accuracy')
                    params = {
                        'symbol': symbol,
                        'trained_at': trained_at,
                        'training_loss': training_loss,
                        'validation_accuracy': validation_accuracy,
                        'training_time_seconds': None,
                        'model_size_mb': None,
                        'notes': 'epoch'
                    }
                    conn.execute(text(insert_sql), params)
                    inserted += 1
            return JSONResponse({'success': True, 'inserted': inserted})

        # Otherwise expect a single metric dict
        symbol = payload.get('symbol')
        trained_at = payload.get('trained_at')
        training_loss = payload.get('training_loss')
        validation_accuracy = payload.get('validation_accuracy')
        training_time_seconds = payload.get('training_time_seconds')
        model_size_mb = payload.get('model_size_mb')
        notes = payload.get('notes', '')

        if not symbol:
            raise HTTPException(status_code=400, detail="symbol is required")

        insert_sql = """
        INSERT INTO model_metrics (symbol, trained_at, training_loss, validation_accuracy, training_time_seconds, model_size_mb, notes)
        VALUES (:symbol, COALESCE(:trained_at, now()), :training_loss, :validation_accuracy, :training_time_seconds, :model_size_mb, :notes);
        """
        params = {
            'symbol': symbol,
            'trained_at': trained_at,
            'training_loss': training_loss,
            'validation_accuracy': validation_accuracy,
            'training_time_seconds': training_time_seconds,
            'model_size_mb': model_size_mb,
            'notes': notes,
        }
        with engine.begin() as conn:
            conn.execute(text(insert_sql), params)

        return JSONResponse({'success': True})
    except Exception as e:
        logger.error(f"Failed to ingest metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/metrics")
async def get_metrics(
    symbol: Optional[str] = None,
    limit: int = 30,
    authorization: Optional[str] = Header(None)
):
    """Query recent model metrics."""
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        from predict import connect_to_db
        engine = connect_to_db()
        with engine.connect() as conn:
            if symbol:
                rows = conn.execute(text("SELECT * FROM model_metrics WHERE symbol = :sym ORDER BY trained_at DESC LIMIT :lim"), {'sym': symbol, 'lim': limit}).fetchall()
            else:
                rows = conn.execute(text("SELECT * FROM model_metrics ORDER BY trained_at DESC LIMIT :lim"), {'lim': limit}).fetchall()

        results = [dict(r) for r in rows]
        return JSONResponse({'success': True, 'metrics': results})
    except Exception as e:
        logger.error(f"Failed to query metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/telegram/history")
async def get_alert_history(
    symbol: Optional[str] = None,
    limit: int = 10,
    authorization: Optional[str] = Header(None)
):
    """Get alert history"""
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    history = alert_history

    if symbol:
        history = [a for a in history if a['symbol'] == symbol]

    return history[-limit:]


@app.get("/telegram/config")
async def get_config(authorization: Optional[str] = Header(None)):
    """Get Telegram configuration status"""
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    return {
        'configured': bool(notifier.bot_token and notifier.chat_id),
        'bot_token_present': bool(notifier.bot_token),
        'chat_id_present': bool(notifier.chat_id),
        'total_alerts_sent': len(alert_history),
        'successful_alerts': sum(1 for a in alert_history if a.get('success', False))
    }


# --- Model Alert Thresholds ---

@app.post("/model-alerts/thresholds")
async def set_alert_thresholds(
    payload: dict,
    authorization: Optional[str] = Header(None)
):
    """Set or update alert thresholds for a symbol."""
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    symbol = payload.get('symbol')
    min_accuracy = payload.get('min_accuracy', 80)
    max_loss = payload.get('max_loss', 0.15)
    alert_on_retrain_failure = payload.get('alert_on_retrain_failure', True)
    notify_telegram = payload.get('notify_telegram', True)
    notify_email = payload.get('notify_email')

    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    try:
        from predict import connect_to_db
        engine = connect_to_db()
        upsert_sql = """
        INSERT INTO model_alert_thresholds (symbol, min_accuracy, max_loss, alert_on_retrain_failure, notify_telegram, notify_email, updated_at)
        VALUES (:symbol, :min_accuracy, :max_loss, :alert_on_retrain_failure, :notify_telegram, :notify_email, now())
        ON CONFLICT (symbol) DO UPDATE SET
            min_accuracy = :min_accuracy,
            max_loss = :max_loss,
            alert_on_retrain_failure = :alert_on_retrain_failure,
            notify_telegram = :notify_telegram,
            notify_email = :notify_email,
            updated_at = now();
        """
        params = {
            'symbol': symbol,
            'min_accuracy': min_accuracy,
            'max_loss': max_loss,
            'alert_on_retrain_failure': alert_on_retrain_failure,
            'notify_telegram': notify_telegram,
            'notify_email': notify_email,
        }
        with engine.begin() as conn:
            conn.execute(text(upsert_sql), params)

        logger.info(f"Alert thresholds saved for {symbol}")
        return JSONResponse({'success': True, 'message': f'Thresholds saved for {symbol}'})
    except Exception as e:
        logger.error(f"Failed to save alert thresholds: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/model-alerts/thresholds")
async def get_alert_thresholds(
    symbol: str,
    authorization: Optional[str] = Header(None)
):
    """Get alert thresholds for a symbol."""
    if not await verify_auth(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        from predict import connect_to_db
        engine = connect_to_db()
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT * FROM model_alert_thresholds WHERE symbol = :sym"),
                {'sym': symbol}
            ).fetchone()

        if row:
            return JSONResponse({'success': True, 'thresholds': dict(row)})
        else:
            # Return defaults
            return JSONResponse({
                'success': True,
                'thresholds': {
                    'symbol': symbol,
                    'min_accuracy': 80,
                    'max_loss': 0.15,
                    'alert_on_retrain_failure': True,
                    'notify_telegram': True,
                }
            })
    except Exception as e:
        logger.error(f"Failed to query alert thresholds: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check"""
    return {
        'status': 'ok',
        'service': 'telegram-notifier',
        'timestamp': datetime.now().isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
