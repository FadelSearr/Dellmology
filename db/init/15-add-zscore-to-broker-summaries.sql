-- Add z_score and consistency_score columns to broker_summaries for compatibility with broker_flow
ALTER TABLE IF EXISTS broker_summaries
    ADD COLUMN IF NOT EXISTS z_score DOUBLE PRECISION DEFAULT 0,
    ADD COLUMN IF NOT EXISTS consistency_score DOUBLE PRECISION DEFAULT 0;

-- Index to help queries ordering by z_score (descending) for anomaly detection
CREATE INDEX IF NOT EXISTS idx_broker_summaries_zscore ON broker_summaries (z_score DESC, date DESC);
