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
from db_utils import (
    init_db, fetch_recent_trades, fetch_broker_flows, fetch_ohlc_data,
    fetch_all_symbols, get_db_health, fetch_order_book
)

app = FastAPI(title="Advanced Screener API", version="1.0.0")
logger = logging.getLogger(__name__)

# Initialize screener and database
screener = AdvancedScreener()
try:
    init_db()
except Exception as e:
    logger.warning(f"Database init failed: {e}, will use fallback mock data")

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
        "endpoints": ["/api/screen", "/api/screen-status", "/api/screen-history", "/health"],
    }


@app.get("/health")
async def health_check():
    """Health check endpoint with database status"""
    db_health = get_db_health()
    return {
        "status": "healthy" if db_health['connected'] else "degraded",
        "database": db_health,
        "timestamp": datetime.now().isoformat(),
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
        
        # Fetch actual stock data from database or use fallback mock
        stock_data = generate_screening_data(
            symbols=request.symbols or get_all_symbols()
        )
        
        # Run screening
        results = screener.screen_all_stocks(stock_data)
        
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


@app.post("/api/backtest")
async def run_backtest(request: dict):
    """Simple backtest runner using mock price series (sma crossover)."""
    symbol = request.get('symbol', 'BBCA')
    start = request.get('start_date')
    end = request.get('end_date')
    # for now generate synthetic data
    import pandas as pd
    import numpy as np
    dates = pd.date_range(start=start or '2025-01-01', end=end or '2025-02-01', freq='D')
    prices = 100 + np.cumsum(np.random.randn(len(dates))) * 2
    df = pd.DataFrame({'date': dates, 'price': prices})
    df['sma_short'] = df['price'].rolling(5).mean()
    df['sma_long'] = df['price'].rolling(20).mean()
    position = 0
    entry_price = 0
    trades = []
    equity = 100000
    for idx, row in df.iterrows():
        if row['sma_short'] > row['sma_long'] and position == 0:
            position = 1
            entry_price = row['price']
            trades.append({'type': 'BUY', 'price': entry_price, 'date': row['date']})
        if row['sma_short'] < row['sma_long'] and position == 1:
            exit_price = row['price']
            profit = (exit_price - entry_price) * 100  # assume 100 shares
            equity += profit
            trades.append({'type': 'SELL', 'price': exit_price, 'date': row['date'], 'profit': profit})
            position = 0
    return {
        'symbol': symbol,
        'start_date': str(dates.min()),
        'end_date': str(dates.max()),
        'initial_equity': 100000,
        'final_equity': equity,
        'trades': trades,
        'return_percent': (equity - 100000) / 100000 * 100,
    }

@app.get("/api/screen-watch")
async def screen_watch_list(symbols: List[str] = Query(["BBCA", "ASII", "BANK"])):
    """
    Screen specific watch list of stocks
    """
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


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Advanced Screener"}


# --- Utilities ---


def get_all_symbols() -> List[str]:
    """Get list of all symbols from database or fallback to common IDX stocks"""
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
    """
    Generate screening data from real database or mock fallback
    Attempts to fetch from database first, falls back to mock data if unavailable
    """
    import random
    import numpy as np
    
    data = []
    db_health = get_db_health()
    use_real_data = db_health['connected'] and db_health['trades_table']
    
    for symbol in symbols:
        stock = {}
        
        try:
            if use_real_data:
                # Fetch real data from database
                recent_trades = fetch_recent_trades(symbol, limit=100)
                order_book = fetch_order_book(symbol)
                broker_flows = fetch_broker_flows(symbol, days=1)
                
                if recent_trades:
                    prices = [t['price'] for t in recent_trades]
                    base_price = float(np.mean(prices))
                    volatility = float(np.std(prices)) / base_price if base_price > 0 else 0.02
                    volume = sum(int(t['volume']) for t in recent_trades)
                else:
                    base_price = random.uniform(500, 4000)
                    volatility = random.uniform(0.5, 5.0) / 100
                    volume = 0
                
                stock = {
                    "symbol": symbol,
                    "current_price": base_price,
                    "atr_percent": volatility * 100,
                    "volume": volume,
                }
                
                # Real broker flows
                if broker_flows:
                    broker_list = list(broker_flows.items())
                    stock["broker_flows"] = {
                        broker: {
                            "z_score": random.uniform(0, 3.5),
                            "consistency_score": float(data.get('trade_count', 1)) / max(float(sum(bf.get('trade_count', 1) for bf in broker_flows.values())), 1),
                            "net_value": int(data.get('net_value', 0)),
                        }
                        for broker, data in broker_list[:3]
                    }
                else:
                    stock["broker_flows"] = {}
                
        except Exception as e:
            logger.warning(f"Failed to fetch real data for {symbol}: {e}, using mock")
            use_real_data = False
        
        # If real data fetch failed or unavailable, use mock data
        if not use_real_data or not stock:
            stock = {
                "symbol": symbol,
                "current_price": random.uniform(500, 4000),
                "atr_percent": random.uniform(0.5, 5.0),
                "volume": random.randint(1_000_000, 10_000_000),
            }
        
        # Patterns (theoretical/mock for now)
        patterns = []
        if random.random() > 0.3:
            pattern_types = ["Bullish Engulfing", "Double Bottom", "Rising Wedge"]
            for _ in range(random.choice([1, 2])):
                patterns.append({
                    "pattern_name": random.choice(pattern_types),
                    "pattern_type": random.choice(["BULLISH", "BEARISH"]),
                    "confidence": random.uniform(0.6, 0.95),
                    "entry_price": stock["current_price"] * random.uniform(0.98, 1.02),
                    "target_price": stock["current_price"] * random.uniform(1.02, 1.08),
                    "stop_loss": stock["current_price"] * random.uniform(0.93, 0.98),
                })
        
        stock["patterns"] = patterns
        
        # Broker flows (ensure it exists)
        if "broker_flows" not in stock:
            if random.random() > 0.4:
                brokers = ["PD", "YP", "MG", "CC"]
                stock["broker_flows"] = {
                    broker: {
                        "z_score": random.uniform(0, 3.5),
                        "consistency_score": random.uniform(0.3, 0.9),
                        "net_value": random.randint(-100_000_000, 500_000_000),
                    }
                    for broker in random.sample(brokers, random.choice([1, 2, 3]))
                }
            else:
                stock["broker_flows"] = {}
        
        # Heatmap data
        stock["heatmap"] = {
            "haka_volume": random.randint(0, 1_000_000),
            "haki_volume": random.randint(0, 1_000_000),
            "total_volume": stock.get("volume", 0),
            "haka_ratio": random.uniform(0.25, 0.75),
        }
        
        # Anomalies
        stock["anomalies"] = []
        if random.random() > 0.7:
            stock["anomalies"].append({
                "anomaly_type": random.choice(["SPOOFING", "LAYERING"]),
                "severity": random.choice(["LOW", "MEDIUM"]),
            })
        
        data.append(stock)
    
    return data


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
