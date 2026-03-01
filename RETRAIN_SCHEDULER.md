# Model Retrain Scheduler Documentation

## Overview

The Dellmology ML Engine includes a background scheduler that automatically retrains the CNN model on a configurable schedule. This ensures your predictions stay fresh with the latest market data.

## Configuration

### Environment Variables

Add these to your `.env` file:

```dotenv
# Schedule type: 'daily' (at RETRAIN_HOUR), 'weekly' (on RETRAIN_DAY at RETRAIN_HOUR), or 'cron' (custom RETRAIN_CRON)
RETRAIN_SCHEDULE=daily

# Hour to retrain (UTC, 0-23; default 22 = 05:00 WIB)
RETRAIN_HOUR=22

# Day for weekly retrain (sun, mon, tue, wed, thu, fri, sat)
RETRAIN_DAY=sun

# Custom cron expression (only used if RETRAIN_SCHEDULE=cron)
# Format: "minute hour day month day_of_week"
# Examples:
#   "0 22 * * *"     = daily at 22:00
#   "0 22 * * 0"     = weekly on Sunday at 22:00
#   "0 */6 * * *"    = every 6 hours
#   "0 2 * * 1-5"    = weekdays at 02:00
RETRAIN_CRON=
```

### Examples

**Daily Retrain at 22:00 UTC (05:00 WIB)**
```dotenv
RETRAIN_SCHEDULE=daily
RETRAIN_HOUR=22
```

**Weekly Retrain on Sundays at 22:00 UTC**
```dotenv
RETRAIN_SCHEDULE=weekly
RETRAIN_HOUR=22
RETRAIN_DAY=sun
```

**Custom Cron: Every Sunday and Wednesday at 22:00 UTC**
```dotenv
RETRAIN_SCHEDULE=cron
RETRAIN_CRON=0 22 * * 0,3
```

## API Endpoints

### 1. Manually Trigger Retrain

**POST** `/retrain/trigger`

Manually trigger model retrain for a specific symbol or all symbols.

**Request:**
```bash
curl -X POST http://localhost:8001/retrain/trigger \
  -H "Authorization: Bearer YOUR_ML_ENGINE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"symbol": "BBCA"}'
```

**Response:**
```json
{
  "success": true,
  "retrain_result": {
    "triggered_symbols": ["BBCA"],
    "results": {
      "BBCA": {
        "status": "success",
        "message": "Retrain triggered"
      }
    }
  }
}
```

To retrain all symbols, omit the `symbol` field:
```bash
curl -X POST http://localhost:8001/retrain/trigger \
  -H "Authorization: Bearer YOUR_ML_ENGINE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 2. Get Retrain Status

**GET** `/retrain/status`

Retrieve current scheduler status and per-symbol retrain history.

**Request:**
```bash
curl -X GET http://localhost:8001/retrain/status \
  -H "Authorization: Bearer YOUR_ML_ENGINE_KEY"
```

**Response:**
```json
{
  "success": true,
  "status": {
    "running": true,
    "schedule_type": "daily",
    "schedule_hour": 22,
    "last_retrain_time": "2026-03-01T22:00:15.123456",
    "target_symbols": ["BBCA", "TLKM", "GOTO", "BBNI", "ASII", "BMRI"],
    "symbol_status": {
      "BBCA": {
        "status": "success",
        "last_retrain": "2026-03-01T22:00:15.123456",
        "message": "Successfully retrained"
      },
      "TLKM": {
        "status": "failed",
        "last_retrain": "2026-02-28T22:00:01.000000",
        "error": "Insufficient data"
      }
    }
  }
}
```

## How It Works

1. **Scheduler Startup**: When the ML Engine (FastAPI) service starts, the retrain scheduler is automatically initialized and started.

2. **Background Jobs**: The scheduler runs retraining jobs in the background without blocking other API requests.

3. **Per-Symbol Execution**: Each target symbol (BBCA, TLKM, GOTO, BBNI, ASII, BMRI) is retrained sequentially, with individual success/failure tracking.

4. **Data Pipeline**:
   - Loads latest historical data from the database
   - Generates features (128-day window, 5 OHLCV features)
   - Trains CNN model for 50 epochs
   - Saves checkpoint to `checkpoints/` directory

5. **Error Handling**: If retrain for one symbol fails, the scheduler continues with the next symbol. Status is tracked per-symbol so you can see which symbols succeeded/failed.

## Troubleshooting

### Scheduler not running?
- Check `RETRAIN_SCHEDULE` is set to 'daily', 'weekly', or 'cron'
- Verify `RETRAIN_HOUR` is 0-23
- Check logs for startup errors

### Retrain failing for a symbol?
- Ensure `train.py` can run independently: `python train.py SYMBOL --real`
- Check database connectivity and data availability
- Review TensorFlow checkpoint directory permissions

### Want to skip automatic retrain temporarily?
- Set `RETRAIN_SCHEDULE` to an empty string or remove the configuration
- Or manually call `/retrain/trigger` only when needed

## Manual Scheduling

If you prefer to control retrain timing externally:

1. Set `RETRAIN_SCHEDULE=` (empty) to disable automatic scheduling
2. Call `/retrain/trigger` via cron, external scheduler, or microservice orchestrator
3. Monitor status via `/retrain/status`

Example: Call just before market open (10:00 WIB = 03:00 UTC):
```bash
0 3 * * 1-5 curl -X POST http://localhost:8001/retrain/trigger \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{}'
```

## Performance Tips

- **Timing**: Schedule retrain during low-traffic hours (e.g., after market close at 22:00 UTC)
- **Frequency**: Daily retrain is sufficient for most use cases; weekly may be appropriate for slower-moving assets
- **Monitoring**: Use `/retrain/status` before market open to confirm latest models are trained
- **Resources**: Ensure sufficient disk space for checkpoints (~100MB per symbol per checkpoint)

## Integration with Dashboards

The frontend can monitor retrain status by polling `/retrain/status`. Example (React):

```javascript
const [status, setStatus] = useState(null)

const checkRetrainStatus = async () => {
  const resp = await fetch('/api/cnn-status', {
    headers: { 'Authorization': 'Bearer YOUR_KEY' }
  })
  const data = await resp.json()
  setStatus(data.status)
}

setInterval(checkRetrainStatus, 60000) // check every minute
```

Add a "Model Status" widget to your dashboard showing:
- Last retrain time
- Per-symbol status (✓ success, ✗ failed)
- Next scheduled retrain time
- Option to manually trigger now

