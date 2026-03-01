-- Model alert thresholds configuration table
CREATE TABLE IF NOT EXISTS model_alert_thresholds (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL UNIQUE,
    min_accuracy NUMERIC(5, 2) DEFAULT 80,
    max_loss NUMERIC(10, 6) DEFAULT 0.15,
    alert_on_retrain_failure BOOLEAN DEFAULT true,
    notify_email VARCHAR(255),
    notify_telegram BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_alert_thresholds_symbol ON model_alert_thresholds(symbol);
