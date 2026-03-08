-- table for recording detected whale exits (large net sell events)

CREATE TABLE IF NOT EXISTS exit_whale_events (
    id BIGSERIAL,
    time TIMESTAMPTZ NOT NULL DEFAULT now(),
    symbol VARCHAR(10) NOT NULL,
    broker_id VARCHAR(10),
    net_value BIGINT,
    z_score FLOAT,
    note TEXT,
    PRIMARY KEY (id, time)
);

-- Ensure primary key includes partitioning column for exit_whale_events
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'exit_whale_events') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'exit_whale_events'::regclass
              AND i.indisprimary
              AND a.attname = 'time'
        ) THEN
            ALTER TABLE exit_whale_events DROP CONSTRAINT IF EXISTS exit_whale_events_pkey;
            ALTER TABLE exit_whale_events ADD PRIMARY KEY (id, time);
        END IF;
    END IF;
END$$;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('exit_whale_events', 'time', if_not_exists => TRUE);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_exit_whale_symbol_time ON exit_whale_events (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_exit_whale_netvalue ON exit_whale_events (net_value DESC);
