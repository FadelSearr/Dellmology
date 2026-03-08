from fastapi import APIRouter, Query
from typing import List, Dict
from datetime import datetime

router = APIRouter(prefix="/market", tags=["market"])


@router.get('/screener')
async def screener(mode: str = Query('swing', regex='^(swing|daytrade|custom)$'), limit: int = 25):
    """Mock screener endpoint returning sample symbols and scores.

    This endpoint is intentionally simple and returns deterministic sample data
    so the frontend can render the Screener UI while the real engine is integrated.
    """
    now = datetime.utcnow().isoformat() + 'Z'
    base = [
        {'symbol': 'BBCA', 'score': 92.3, 'z_score': 2.4, 'volume': 120000, 'last_price': 8800},
        {'symbol': 'ASII', 'score': 78.1, 'z_score': -0.5, 'volume': 45000, 'last_price': 6200},
        {'symbol': 'TLKM', 'score': 81.5, 'z_score': 1.2, 'volume': 98000, 'last_price': 3300},
        {'symbol': 'GOTO', 'score': 65.2, 'z_score': 0.4, 'volume': 210000, 'last_price': 230},
        {'symbol': 'BMRI', 'score': 87.0, 'z_score': 1.9, 'volume': 76000, 'last_price': 6600},
    ]

    # simple mode adjustments
    if mode == 'daytrade':
        for x in base:
            x['score'] = round(x['score'] * 0.9, 2)
    if mode == 'custom':
        # return same but limited
        base = base[:min(limit, len(base))]

    return {
        'mode': mode,
        'generated_at': now,
        'results': base[:limit]
    }
"""
Advanced Screener API Module
Provides REST endpoints for the Dellmology advanced stock screener
"""

import logging
from fastapi import APIRouter, HTTPException, Query, Request, Depends
from typing import List, Dict, Optional
from datetime import datetime
from pydantic import BaseModel

from dellmology.analysis.screener import AdvancedScreener, ScreenerMode, StockScore
from dellmology.utils.db_utils import (
    init_db,
    fetch_recent_trades,
    fetch_broker_flows,
    fetch_ohlc_data,
    fetch_all_symbols,
    get_db_health,
    fetch_order_book,
    fetch_anomalies,
)

import redis
import json
import time

logger = logging.getLogger(__name__)

# router uses /api prefix so endpoints like /api/screen remain unchanged
router = APIRouter(prefix="/api", tags=["screener"])

# initialize screener instance
screener = AdvancedScreener()
try:
    init_db()
except Exception as e:
    logger.warning(f"Database init failed: {e}, will use fallback mock data")

# redis cache client (optional)
try:
    redis_client = redis.Redis(host='localhost', port=6379, db=2)
    redis_client.ping()
    logging.info("Redis connected for screener cache")
except Exception as e:
    redis_client = None
    logging.warning(f"Redis not available for screener: {e}")


def cache_get(key: str):
    if not redis_client:
        return None
    val = redis_client.get(key)
    if val:
        return json.loads(val)
    return None


def cache_set(key: str, value, ttl: int = 30):
    if not redis_client:
        return
    redis_client.setex(key, ttl, json.dumps(value))


# --- Simple in-memory rate limiter (per-IP) ---
_rate_buckets: Dict[str, List[float]] = {}
_RATE_LIMIT = 10  # requests
_RATE_WINDOW = 60  # seconds

def rate_limit_dep(request: Request):
    # note: this is intentionally simple; for production use Redis or similar shared store
    now = time.time()
    ip = request.client.host if request.client else "unknown"
    arr = _rate_buckets.get(ip, [])
    # prune old
    pruned = [t for t in arr if now - t < _RATE_WINDOW]
    if len(pruned) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    pruned.append(now)
    _rate_buckets[ip] = pruned
    return None


class ScreeningRequest(BaseModel):
    mode: str = "DAYTRADE"  # DAYTRADE, SWING, CUSTOM
    min_score: float = 0.6
    symbols: Optional[List[str]] = None
    include_analysis: bool = True


class StockScoreResponse(BaseModel):
    symbol: str
    score: float
    rank: int
    technical_score: float
    flow_score: float
    pressure_score: float
    volatility_score: float
    anomaly_score: float
    ai_consensus: float
    current_price: float
    volatility_percent: float
    haka_ratio: float
    broker_net_value: int
    top_broker: str
    risk_reward_ratio: float
    recommendation: str
    reason: str
    pattern_matches: List[str]
    anomalies_detected: List[str]


class ScreeningResponse(BaseModel):
    mode: str
    timestamp: str
    total_scanned: int
    results: List[StockScoreResponse]
    top_pick: Optional[StockScoreResponse]
    statistics: Dict
    ai_narrative: Optional[str] = None


@router.get("/health")
async def health_check():
    """Simple health endpoint for the screener service"""
    db_health = get_db_health()
    return {
        "status": "healthy" if db_health.get('connected') else "degraded",
        "database": db_health,
        "timestamp": datetime.now().isoformat(),
    }


@router.post("/screen", response_model=ScreeningResponse)
async def run_screening(request: ScreeningRequest, _=Depends(rate_limit_dep)):
    try:
        # caching key
        cache_key = f"screen:{request.mode}:{request.min_score}:{','.join(request.symbols or [])}"
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

        # Basic golden-record validation (anchor stocks)
        try:
            from dellmology.data_pipeline.global_market_aggregator import fetch_anchor_prices
            from dellmology.utils.db_utils import validate_golden_record, save_signal_snapshot
            anchor_symbols = ["BBCA", "ASII", "TLKM"]
            public_prices = fetch_anchor_prices([s + ".JK" for s in anchor_symbols])
            validation = validate_golden_record(anchor_symbols, public_prices, threshold=0.02)
            kill_switch_triggered = not all(validation.values())
        except Exception:
            validation = {}
            kill_switch_triggered = False

        mode = ScreenerMode[request.mode.upper()]
        screener.set_mode(mode)

        symbols = request.symbols or get_all_symbols()
        stock_data = generate_screening_data(symbols=symbols)

        # Run champion/challenger analysis
        from dellmology.analysis.screener import ScreenerConfig, run_multi_version_analysis
        champion_config = ScreenerConfig(mode=mode)
        challenger_config = ScreenerConfig(mode=mode, min_technical_score=0.75)
        multi_results = run_multi_version_analysis(stock_data, champion_config, challenger_config)

        # Build response from champion results
        response_results = []
        for r in multi_results.get('champion', []):
            # r is a dict produced by asdict from StockScore
            response_results.append(StockScoreResponse(
                symbol=r.get('symbol'),
                score=r.get('score', 0.0),
                rank=r.get('rank', 0),
                technical_score=r.get('technical_score', 0.0),
                flow_score=r.get('flow_score', 0.0),
                pressure_score=r.get('pressure_score', 0.0),
                volatility_score=r.get('volatility_score', 0.0),
                anomaly_score=r.get('anomaly_score', 0.0),
                ai_consensus=r.get('ai_consensus', 0.0),
                current_price=r.get('current_price', 0.0),
                volatility_percent=r.get('volatility_percent', 0.0),
                haka_ratio=r.get('haka_ratio', 0.0),
                broker_net_value=r.get('broker_net_value', 0),
                top_broker=r.get('top_broker', ''),
                risk_reward_ratio=r.get('risk_reward_ratio', 0.0),
                recommendation=("BLOCKED" if kill_switch_triggered else r.get('recommendation', 'HOLD')),
                reason=("Golden-record validation failed" if kill_switch_triggered else r.get('reason', '')),
                pattern_matches=r.get('pattern_matches', []),
                anomalies_detected=r.get('anomalies_detected', []),
            ))

        stats = {
            "avg_score": sum(rr.score for rr in response_results) / (len(response_results) or 1),
            "max_score": max((rr.score for rr in response_results), default=0),
            "min_score": min((rr.score for rr in response_results), default=0),
            "bullish_count": sum(1 for rr in response_results if "BUY" in rr.recommendation),
            "bearish_count": sum(1 for rr in response_results if "SELL" in rr.recommendation),
            "avg_volatility": sum(rr.volatility_percent for rr in response_results) / (len(response_results) or 1),
            "avg_rr_ratio": sum(rr.risk_reward_ratio for rr in response_results) / (len(response_results) or 1),
            "kill_switch_triggered": kill_switch_triggered,
            "golden_record_validation": validation,
            "multi_version_comparison": multi_results.get('comparison', []),
        }

        ai_text = None
        if request.include_analysis and response_results:
            try:
                from dellmology.intelligence.ai_narrative import generate_narrative
                ai_text = generate_narrative({
                    "stats": stats,
                    "top_pick": response_results[0] if response_results else None,
                    "results": [r.model_dump() for r in response_results],
                }, symbol=response_results[0].symbol if response_results else None)
            except Exception as ex:
                logger.warning(f"AI narrative generation failed: {ex}")
                ai_text = None

        # Save snapshots for actionable signals
        try:
            from dellmology.utils.db_utils import save_signal_snapshot
            for r in response_results:
                if r.recommendation in ["BUY", "SELL", "STRONG_BUY", "STRONG_SELL"]:
                    snapshot = {
                        "symbol": r.symbol,
                        "price": r.current_price,
                        "z_score": r.flow_score,
                        "cnn_pattern": r.pattern_matches,
                        "broker_net": r.broker_net_value,
                        "gemini_narrative": ai_text,
                        "score": r.score,
                        "volatility": r.volatility_percent,
                        "anomalies": r.anomalies_detected,
                        "timestamp": datetime.now().isoformat(),
                        "recommendation": r.recommendation,
                        "reason": r.reason,
                    }
                    save_signal_snapshot(snapshot, signal_type=r.recommendation)
        except Exception:
            pass

        final_resp = ScreeningResponse(
            mode=request.mode,
            timestamp=datetime.now().isoformat(),
            total_scanned=len(response_results),
            results=response_results,
            top_pick=response_results[0] if response_results else None,
            statistics=stats,
            ai_narrative=ai_text,
        )

        cache_set(cache_key, final_resp.model_dump(), ttl=30)
        return final_resp
    except Exception as e:
        logger.error(f"Error during screening: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/screen-watch")
async def screen_watch_list(symbols: List[str] = Query(["BBCA", "ASII", "BANK"])):
    try:
        screener.set_mode(ScreenerMode.DAYTRADE)
        stock_data = generate_screening_data(symbols=symbols)
        results = screener.screen_all_stocks(stock_data)
        response_results = [
            {
                "symbol": r.symbol,
                "score": r.score,
                "rank": r.rank,
                "recommendation": r.recommendation,
                "current_price": r.current_price,
                "volatility": r.volatility_percent,
                "pressure": r.pressure_score,
            }
            for r in results
        ]
        return {
            "timestamp": datetime.now().isoformat(),
            "watched_symbols": symbols,
            "results": response_results,
        }
    except Exception as e:
        logger.error(f"Error screening watch list: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Utilities ---


def get_all_symbols() -> List[str]:
    try:
        return fetch_all_symbols()
    except Exception as e:
        logger.warning(f"Failed to fetch symbols from DB: {e}, using fallback list")
        return [
            "BBCA", "ASII", "UNVR", "INDF", "ICBP",  # Blue chips
            "TLKM", "JSMR", "ADRO", "ANTM", "PGAS",  # Sectoral
            "BBRI", "BBNI", "BMRI", "BDMN", "BNBA",  # Banks
            "PROL", "INCO", "TINS", "MEDC", "TOWR",  # Smaller caps
        ]


def generate_screening_data(symbols: List[str]) -> List[Dict]:
    """Create screener payload from real DB-backed market data with deterministic fallback."""
    data: List[Dict] = []

    for symbol in symbols:
        trades = fetch_recent_trades(symbol=symbol, limit=500, lookback_minutes=180)
        ohlc = fetch_ohlc_data(symbol=symbol, interval_minutes=5, lookback_hours=12)
        broker_flows = fetch_broker_flows(symbol=symbol, days=7)
        anomalies = fetch_anomalies(symbol=symbol, lookback_hours=6)

        if not trades and not ohlc:
            continue

        latest_price = 0.0
        if trades:
            latest_price = float(trades[0].get('price') or 0)
        elif ohlc:
            latest_price = float(ohlc[0].get('close') or 0)

        closes = [float(c.get('close') or 0) for c in reversed(ohlc) if c.get('close') is not None]
        atr_percent = 0.0
        if len(closes) >= 2 and latest_price > 0:
            diffs = [abs(closes[i] - closes[i - 1]) for i in range(1, len(closes))]
            atr_percent = (sum(diffs) / len(diffs)) / latest_price * 100

        haka_volume = sum(int(t.get('volume') or 0) for t in trades if str(t.get('trade_type') or '').upper() == 'HAKA')
        haki_volume = sum(int(t.get('volume') or 0) for t in trades if str(t.get('trade_type') or '').upper() == 'HAKI')
        total_volume = sum(int(t.get('volume') or 0) for t in trades)
        denom = haka_volume + haki_volume
        haka_ratio = float(haka_volume) / float(denom) if denom > 0 else 0.5

        patterns: List[Dict] = []
        if len(closes) >= 6:
            momentum = closes[-1] - closes[-6]
            trend_up = momentum > 0
            confidence = min(0.92, 0.6 + (abs(momentum) / max(1.0, closes[-6])) * 3)
            patterns.append({
                "pattern_name": "Momentum Continuation" if trend_up else "Momentum Breakdown",
                "pattern_type": "BULLISH" if trend_up else "BEARISH",
                "confidence": round(confidence, 3),
                "entry_price": latest_price,
                "target_price": latest_price * (1.03 if trend_up else 0.97),
                "stop_loss": latest_price * (0.98 if trend_up else 1.02),
            })

        data.append({
            'symbol': symbol,
            'current_price': latest_price,
            'atr_percent': atr_percent,
            'patterns': patterns,
            'broker_flows': broker_flows,
            'heatmap': {
                'haka_volume': haka_volume,
                'haki_volume': haki_volume,
                'total_volume': total_volume,
                'haka_ratio': haka_ratio,
            },
            'anomalies': anomalies,
        })

    return data


