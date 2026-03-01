"""
Advanced Screener API endpoint
Provides real-time stock screening with multiple factors
"""

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from typing import List, Dict, Optional
from datetime import datetime
import logging
import asyncio
from advanced_screener import AdvancedScreener, ScreenerMode, StockScore
from pydantic import BaseModel
import redis
import json

app = FastAPI(title="Advanced Screener API", version="1.0.0")
logger = logging.getLogger(__name__)

# Initialize screener
screener = AdvancedScreener()

# Redis cache client
try:
    redis_client = redis.Redis(host='localhost', port=6379, db=2)
    redis_client.ping()
    logging.info("Redis connected for screener cache")
except Exception as e:
    redis_client = None
    logging.warning(f"Redis not available for screener: {e}")

# helper functions

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

# Screening results cache (fallback if redis down)
screening_cache = {}


class ScreeningRequest(BaseModel):
    mode: str = "DAYTRADE"  # DAYTRADE, SWING, CUSTOM
    min_score: float = 0.6
    symbols: Optional[List[str]] = None  # If None, scan all
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


@app.get("/")
async def root():
    return {
        "service": "Advanced Stock Screener",
        "version": "1.0.0",
        "endpoints": ["/api/screen", "/api/screen-status", "/api/screen-history"],
    }


@app.post("/api/screen", response_model=ScreeningResponse)
async def run_screening(request: ScreeningRequest):
    """
    Run advanced multi-factor stock screening
    
    Supports modes:
    - DAYTRADE: High volatility, strong immediate momentum, tight stops
    - SWING: Broker accumulation, strong patterns, good R:R ratio
    - CUSTOM: User-defined parameters
    """
    try:
        cache_key = f"screen:{request.mode}:{request.min_score}:{','.join(request.symbols or [])}"
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

        # Set screener mode
        mode = ScreenerMode[request.mode.upper()]
        screener.set_mode(mode)
        
        # TODO: Fetch actual stock data from database
        # For now, generate mock data
        mock_stocks = generate_mock_screening_data(
            symbols=request.symbols or get_all_symbols()
        )
        
        # Run screening
        results = screener.screen_all_stocks(mock_stocks)
        
        # Convert to response format
        response_results = [
            StockScoreResponse(
                symbol=r.symbol,
                score=r.score,
                rank=r.rank,
                technical_score=r.technical_score,
                flow_score=r.flow_score,
                pressure_score=r.pressure_score,
                volatility_score=r.volatility_score,
                anomaly_score=r.anomaly_score,
                ai_consensus=r.ai_consensus,
                current_price=r.current_price,
                volatility_percent=r.volatility_percent,
                haka_ratio=r.haka_ratio,
                broker_net_value=r.broker_net_value,
                top_broker=r.top_broker,
                risk_reward_ratio=r.risk_reward_ratio,
                recommendation=r.recommendation,
                reason=r.reason,
                pattern_matches=r.pattern_matches,
                anomalies_detected=r.anomalies_detected,
            )
            for r in results
        ]
        # cache the response object
        final_resp = ScreeningResponse(
            mode=request.mode,
            timestamp=datetime.now().isoformat(),
            total_scanned=len(response_results),
            results=response_results,
            top_pick=response_results[0] if response_results else None,
            statistics={
                "avg_score": sum(r.score for r in response_results) / (len(response_results) or 1),
                "max_score": max((r.score for r in response_results), default=0),
                "min_score": min((r.score for r in response_results), default=0),
                "bullish_count": sum(1 for r in response_results if r.recommendation.includes("BUY")),
                "bearish_count": sum(1 for r in response_results if r.recommendation.includes("SELL")),
                "avg_volatility": sum(r.volatility_percent for r in response_results) / (len(response_results) or 1),
                "avg_rr_ratio": sum(r.risk_reward_ratio for r in response_results) / (len(response_results) or 1),
            },
        )
        cache_set(cache_key, final_resp, ttl=30)
        return final_resp
        
        # Calculate statistics
        if response_results:
            stats = {
                "avg_score": sum(r.score for r in response_results) / len(response_results),
                "max_score": max(r.score for r in response_results),
                "min_score": min(r.score for r in response_results),
                "bullish_count": sum(
                    1 for r in response_results 
                    if "BUY" in r.recommendation
                ),
                "bearish_count": sum(
                    1 for r in response_results 
                    if "SELL" in r.recommendation
                ),
                "avg_volatility": sum(
                    r.volatility_percent for r in response_results
                ) / len(response_results),
                "avg_rr_ratio": sum(
                    r.risk_reward_ratio for r in response_results
                ) / len(response_results),
            }
        else:
            stats = {}
        
        return ScreeningResponse(
            mode=request.mode,
            timestamp=datetime.now().isoformat(),
            total_scanned=len(mock_stocks),
            results=response_results,
            top_pick=response_results[0] if response_results else None,
            statistics=stats,
        )
        
    except Exception as e:
        logger.error(f"Error during screening: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/screen-status/{scan_id}")
async def get_screening_status(scan_id: str):
    """
    Get status of a screening scan in progress
    """
    if scan_id not in screening_cache:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    return screening_cache[scan_id]


@app.get("/api/screen-watch")
async def screen_watch_list(symbols: List[str] = Query(["BBCA", "ASII", "BANK"])):
    """
    Screen specific watch list of stocks
    """
    try:
        screener.set_mode(ScreenerMode.DAYTRADE)
        
        mock_stocks = generate_mock_screening_data(symbols=symbols)
        results = screener.screen_all_stocks(mock_stocks)
        
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


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Advanced Screener"}


# --- Utilities ---


def get_all_symbols() -> List[str]:
    """Get list of all symbols (IDX stocks)"""
    # TODO: Fetch from database
    return [
        "BBCA", "ASII", "UNVR", "INDF", "ICBP",  # Blue chips
        "TLKM", "JSMR", "ADRO", "ANTM", "PGAS",  # Sectoral
        "BBRI", "BBNI", "BMRI", "BDMN", "BNBA",  # Banks
        "PROL", "INCO", "TINS", "MEDC", "TOWR",  # Smaller caps
    ]


def generate_mock_screening_data(symbols: List[str]) -> List[Dict]:
    """
    Generate mock screening data for all stocks
    TODO: Replace dengan real data fetch
    """
    import random
    import numpy as np
    
    data = []
    
    for symbol in symbols:
        base_price = random.uniform(500, 4000)
        
        # Mock stock data
        stock = {
            "symbol": symbol,
            "current_price": base_price,
            "atr_percent": random.uniform(0.5, 5.0),
            "volume": random.randint(1_000_000, 10_000_000),
        }
        
        # Mock patterns
        patterns = []
        if random.random() > 0.3:  # 70% chance of patterns
            pattern_types = ["Bullish Engulfing", "Double Bottom", "Rising Wedge"]
            num_patterns = random.choice([1, 2])
            for _ in range(num_patterns):
                patterns.append({
                    "pattern_name": random.choice(pattern_types),
                    "pattern_type": random.choice(["BULLISH", "BEARISH"]),
                    "confidence": random.uniform(0.6, 0.95),
                    "entry_price": base_price * random.uniform(0.98, 1.02),
                    "target_price": base_price * random.uniform(1.02, 1.08),
                    "stop_loss": base_price * random.uniform(0.93, 0.98),
                })
        
        # Mock broker flows
        broker_flows = {}
        if random.random() > 0.4:  # 60% chance of broker data
            brokers = ["PD", "YP", "MG", "CC"]
            num_brokers = random.choice([1, 2, 3])
            for broker in random.sample(brokers, num_brokers):
                broker_flows[broker] = {
                    "z_score": random.uniform(0, 3.5),
                    "consistency_score": random.uniform(0.3, 0.9),
                    "net_value": random.randint(-100_000_000, 500_000_000),
                }
        
        # Mock heatmap data
        heatmap = {
            "haka_volume": random.randint(0, 1_000_000),
            "haki_volume": random.randint(0, 1_000_000),
            "total_volume": stock["volume"],
            "haka_ratio": random.uniform(0.25, 0.75),
        }
        
        # Mock anomalies
        anomalies = []
        if random.random() > 0.7:  # 30% chance of anomalies
            severities = ["LOW", "MEDIUM"]
            anomalies.append({
                "anomaly_type": random.choice(["SPOOFING", "LAYERING"]),
                "severity": random.choice(severities),
            })
        
        stock["patterns"] = patterns
        stock["broker_flows"] = broker_flows
        stock["heatmap"] = heatmap
        stock["anomalies"] = anomalies
        
        data.append(stock)
    
    return data


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
