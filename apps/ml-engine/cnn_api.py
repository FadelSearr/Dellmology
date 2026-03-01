"""
FastAPI endpoint untuk CNN Pattern Detection
Detects technical patterns dalam real-time dan historical data
"""

from fastapi import FastAPI, HTTPException, Query
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import logging
from cnn_pattern_detector import CNNPatternRecognizer, PatternDetection
import pandas as pd
import asyncio
from pydantic import BaseModel
import redis
import json

app = FastAPI(title="CNN Pattern Detection API", version="1.0.0")
logger = logging.getLogger(__name__)

# Initialize pattern recognizer
pattern_recognizer = CNNPatternRecognizer(lookback_period=100)

# Redis cache client (optional)
try:
    redis_client = redis.Redis(host='localhost', port=6379, db=1)
    redis_client.ping()
    logging.info("Redis connected for CNN cache")
except Exception as e:
    redis_client = None
    logging.warning(f"Redis not available: {e}")

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


class PatternResponse(BaseModel):
    symbol: str
    pattern_name: str
    pattern_type: str
    confidence: float
    start_date: str
    end_date: str
    entry_price: float
    target_price: float
    stop_loss: float
    pattern_description: str
    technical_score: float


class PatternsDetectionResponse(BaseModel):
    symbol: str
    timestamp: str
    detected_patterns: List[PatternResponse]
    total_patterns: int
    bullish_count: int
    bearish_count: int


@app.get("/")
async def root():
    return {
        "service": "CNN Pattern Detection",
        "version": "1.0.0",
        "endpoints": [
            "/api/detect-patterns",
            "/api/pattern-confidence",
            "/api/pattern-stats",
        ],
    }


@app.get("/api/detect-patterns", response_model=PatternsDetectionResponse)
async def detect_patterns(
    symbol: str = Query("BBCA", description="Stock symbol"),
    lookback: int = Query(100, description="Number of candles to analyze"),
    min_confidence: float = Query(
        0.6, ge=0, le=1, description="Minimum confidence threshold"
    ),
):
    """
    Detect all technical patterns untuk symbol tertentu
    Returns patterns dengan confidence score dan entry/exit points
    """
    try:
        cache_key = f"patterns:{symbol}:{lookback}:{min_confidence}"
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

        # TODO: Fetch actual price data dari database
        # For now, using mock data
        mock_data = generate_mock_ohlcv_data(symbol, lookback)

        # Detect patterns
        all_patterns = pattern_recognizer.detect_all_patterns(mock_data, symbol)

        # Flatten dan filter by confidence
        detected_patterns = []
        for pattern_list in all_patterns.values():
            detected_patterns.extend(pattern_list)

        filtered_patterns = [
            p for p in detected_patterns if p.confidence >= min_confidence
        ]

        # Sort by confidence descending
        filtered_patterns.sort(key=lambda x: x.confidence, reverse=True)

        # Count by type
        bullish = sum(1 for p in filtered_patterns if p.pattern_type == "BULLISH")
        bearish = sum(1 for p in filtered_patterns if p.pattern_type == "BEARISH")

        response_obj = PatternsDetectionResponse(
            symbol=symbol,
            timestamp=datetime.now().isoformat(),
            detected_patterns=[
                PatternResponse(
                    symbol=p.symbol,
                    pattern_name=p.pattern_name,
                    pattern_type=p.pattern_type,
                    confidence=p.confidence,
                    start_date=p.start_date,
                    end_date=p.end_date,
                    entry_price=p.entry_price,
                    target_price=p.target_price,
                    stop_loss=p.stop_loss,
                    pattern_description=p.pattern_description,
                    technical_score=p.technical_score,
                )
                for p in filtered_patterns[:20]  # Return top 20
            ],
            total_patterns=len(filtered_patterns),
            bullish_count=bullish,
            bearish_count=bearish,
        )
        # cache result
        cache_set(cache_key, response_obj, ttl=30)
        return response_obj

    except Exception as e:
        logger.error(f"Error detecting patterns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/pattern-confidence")
async def pattern_confidence_score(
    symbol: str = Query("BBCA"),
    pattern_name: str = Query("Bullish Engulfing"),
):
    """
    Get detailed confidence score breakdown untuk specific pattern
    """
    try:
        mock_data = generate_mock_ohlcv_data(symbol, 100)
        all_patterns = pattern_recognizer.detect_all_patterns(mock_data, symbol)

        matching_patterns = []
        for pattern_list in all_patterns.values():
            matching_patterns.extend(
                [p for p in pattern_list if pattern_name.lower() in p.pattern_name.lower()]
            )

        if not matching_patterns:
            return {
                "symbol": symbol,
                "pattern": pattern_name,
                "found": False,
                "message": f"No {pattern_name} patterns detected",
            }

        pattern = matching_patterns[0]

        return {
            "symbol": symbol,
            "pattern": pattern.pattern_name,
            "found": True,
            "confidence": pattern.confidence,
            "technical_score": pattern.technical_score,
            "type": pattern.pattern_type,
            "entry": pattern.entry_price,
            "target": pattern.target_price,
            "stop_loss": pattern.stop_loss,
            "description": pattern.pattern_description,
            "details": {
                "risk_reward_ratio": (pattern.target_price - pattern.entry_price)
                / (pattern.entry_price - pattern.stop_loss)
                if pattern.entry_price != pattern.stop_loss
                else 0,
                "potential_gain_percent": (
                    (pattern.target_price - pattern.entry_price)
                    / pattern.entry_price
                    * 100
                ),
                "potential_loss_percent": (
                    (pattern.entry_price - pattern.stop_loss) / pattern.entry_price * 100
                ),
            },
        }

    except Exception as e:
        logger.error(f"Error calculating confidence: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/pattern-stats")
async def pattern_statistics(symbol: str = Query("BBCA")):
    """
    Get statistics tentang pattern detection success rates
    dan confidence distribution
    """
    try:
        mock_data = generate_mock_ohlcv_data(symbol, 200)
        all_patterns = pattern_recognizer.detect_all_patterns(mock_data, symbol)

        stats = {}
        total_patterns = 0

        for pattern_type, patterns in all_patterns.items():
            if patterns:
                confidences = [p.confidence for p in patterns]
                stats[pattern_type] = {
                    "count": len(patterns),
                    "avg_confidence": sum(confidences) / len(confidences),
                    "max_confidence": max(confidences),
                    "min_confidence": min(confidences),
                    "patterns": [
                        {
                            "confidence": p.confidence,
                            "type": p.pattern_type,
                            "date": p.end_date,
                        }
                        for p in patterns[:5]
                    ],
                }
                total_patterns += len(patterns)

        return {
            "symbol": symbol,
            "timestamp": datetime.now().isoformat(),
            "total_patterns_detected": total_patterns,
            "pattern_statistics": stats,
        }

    except Exception as e:
        logger.error(f"Error calculating statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "CNN Pattern Detection"}


# --- Utilities ---


def generate_mock_ohlcv_data(symbol: str, periods: int) -> pd.DataFrame:
    """
    Generate mock OHLCV data untuk testing
    TODO: Replace dengan actual data fetch dari database
    """
    import numpy as np
    from datetime import datetime, timedelta

    data = []
    base_price = 1000
    current_time = datetime.now()

    for i in range(periods):
        timestamp = current_time - timedelta(hours=periods - i)

        # Generate realistic candle
        change = np.random.normal(0, 10)
        open_price = base_price + change
        close_price = open_price + np.random.normal(0, 8)
        high = max(open_price, close_price) + abs(np.random.normal(0, 5))
        low = min(open_price, close_price) - abs(np.random.normal(0, 5))
        volume = int(np.random.exponential(50000))

        data.append(
            {
                "timestamp": timestamp,
                "open": open_price,
                "high": high,
                "low": low,
                "close": close_price,
                "volume": volume,
            }
        )

        base_price = close_price

    df = pd.DataFrame(data)
    return df


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8002)
