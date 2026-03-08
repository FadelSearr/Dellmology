-- Data Validation Schema
-- Tables for tracking data quality, gaps, and anomalies

-- Results table: Stores validation check results for each data point
CREATE TABLE IF NOT EXISTS data_validation_results (
    id BIGSERIAL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol VARCHAR(10) NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    severity VARCHAR(20) NOT NULL, -- CRITICAL, WARNING, INFO
    issues TEXT, -- Semicolon-separated list of issues found
    recommendations TEXT, -- Semicolon-separated list of recommendations
    validation_score FLOAT8 NOT NULL DEFAULT 100.0, -- 0-100, higher is better
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

-- Ensure primary key includes partitioning column for data_validation_results
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'data_validation_results') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'data_validation_results'::regclass
              AND i.indisprimary
              AND a.attname = 'timestamp'
        ) THEN
            ALTER TABLE data_validation_results DROP CONSTRAINT IF EXISTS data_validation_results_pkey;
            ALTER TABLE data_validation_results ADD PRIMARY KEY (id, timestamp);
        END IF;
    END IF;
END$$;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('data_validation_results', 'timestamp', if_not_exists => TRUE);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_validation_results_symbol_timestamp 
    ON data_validation_results (symbol, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_validation_results_severity 
    ON data_validation_results (severity, timestamp DESC);

-- Statistics table: Aggregated validation statistics per symbol
CREATE TABLE IF NOT EXISTS data_validation_statistics (
    id BIGSERIAL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol VARCHAR(10) NOT NULL,
    min_price FLOAT8,
    max_price FLOAT8,
    avg_price FLOAT8,
    std_dev FLOAT8, -- Standard deviation of prices
    avg_volume BIGINT,
    min_gap_ms BIGINT, -- Minimum gap between data points in milliseconds
    max_gap_ms BIGINT, -- Maximum gap
    avg_gap_ms BIGINT, -- Average gap
    data_point_count BIGINT NOT NULL DEFAULT 0,
    outlier_count BIGINT NOT NULL DEFAULT 0, -- Count of price outliers (>2.5σ)
    gap_violation_count BIGINT NOT NULL DEFAULT 0, -- Count of gaps >5 seconds
    poisoning_indicators BIGINT NOT NULL DEFAULT 0, -- Count of poisoning detections
    validation_score FLOAT8 NOT NULL DEFAULT 100.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

-- Create hypertable for time-series optimization
-- Ensure primary key includes partitioning column for data_validation_statistics
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'data_validation_statistics') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'data_validation_statistics'::regclass
              AND i.indisprimary
              AND a.attname = 'timestamp'
        ) THEN
            ALTER TABLE data_validation_statistics DROP CONSTRAINT IF EXISTS data_validation_statistics_pkey;
            ALTER TABLE data_validation_statistics ADD PRIMARY KEY (id, timestamp);
        END IF;
    END IF;
END$$;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('data_validation_statistics', 'timestamp', if_not_exists => TRUE);
    END IF;
END$$;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_validation_statistics_symbol_timestamp 
    ON data_validation_statistics (symbol, timestamp DESC);

-- Data Quality Dashboard view: Shows recent validation status for each symbol
CREATE OR REPLACE VIEW data_quality_dashboard AS
SELECT 
    symbol,
    COUNT(*) FILTER (WHERE is_valid) as valid_count,
    COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical_count,
    COUNT(*) FILTER (WHERE severity = 'WARNING') as warning_count,
    AVG(validation_score) as avg_validation_score,
    MAX(timestamp) as last_checked,
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_valid) / COUNT(*), 2) as validity_percentage
FROM data_validation_results
WHERE timestamp >= NOW() - INTERVAL '1 day'
GROUP BY symbol
ORDER BY avg_validation_score DESC;

-- Anomaly trends view: Shows patterns in validation issues over time
CREATE OR REPLACE VIEW anomaly_trends AS
SELECT 
    DATE_TRUNC('hour', timestamp) as hour,
    symbol,
    COUNT(*) as issue_count,
    COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical_count,
    AVG(validation_score) as avg_score,
    ARRAY_AGG(DISTINCT severity) as severity_types
FROM data_validation_results
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', timestamp), symbol
ORDER BY hour DESC, symbol;

-- Gap analysis view: Identifies symbols with connectivity issues
CREATE OR REPLACE VIEW gap_analysis AS
SELECT 
    symbol,
    COUNT(*) as total_gaps,
    AVG(max_gap_ms) as avg_max_gap_ms,
    MAX(max_gap_ms) as worst_gap_ms,
    COUNT(*) FILTER (WHERE max_gap_ms > 5000) as gaps_over_5sec,
    ROUND(100.0 * COUNT(*) FILTER (WHERE max_gap_ms > 5000) / COUNT(*), 2) as gap_violation_percentage
FROM data_validation_statistics
WHERE timestamp >= NOW() - INTERVAL '1 day'
GROUP BY symbol
ORDER BY gap_violation_percentage DESC;

-- Outlier analysis view: Shows which symbols have price anomalies
CREATE OR REPLACE VIEW outlier_analysis AS
SELECT 
    symbol,
    COUNT(*) as total_records,
    SUM(outlier_count) as total_outliers,
    ROUND(100.0 * SUM(outlier_count) / SUM(data_point_count), 2) as outlier_percentage,
    AVG(std_dev) as avg_std_dev,
    AVG(max_price - min_price) as avg_price_range
FROM data_validation_statistics
WHERE timestamp >= NOW() - INTERVAL '1 day'
GROUP BY symbol
ORDER BY outlier_percentage DESC;

-- Poisoning detection view: Highlights potential data quality issues
CREATE OR REPLACE VIEW poisoning_detection AS
SELECT 
    symbol,
    COUNT(*) as suspicious_count,
    SUM(poisoning_indicators) as total_poisoning_flags,
    ROUND(100.0 * SUM(poisoning_indicators) / SUM(data_point_count), 2) as poisoning_percentage,
    MAX(timestamp) as last_incident
FROM data_validation_statistics
WHERE timestamp >= NOW() - INTERVAL '7 days'
AND poisoning_indicators > 0
GROUP BY symbol
ORDER BY poisoning_percentage DESC;

