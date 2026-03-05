# Dellmology Pro - API Reference

Complete API documentation for all services in Dellmology Pro.

---

## Table of Contents

- [Authentication](#authentication)
- [ML Engine APIs](#ml-engine-apis)
- [Frontend APIs](#frontend-apis)
- [Signal Snapshot Audit APIs](#signal-snapshot-audit-apis)
- [News Impact Overlay API](#news-impact-overlay-api)
- [Streamer APIs](#streamer-apis)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)

---

## Authentication

### API Keys

All protected endpoints require either:
1. `Authorization: Bearer <ML_ENGINE_KEY>` header
2. `X-API-Key: <API_KEY>` header

```bash
# Example
curl -H "Authorization: Bearer your_api_key_here" \
  http://localhost:8001/api/screen
```

### Rate Limits

- **Public endpoints**: 100 requests/minute
- **Authenticated endpoints**: 1000 requests/minute
- **Premium tier**: Unlimited

---

## ML Engine APIs

**Base URL**: `http://localhost:8001` (Training/Narrative)  
**Screener Base**: `http://localhost:8003` (Advanced Screener)  
**CNN Base**: `http://localhost:8002` (Pattern Detection)

### Health Check

```
GET /health
GET /api/health
```

**Response** (200 OK):
```json
{
  "status": "healthy",
  "service": "Advanced Screener",
  "version": "1.0.0",
  "database": {
    "connected": true,
    "timescaledb": true,
    "trades_table": true,
    "order_book_table": true
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Advanced Stock Screener

#### POST /api/screen

Run comprehensive multi-factor stock screening.

**Request**:
```json
{
  "mode": "DAYTRADE",
  "min_score": 0.6,
  "symbols": ["BBCA", "ASII"],
  "include_analysis": true
}
```

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| mode | string | No | DAYTRADE | Screening mode: DAYTRADE, SWING, CUSTOM |
| min_score | number | No | 0.6 | Minimum score threshold (0-1) |
| symbols | array | No | null | Specific symbols to screen; if null, scans all |
| include_analysis | boolean | No | true | Include detailed analysis in response |

**Response** (200 OK):
```json
{
  "mode": "DAYTRADE",
  "timestamp": "2025-01-15T10:30:00Z",
  "total_scanned": 48,
  "results": [
    {
      "symbol": "BBCA",
      "score": 0.87,
      "rank": 1,
      "technical_score": 0.82,
      "flow_score": 0.91,
      "pressure_score": 0.79,
      "volatility_score": 0.88,
      "anomaly_score": 0.45,
      "ai_consensus": 0.84,
      "current_price": 3450.0,
      "volatility_percent": 2.3,
      "haka_ratio": 0.62,
      "broker_net_value": 1250000000,
      "top_broker": "PD",
      "risk_reward_ratio": 2.5,
      "recommendation": "STRONG BUY",
      "reason": "Exceptional technical setup with broker accumulation",
      "pattern_matches": ["Bullish Engulfing", "Double Bottom"],
      "anomalies_detected": []
    }
  ],
  "top_pick": { ... },
  "statistics": {
    "avg_score": 0.72,
    "max_score": 0.87,
    "min_score": 0.52,
    "bullish_count": 15,
    "bearish_count": 8,
    "avg_volatility": 1.8,
    "avg_rr_ratio": 1.9
  }
}
```

**Errors**:
| Status | Code | Description |
|--------|------|-------------|
| 400 | INVALID_MODE | Mode must be DAYTRADE, SWING, or CUSTOM |
| 400 | INVALID_SCORE | Min score must be between 0 and 1 |
| 500 | SCREENING_FAILED | Internal screening error |

---

#### GET /api/screen-watch

Screen a watch list of specified symbols.

**Request**:
```
GET /api/screen-watch?symbols=BBCA&symbols=ASII&symbols=BANK
```

**Parameters**:
| Name | Type | Required | Default |
|------|------|----------|---------|
| symbols | array | No | ["BBCA", "ASII", "BANK"] |

**Response** (200 OK):
```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "watched_symbols": ["BBCA", "ASII", "BANK"],
  "results": [
    {
      "symbol": "BBCA",
      "score": 0.87,
      "rank": 1,
      "recommendation": "STRONG BUY",
      "current_price": 3450.0,
      "volatility": 2.3,
      "pressure": 0.79
    }
  ]
}
```

---

### CNN Pattern Detection

#### GET /api/detect-patterns

Detect technical patterns using Convolutional Neural Network.

**Request**:
```
GET /api/detect-patterns?symbol=BBCA&lookback=100&min_confidence=0.75
```

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| symbol | string | Yes | - | Stock symbol (e.g., BBCA) |
| lookback | integer | No | 100 | Number of bars to analyze |
| min_confidence | number | No | 0.7 | Minimum confidence threshold (0-1) |

**Response** (200 OK):
```json
{
  "symbol": "BBCA",
  "timestamp": "2025-01-15T10:30:00Z",
  "patterns": [
    {
      "pattern_name": "Bullish Engulfing",
      "pattern_type": "BULLISH",
      "confidence": 0.92,
      "entry_price": 3450.0,
      "target_price": 3580.0,
      "stop_loss": 3380.0,
      "timeframe": "1h",
      "created_at": "2025-01-15T09:45:00Z"
    },
    {
      "pattern_name": "Double Bottom",
      "pattern_type": "BULLISH",
      "confidence": 0.85,
      "entry_price": 3445.0,
      "target_price": 3650.0,
      "stop_loss": 3350.0,
      "timeframe": "4h",
      "created_at": "2025-01-14T16:00:00Z"
    }
  ],
  "statistics": {
    "total_patterns": 2,
    "bullish": 2,
    "bearish": 0,
    "avg_confidence": 0.885
  }
}
```

---

### Backtesting Engine

#### POST /api/backtest

Run historical strategy backtesting.

**Request**:
```json
{
  "symbol": "BBCA",
  "start_date": "2025-01-01",
  "end_date": "2025-02-01",
  "strategy": "SMA_CROSSOVER"
}
```

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| symbol | string | Yes | - | Stock symbol |
| start_date | string | No | Today-30d | Start date (YYYY-MM-DD) |
| end_date | string | No | Today | End date (YYYY-MM-DD) |
| strategy | string | No | SMA_CROSSOVER | Strategy: SMA_CROSSOVER, RSI, MACD, CUSTOM |

**Response** (200 OK):
```json
{
  "symbol": "BBCA",
  "period_days": 31,
  "total_trades": 14,
  "winning_trades": 9,
  "losing_trades": 5,
  "win_rate": 64.3,
  "total_profit_loss": 125000.0,
  "avg_profit": 13888.9,
  "avg_loss": -5000.0,
  "profit_factor": 2.5,
  "max_drawdown": -8500.0,
  "sharpe_ratio": 1.82,
  "trades": [
    {
      "entry_date": "2025-01-02",
      "exit_date": "2025-01-05",
      "entry_price": 3400.0,
      "exit_price": 3450.0,
      "quantity": 100,
      "trade_type": "LONG",
      "reason": "SMA Crossover BUY signal",
      "exit_reason": "Take Profit",
      "profit_loss": 5000.0,
      "profit_loss_pct": 1.47
    }
  ],
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### XAI (Explainable AI)

#### POST /api/xai/explain

Get AI-generated explanation for analysis results.

**Request**:
```json
{
  "symbol": "BBCA",
  "analysis_type": "screening",
  "data": {
    "score": 0.87,
    "recommendation": "STRONG BUY",
    "patterns": ["Bullish Engulfing"],
    "broker_sentiment": "accumulating"
  }
}
```

**Response** (200 OK):
```json
{
  "symbol": "BBCA",
  "explanation": "BBCA (Bank Central Asia) is showing strong buy signals based on multiple converging factors. The stock has formed a bullish engulfing pattern at a key support level, indicating institutional buying pressure. Broker flow analysis shows consistent accumulation by major institutions (PD, YP) over the past 3 days with increasing net positive value. Technical indicators align with fundamental strength in the banking sector. Risk-reward ratio of 2.5:1 offers attractive risk management setup.",
  "confidence": 0.91,
  "factors_considered": [
    "Technical Pattern: Bullish Engulfing at Support (85% confidence)",
    "Broker Accumulation: PD buying 125M shares net (88% confidence)",
    "Sector Momentum: Banking sector outperforming by 2.3% (79% confidence)",
    "Volume Profile: 18% above average confirming breakout (82% confidence)"
  ],
  "risk_factors": [
    "Market Regime Change: RSI at 68 (overbought territory)",
    "Upcoming Events: Earnings in 3 days may cause volatility"
  ],
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

## Frontend APIs

**Base URL**: `http://localhost:3000/api`

These are proxy endpoints that forward requests to ML engines with caching.

### POST /api/advanced-screener

Proxy to ML engine screener.

**Request** (identical to ML engine):
```json
{
  "mode": "DAYTRADE",
  "minScore": 0.6
}
```

**Response**: Same as `/api/screen` endpoint

**Caching**: 15-second Edge cache

---

### GET /api/cnn-patterns

Proxy to CNN pattern detector.

**Request**:
```
GET /api/cnn-patterns?symbol=BBCA&lookback=60&minConfidence=0.7
```

**Caching**: 30-second Edge cache

---

### POST /api/backtest

Proxy to backtesting engine.

**Request**:
```json
{
  "symbol": "BBCA",
  "start_date": "2025-01-01",
  "end_date": "2025-02-01"
}
```

**Response Wrapper**:
```json
{
  "success": true,
  "result": { ... }
}
```

---

### GET /api/data-validation-status

Data quality status for a symbol.

**Request**:
```
GET /api/data-validation-status?symbol=BBCA
```

**Response** (200 OK):
```json
{
  "symbol": "BBCA",
  "valid_records": 2541,
  "invalid_records": 12,
  "validation_score": 0.995,
  "last_check": "2025-01-15T10:30:00Z",
  "anomalies_detected": [
    {
      "anomaly_type": "SPOOFING",
      "severity": "LOW",
      "description": "Potential spoofing detected: 500 shares bid wall disappeared"
    }
  ]
}
```

---

### GET /api/order-flow-heatmap

Order flow and market depth data.

**Request**:
```
GET /api/order-flow-heatmap?symbol=BBCA&aggregation=5min
```

**Response** (200 OK):
```json
{
  "symbol": "BBCA",
  "timestamp": "2025-01-15T10:30:00Z",
  "aggregation": "5min",
  "heatmap_data": [
    {
      "price": 3450.0,
      "bid_volume": 50000,
      "ask_volume": 45000,
      "intensity": 0.87,
      "time_bucket": "2025-01-15T10:30:00Z"
    }
  ],
  "statistics": {
    "total_bid_volume": 1250000,
    "total_ask_volume": 1180000,
    "max_intensity": 0.92,
    "avg_intensity": 0.72
  }
}
```

---

## Signal Snapshot Audit APIs

**Base URL**: `http://localhost:3000/api`

These endpoints implement immutable snapshot logging using SHA-256 hash chaining (`previous_hash` -> `record_hash`) for anti-tampering audit trails.

### POST /api/signal-snapshots

Store a new decision snapshot with chained hashes.

**Request**:
```json
{
  "symbol": "BBCA",
  "timeframe": "15m",
  "signal": "BUY",
  "price": 9450,
  "unified_power_score": 88,
  "payload": {
    "consensus": "CONSENSUS_BULL",
    "risk_gate": "NORMAL"
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "snapshot_id": 123,
  "created_at": "2026-03-04T10:30:00Z",
  "payload_hash": "...",
  "previous_hash": "...",
  "record_hash": "...",
  "hash_version": 2
}
```

---

### GET /api/signal-snapshots

Read recent snapshots.

**Request**:
```
GET /api/signal-snapshots?limit=50
```

**Response** (200 OK):
```json
{
  "snapshots": [
    {
      "id": 123,
      "symbol": "BBCA",
      "signal": "BUY",
      "payload_hash": "...",
      "previous_hash": "...",
      "record_hash": "..."
    }
  ],
  "count": 1
}
```

---

### GET /api/signal-snapshots/integrity

Verify linkage and checksum consistency in the hash chain.

**Request**:
```
GET /api/signal-snapshots/integrity?limit=200&symbol=BBCA
```

**Response** (200 OK):
```json
{
  "valid": true,
  "symbol": "BBCA",
  "checked_rows": 200,
  "upgraded_rows": 200,
  "linkage_failures": 0,
  "checksum_failures": 0,
  "issues": [],
  "checked_at": "2026-03-04T10:30:00Z"
}
```

---

## News Impact Overlay API

**Base URL**: `http://localhost:3000/api`

This endpoint computes headline stress and historical red-flag markers used by dashboard risk overlay to penalize Unified Power Score (UPS).

### GET /api/news-impact

Analyze recent headlines for a symbol and return stress score + UPS penalty recommendation.

**Request**:
```
GET /api/news-impact?symbol=BBCA
```

**Response** (200 OK):
```json
{
  "success": true,
  "symbol": "BBCA",
  "stress_score": 42.5,
  "penalty_ups": 12,
  "risk_label": "MEDIUM",
  "red_flags": [
    "Legal dispute",
    "Debt stress signal"
  ],
  "sampled_headlines": [
    {
      "title": "bbca faces debt stress concern in sector outlook",
      "score": 16,
      "red_flags": ["Debt stress signal"]
    }
  ],
  "checked_at": "2026-03-04T11:00:00Z"
}
```

---

## Streamer APIs

**Base URL**: `http://localhost:8080`

### GET /stream

Server-Sent Events (SSE) stream for real-time trades.

**Request**:
```
GET /stream
```

**Response Headers**:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Stream Format**:
```
event: trade
data: {"symbol":"BBCA","price":3450.0,"volume":1000,"timestamp":"2025-01-15T10:30:00Z","buyer":"PD","seller":"YP"}

event: trade
data: {"symbol":"ASII","price":6780.0,"volume":500,"timestamp":"2025-01-15T10:30:01Z","buyer":"CC","seller":"MG"}
```

**Trade Event Schema**:
```json
{
  "symbol": "string",
  "price": "float",
  "volume": "integer",
  "timestamp": "ISO8601",
  "trade_type": "REGULAR|CROSS|NEGOTIATION",
  "buyer": "string (broker code)",
  "seller": "string (broker code)",
  "net_value": "integer"
}
```

---

### GET /health

Streamer health check.

**Response** (200 OK):
```json
{
  "status": "healthy",
  "uptime_seconds": 3600,
  "trades_processed": 45231,
  "connected_symbols": 180,
  "last_trade": "2025-01-15T10:30:00Z"
}
```

---

## Error Handling

### Standard Error Response

```json
{
  "error": "Invalid Mode",
  "detail": "Mode must be one of: DAYTRADE, SWING, CUSTOM",
  "request_id": "req_123456789",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Missing/invalid API key |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Symbol doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Database/service down |

---

## Rate Limiting

### Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1642252800
```

### Retry Logic

```bash
# If 429 (Too Many Requests), wait X-RateLimit-Reset - now
# Exponential backoff: 1s, 2s, 4s, 8s
```

---

## Examples

### Python Client

```python
import httpx
import asyncio

async def screen_stocks():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8003/api/screen",
            json={"mode": "DAYTRADE", "min_score": 0.7},
            headers={"Authorization": "Bearer your_api_key"}
        )
        results = response.json()
        
        for stock in results["results"][:5]:
            print(f"{stock['symbol']}: {stock['recommendation']} ({stock['score']:.2%})")

asyncio.run(screen_stocks())
```

### JavaScript/TypeScript

```typescript
async function detectPatterns(symbol: string) {
  const response = await fetch(
    `/api/cnn-patterns?symbol=${symbol}&minConfidence=0.75`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.API_KEY}`
      }
    }
  );
  
  const data = await response.json();
  console.log(`${symbol}: ${data.patterns.length} patterns found`);
  
  data.patterns.forEach(p => {
    console.log(`  - ${p.pattern_name} (${p.confidence.toFixed(1)})`);
  });
}

detectPatterns('BBCA');
```

### cURL

```bash
# Screen stocks in DAYTRADE mode
curl -X POST http://localhost:8003/api/screen \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "mode": "DAYTRADE",
    "min_score": 0.6,
    "include_analysis": true
  }'

# Get patterns for a symbol
curl "http://localhost:8002/api/detect-patterns?symbol=BBCA&lookback=100"

# Run backtest
curl -X POST http://localhost:8003/api/backtest \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BBCA",
    "start_date": "2025-01-01",
    "end_date": "2025-02-01",
    "strategy": "SMA_CROSSOVER"
  }'

# Stream real-time trades
curl -N http://localhost:8080/stream
```

---

## Testing & Validation

Run integration tests:

```bash
pip install pytest pytest-asyncio httpx

pytest apps/ml-engine/test_integration.py -v
```

Run diagnostic:

```bash
python diagnostic.py
```

---

## Support

For API issues, questions, or feature requests:
- Report bugs: Issues section
- Ask questions: Discussions forum
- Request features: Feature request form
