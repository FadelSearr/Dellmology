# 🌊 Dellmology Pro - Bandarmology Trading Platform

**Platform Analisis Pasar Indonesia Real-time dengan AI-Powered Insights**

## 📊 Status Implementasi - Phase 1 Complete ✅

### Completed ✅
- **Backend Infrastructure**
  - ✅ Real-time WebSocket streaming (Go + Stockbit)
  - ✅ Server-Sent Events (SSE) untuk live updates frontend
  - ✅ TimescaleDB integration untuk time-series data
  - ✅ Market Regime Detection (Uptrend/Downtrend/Sideways/Volatile)
  - ✅ Z-Score based Whale Detection
  - ✅ Wash Sale Detection algorithm
  - ✅ Broker Flow Analysis dengan anomaly detection
  
- **Frontend Components**
  - ✅ Section 0: Command Bar (Sticky Header)
  - ✅ Section 1: Market Intelligence Canvas
  - ✅ Section 2: The Flow Engine (Broker Analysis)
  - ✅ Section 3: Neural Narrative Hub (AI Analysis)
  - ✅ Section 4: Risk & Tactical Dock
  - ✅ Section 5: Performance Dashboard
  - ✅ Global Correlation Marquee (real-time commodities & indices)
  - ✅ System Health Indicators
  
- **API Endpoints**
  - ✅ `/api/market-regime` - Market trend & volatility data
  - ✅ `/api/market-intelligence` - HAKA/HAKI analysis & UPS score
  - ✅ `/api/broker-flow` - Broker analysis with Z-scores
  - ✅ `/api/global-correlation` - Commodity & index prices
  - ✅ `/api/narrative` - AI narrative generation
  - ✅ `/api/health` - System health check
  
- **AI Integration**
  - ✅ Gemini API integration module
  - ✅ Narrative generation system
  - ✅ SWOT analysis module
  - ✅ Market analysis templates

### Next Phase 🔄 (Phase 2)
- [x] Deep CNN Technical Pattern Detection (training pipeline available)
- [ ] Order Flow Heatmap visualization
- [ ] Real-time chart integration (TradingView)
- [ ] Advanced Screener (Daytrade + Swing modes)
- [x] Telegram notification system
- [x] Backtesting engine
- [ ] Explainable AI (XAI) reports

---

## 🚀 Quick Start

### Telegram Notification Service
1. Create a bot with @BotFather on Telegram and obtain `TELEGRAM_BOT_TOKEN`.
2. Obtain your chat ID from `getUpdates` endpoint or via bot interaction.
3. Add the following to your `.env`:
   ```
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...
   ML_ENGINE_KEY=your-secret-key
   # Redis configuration (optional, defaults to localhost:6379)
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```
4. Start ML engine (`docker-compose up -d ml-engine` or run `python telegram_service.py`).
5. Configure alert preferences in UI under **Settings → Telegram Alerts**.


## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Go 1.20+
- Python 3.9+
- Node.js 18+
- PostgreSQL 15 (via Docker)

### Installation

1. **Clone & Setup**
```bash
cd c:\IDX_Analyst
# bring up Postgres and Redis cache
docker-compose up -d  # Start database & cache (includes Redis)
```

2. **Setup Python Environment**
```bash
cd apps/ml-engine
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

3. **Setup Node.js**
```bash
cd apps/web
npm install
```

4. **Setup Go Services**
```bash
cd apps/streamer
go mod download
go run main.go market_regime.go broker_analysis.go
```

### Running the Platform

**Terminal 1: Database**
```bash
docker-compose up
```

**Terminal 2: Go Streamer**
```bash
cd apps/streamer
go run main.go market_regime.go broker_analysis.go
```

**Terminal 3: Python ML Services**
```bash
cd apps/ml-engine
python global_market_aggregator.py  # Fetch commodity data every 5 min
# python train.py  # Train CNN model (optional)
```

**Terminal 4: Next.js Frontend**
```bash
cd apps/web
npm run dev  # http://localhost:3000
```

---

## 🏗️ Architecture Overview

### 5-Section Dashboard Layout

```
┌─────────────────────────────────────────────────────────┐
│ SECTION 0: Command Bar (Sticky)                         │
│ - Search Bar • Market Regime Badge • System Health      │
│ - Global Correlation Ticker • API Rate Limit            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SECTION 1: Market Intelligence Canvas                  │
│ - HAKA/HAKI Volume Analysis • Pressure Index           │
│ - Unified Power Score (UPS 0-100)                       │
│ - Order Flow Heatmap • Volatility Metrics              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SECTION 2: The Flow Engine (Bandarmology Hub)          │
│ - Broker Flow Analysis • Z-Score Detection             │
│ - Whale Identification • Wash Sale Alerts              │
│ - Daily Accumulation/Distribution Heatmap              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SECTION 3: Neural Narrative Hub & AI Screener         │
│ - AI-generated market narratives (Gemini)              │
│ - Screener: Daytrade Mode + Swing Mode                 │
│ - SWOT Analysis • Retail Sentiment Analysis            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SECTION 4: Risk & Tactical Dock                        │
│ - Position Sizing Calculator (ATR-based)               │
│ - Smart Entry/Exit Suggestions                         │
│ - Telegram Alerts • PDF Report Export                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SECTION 5: Performance & Infrastructure Lab            │
│ - Backtesting Results • System Logs                     │
│ - Performance Dashboard • Data Integrity Logs            │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
Stockbit WebSocket
       ↓
    Streamer (Go)
       ↓
  - Trade Data (HAKA/HAKI)
  - Quote Data (Bid/Offer)
  - Market Regime calculation
       ↓
  TimescaleDB
       ↓
  Next.js API Routes
       ↓
  Frontend (React)
```

---

## 📊 Key Metrics & Indicators

### UPS (Unified Power Score) - 0-100
Combines:
- **HAKA Strength** (40 pts): % aggressive buys vs total volume
- **Volume Momentum** (30 pts): Total volume relative to baseline
- **Price Strength** (20 pts): |Bid-Ask pressure| ratio
- **Consistency** (10 pts): HAKA ratio stability

### Market Regime
- **Uptrend**: RSI > 55 + Trend Strength > 50%
- **Downtrend**: RSI < 45 + Trend Strength > 50%
- **Sideways**: Trend Strength < 30%
- **Volatile**: ATR% > 5% of last price

### Volatility Levels
- **Low**: ATR% < 1.5%
- **Medium**: ATR% 1.5-3%
- **High**: ATR% 3-5%
- **Extreme**: ATR% > 5%

### Broker Classification
- **Whale**: Z-Score > 2.5 (Top 5% accumulator)
- **Smart Money**: Z > 0.5 + Consistency > 50%
- **Retail**: Z-Score < -1 (Small lot buyer)

### Wash Sale Detection
Scores 0-100% based on:
- Volume vs Net Accumulation ratio
- Broker equilibrium count
- Z-Score variance across brokers

---

## 🔌 API Reference

### Market Intelligence
```bash
GET /api/market-intelligence?symbol=BBCA&timeframe=1h
```
Returns: HAKA/HAKI volumes, pressure index, volatility, UPS score

### Broker Flow
```bash
GET /api/broker-flow?symbol=BBCA&days=7&filter=whale
```
Filters: `whale|retail|smart_money|mix`

### Market Regime
```bash
GET /api/market-regime
```
Returns: Current trend, volatility, RSI, ATR, trend strength

### AI Narrative
```bash
POST /api/narrative
Body: {
  "type": "broker|regime|screener|swot",
  "data": {...}
}
```

---

## 📝 Data Storage

### TimescaleDB Tables
- `trades` - Real-time HAKA/HAKI trades (7-day retention)
- `broker_summaries` - End-of-day broker analysis
- `daily_prices` - Historical OHLCV data
- `cnn_predictions` - ML model predictions
- `config` - System configuration & tokens

---

## 🔐 Security

- Auth via Stockbit token (JWT)
- Session management in DB
- Rate limiting on API endpoints
- Data integrity validation per trade
- RoC kill-switch (prevent crash on 10%+ drop)

---

## 🎯 Usage Examples

### Monitor BBCA Broker Flow
1. Open dashboard → Search "BBCA"
2. View Flow Engine → Filter "Whale"
3. Read AI Narrative for insights

### Set Screener Filter
1. Section 3 → Screener
2. Mode: Daytrade (high HAKA ratio) or Swing (consistent accumulation)
3. Price Range: Rp 100-500
4. View top 10 candidates

### Check Market Regime
1. Section 0 → Regime Badge
2. If Uptrend + RSI 50-70 → Good for long entries
3. If Downtrend + Volatility High → Use tighter stops

---

## ⚙️ Configuration

### Environment Variables
```bash
# .env
GEMINI_API_KEY=your_api_key
DATABASE_URL=postgresql://admin:password@localhost:5433/dellmology
INTERNAL_API_KEY=your_internal_key
NEXT_PUBLIC_STREAMER_URL=http://localhost:8080
```

### Streamer Config (main.go)
```go
const (
    tokenAPIURL    = "http://localhost:3000/api/session"
    websocketURL   = "wss://stream.stockbit.com/stream"
    databaseURL    = "postgresql://..."
    rocPriceDrop   = -0.10  // 10% drop threshold
)
```

---

## 📚 Documentation

- `GEMINI.md` - Detailed product roadmap
- `README.md` (this file) - Architecture & setup
- API docs in each route file
- Component docs in React files

---

## 🐛 Troubleshooting

**Q: SSE connection disconnected**
- Check streamer service is running: `localhost:8080/health`
- Verify DB connection in streamer logs

**Q: No trades appearing**
- Verify Stockbit token is fresh (check `/api/session`)
- Ensure streamer can connect to Stockbit WebSocket
- Check market hours (9:00-16:00 WIB)

**Q: Narrative generation fails**
- Verify GEMINI_API_KEY is set
- Check API quota hasn't been exceeded

---

## 🚧 Known Limitations

- Frontend chart rendering still uses placeholder (TradingView integration pending)
- Backtesting engine not yet implemented
 - Order flow heatmap visualization now implemented with real data
- Telegram integration pending
- Deep CNN model training pending

---

## 📞 Support

For issues or contributions:
1. Check `GEMINI.md` for detailed specification
2. Review API logs in terminal
3. Check database state: `SELECT COUNT(*) FROM trades WHERE timestamp > NOW() - INTERVAL '1 hour'`

---

## 📜 License

Internal Project - IDX Analysis System

**Built with:** Go • Python • Next.js • React • PostgreSQL • Gemini AI

🚀 *Real-time Bandarmology Analysis Platform*
