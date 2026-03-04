## Streamer - Real-time Market Data Service

Go-based high-performance service for handling real-time market data streams from Stockbit.

### Directory Structure

```
streamer/
├── cmd/
│   └── streamer/        # Application entry point
│       └── main.go
│
├── internal/            # Private packages (not importable)
│   ├── models/          # Data structures
│   │   └── types.go
│   ├── data/            # Data storage and streaming
│   │   ├── storage.go
│   │   └── streaming.go
│   ├── analysis/        # Market analysis
│   │   ├── broker.go    # Broker flow & Z-Score
│   │   └── market.go    # Regime detection
│   └── order/           # Order flow analysis
│       └── flow.go      # Heatmap & big walls
│
├── config/              # Configuration management
│   └── config.go
│
├── go.mod               # Module definition
├── go.sum               # Dependency checksums
├── README.md
```

### Features

- **Real-time WebSocket Streaming**: Connects to Stockbit WebSocket for live market data
- **Trade Detection**: HAKA/HAKI (aggressive buy/sell) detection
- **Broker Flow Analysis**: Z-Score based whale detection
- **Order Flow Heatmap**: Big walls and liquidity analysis
- **Market Regime**: Uptrend, Downtrend, Sideways detection
- **Rate-of-Change Alerts**: Detect sudden price drops

### Building

```bash
cd apps/streamer
go mod tidy
go build -o streamer cmd/streamer/main.go
```

### Running

```bash
./streamer
```

### Dependencies

- github.com/gorilla/websocket - WebSocket handling
- github.com/go-redis/redis/v8 - Redis caching
- github.com/lib/pq - PostgreSQL driver

### Configuration

Set environment variables:

```bash
export TOKEN_API_URL=http://localhost:3000/api/session
export WEBSOCKET_URL=wss://stream.stockbit.com/stream
export DATABASE_URL=postgresql://admin:password@localhost:5433/dellmology
export REDIS_HOST=localhost
export REDIS_PORT=6379
export WORKER_HEARTBEAT_URL=http://localhost:3000/api/worker-heartbeat
export WORKER_HEARTBEAT_INTERVAL_SECONDS=300
export WORKER_HEARTBEAT_TIMEOUT_SECONDS=8
```

### API Endpoints

- `POST /websocket` - WebSocket upgrade endpoint
- `GET /health` - Service health check
- `GET /heartbeat` - Worker runtime heartbeat telemetry (stale seconds, queue depth, dead-letter count)
- `GET /stats` - Real-time statistics

### Cloud Dead-Man Integration

Streamer now publishes heartbeat to Web API (`/api/worker-heartbeat`) on startup and every 5 minutes (default).
This enables dashboard lock + offline Telegram alert flow when the local worker stops sending heartbeat.

### Performance

- Handles 1000+ concurrent streams
- Sub-millisecond latency
- Redis-backed caching
- Connection pooling to database
