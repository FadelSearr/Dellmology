-- Order Flow Heatmap & Anomaly Detection Schema
-- TimescaleDB extension for time-series data

-- Create hypertable for real-time order flow heatmap data
CREATE TABLE IF NOT EXISTS order_flow_heatmap (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    bid_volume BIGINT DEFAULT 0,
    ask_volume BIGINT DEFAULT 0,
    net_volume BIGINT DEFAULT 0,
    bid_ask_ratio DECIMAL(5, 3) DEFAULT 1.0,
    intensity DECIMAL(5, 3) DEFAULT 0.5,
    trade_count INT DEFAULT 0,
    PRIMARY KEY (time, symbol, price)
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('order_flow_heatmap', 'time', if_not_exists => TRUE);
    END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_order_flow_symbol_time ON order_flow_heatmap (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_order_flow_price ON order_flow_heatmap (symbol, price);

-- 1-minute continuous aggregation for performance
CREATE TABLE IF NOT EXISTS order_flow_heatmap_1min (
    bucket TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    avg_bid_vol DECIMAL(15, 2),
    avg_ask_vol DECIMAL(15, 2),
    avg_net_vol DECIMAL(15, 2),
    avg_ratio DECIMAL(5, 3),
    avg_intensity DECIMAL(5, 3),
    trade_count INT,
    PRIMARY KEY (bucket, symbol, price)
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('order_flow_heatmap_1min', 'bucket', if_not_exists => TRUE);
    END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_heatmap_1min_symbol ON order_flow_heatmap_1min (symbol, bucket DESC);

-- Order flow anomalies (spoofing, phantom liquidity, wash sales)
CREATE TABLE IF NOT EXISTS order_flow_anomalies (
    id SERIAL,
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    anomaly_type VARCHAR(50) NOT NULL, -- 'SPOOFING', 'PHANTOM_LIQUIDITY', 'WASH_SALE', 'LAYERING', 'ICEBERG'
    price DECIMAL(10, 2),
    volume BIGINT,
    severity VARCHAR(10) NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH'
    description TEXT,
    is_confirmed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, time)
);
-- Ensure primary key includes partitioning column to satisfy Timescale
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'order_flow_anomalies') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'order_flow_anomalies'::regclass
              AND i.indisprimary
              AND a.attname = 'time'
        ) THEN
            ALTER TABLE order_flow_anomalies DROP CONSTRAINT IF EXISTS order_flow_anomalies_pkey;
            ALTER TABLE order_flow_anomalies ADD PRIMARY KEY (id, time);
        END IF;
    END IF;
END$$;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('order_flow_anomalies', 'time', if_not_exists => TRUE);
    END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_anomaly_symbol_time ON order_flow_anomalies (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_severity ON order_flow_anomalies (severity, symbol);

-- Market depth snapshots (bid/ask levels)
CREATE TABLE IF NOT EXISTS market_depth (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    bid_levels JSONB NOT NULL, -- {"price": volume, ...}
    ask_levels JSONB NOT NULL,
    total_bid_volume BIGINT,
    total_ask_volume BIGINT,
    mid_price DECIMAL(10, 2),
    bid_ask_spread DECIMAL(10, 2),
    spread_bps INT, -- basis points
    PRIMARY KEY (time, symbol)
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('market_depth', 'time', if_not_exists => TRUE);
    END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_market_depth_symbol ON market_depth (symbol, time DESC);

-- Order lifetime tracking (for spoofing detection)
CREATE TABLE IF NOT EXISTS order_events (
    id SERIAL,
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    price DECIMAL(10, 2),
    volume BIGINT,
    side VARCHAR(10), -- 'BID' or 'ASK'
    event_type VARCHAR(20), -- 'PLACED', 'MODIFIED', 'CANCELLED', 'EXECUTED'    
    order_id VARCHAR(100),
    broker_code VARCHAR(10),
    duration_ms INT, -- how long order existed before cancellation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, time)
);
-- Ensure primary key includes partitioning column for order_events
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'order_events') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'order_events'::regclass
              AND i.indisprimary
              AND a.attname = 'time'
        ) THEN
            ALTER TABLE order_events DROP CONSTRAINT IF EXISTS order_events_pkey;
            ALTER TABLE order_events ADD PRIMARY KEY (id, time);
        END IF;
    END IF;
END$$;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('order_events', 'time', if_not_exists => TRUE);
    END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_order_events_symbol ON order_events (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_type ON order_events (event_type, symbol);

-- HAKA/HAKI aggregation summary
CREATE TABLE IF NOT EXISTS haka_haki_summary (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    haka_volume BIGINT DEFAULT 0, -- Aggressive Buy (at ask)
    haki_volume BIGINT DEFAULT 0, -- Aggressive Sell (at bid)
    haka_ratio DECIMAL(5, 3), -- HAKA / (HAKA + HAKI)
    dominance VARCHAR(10), -- 'HAKA', 'HAKI', 'BALANCED'
    net_pressure INT, -- (HAKA - HAKI) / (HAKA + HAKI) * 100
    PRIMARY KEY (time, symbol)
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('haka_haki_summary', 'time', if_not_exists => TRUE);
    END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_haka_haki_symbol ON haka_haki_summary (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_haka_haki_dominance ON haka_haki_summary (dominance, symbol);

-- Broker Z-Score tracking (for whale detection)
CREATE TABLE IF NOT EXISTS broker_zscore (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    broker_code VARCHAR(10) NOT NULL,
    net_volume BIGINT,
    z_score DECIMAL(8, 3),
    is_anomaly BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (time, symbol, broker_code)
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('broker_zscore', 'time', if_not_exists => TRUE);
    END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_broker_zscore_symbol ON broker_zscore (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_broker_zscore_anomaly ON broker_zscore (is_anomaly, symbol, time DESC);


DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated';
        EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role';
    END IF;
END$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        ALTER TABLE order_flow_heatmap ENABLE ROW LEVEL SECURITY;
        ALTER TABLE order_flow_anomalies ENABLE ROW LEVEL SECURITY;
        ALTER TABLE market_depth ENABLE ROW LEVEL SECURITY;
        ALTER TABLE haka_haki_summary ENABLE ROW LEVEL SECURITY;
        ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
        ALTER TABLE broker_zscore ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS order_flow_heatmap_read_anon ON order_flow_heatmap;
        CREATE POLICY order_flow_heatmap_read_anon ON order_flow_heatmap FOR SELECT TO anon, authenticated USING (true);

        DROP POLICY IF EXISTS order_flow_anomalies_read_anon ON order_flow_anomalies;
        CREATE POLICY order_flow_anomalies_read_anon ON order_flow_anomalies FOR SELECT TO anon, authenticated USING (true);

        DROP POLICY IF EXISTS market_depth_read_anon ON market_depth;
        CREATE POLICY market_depth_read_anon ON market_depth FOR SELECT TO anon, authenticated USING (true);

        DROP POLICY IF EXISTS haka_haki_summary_read_anon ON haka_haki_summary;
        CREATE POLICY haka_haki_summary_read_anon ON haka_haki_summary FOR SELECT TO anon, authenticated USING (true);

        DROP POLICY IF EXISTS order_events_read_anon ON order_events;
        CREATE POLICY order_events_read_anon ON order_events FOR SELECT TO anon, authenticated USING (true);

        DROP POLICY IF EXISTS broker_zscore_read_anon ON broker_zscore;
        CREATE POLICY broker_zscore_read_anon ON broker_zscore FOR SELECT TO anon, authenticated USING (true);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        DROP POLICY IF EXISTS order_flow_heatmap_write_service ON order_flow_heatmap;
        CREATE POLICY order_flow_heatmap_write_service ON order_flow_heatmap FOR ALL TO service_role USING (true) WITH CHECK (true);

        DROP POLICY IF EXISTS order_flow_anomalies_write_service ON order_flow_anomalies;
        CREATE POLICY order_flow_anomalies_write_service ON order_flow_anomalies FOR ALL TO service_role USING (true) WITH CHECK (true);

        DROP POLICY IF EXISTS market_depth_write_service ON market_depth;
        CREATE POLICY market_depth_write_service ON market_depth FOR ALL TO service_role USING (true) WITH CHECK (true);

        DROP POLICY IF EXISTS haka_haki_summary_write_service ON haka_haki_summary;
        CREATE POLICY haka_haki_summary_write_service ON haka_haki_summary FOR ALL TO service_role USING (true) WITH CHECK (true);

        DROP POLICY IF EXISTS order_events_write_service ON order_events;
        CREATE POLICY order_events_write_service ON order_events FOR ALL TO service_role USING (true) WITH CHECK (true);

        DROP POLICY IF EXISTS broker_zscore_write_service ON broker_zscore;
        CREATE POLICY broker_zscore_write_service ON broker_zscore FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE order_flow_heatmap IS 'Real-time order flow data per price level for heatmap visualization';
COMMENT ON COLUMN order_flow_heatmap.intensity IS 'Normalized intensity score 0-1 based on volume and activity';
COMMENT ON TABLE order_flow_anomalies IS 'Detected order flow anomalies: spoofing, phantom liquidity, wash sales, layering, iceberg';
COMMENT ON TABLE market_depth IS 'Market depth snapshots with full bid/ask levels';
COMMENT ON TABLE haka_haki_summary IS 'HAKA (aggressive buy) vs HAKI (aggressive sell) aggregations';
