-- broker flow summary per day and per broker

CREATE TABLE IF NOT EXISTS broker_flow (
    time DATE NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    broker_code VARCHAR(10) NOT NULL,
    buy_volume BIGINT DEFAULT 0,
    sell_volume BIGINT DEFAULT 0,
    net_value BIGINT DEFAULT 0,
    consistency_score FLOAT DEFAULT 0,
    z_score FLOAT DEFAULT 0,
    PRIMARY KEY (time, symbol, broker_code)
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('broker_flow', 'time', if_not_exists => TRUE);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_broker_flow_symbol ON broker_flow (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_broker_flow_netvalue ON broker_flow (net_value DESC, symbol);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        ALTER TABLE broker_flow ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS broker_flow_read_anon ON broker_flow;
        CREATE POLICY broker_flow_read_anon ON broker_flow
            FOR SELECT TO anon, authenticated
            USING (true);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        DROP POLICY IF EXISTS broker_flow_write_service ON broker_flow;
        CREATE POLICY broker_flow_write_service ON broker_flow
            FOR ALL TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;
