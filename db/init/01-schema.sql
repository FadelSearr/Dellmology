-- enable timescaledb extension (required for hypertables)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Schema for the 'config' table to store key-value pairs like the session token.
CREATE TABLE IF NOT EXISTS config (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NULL, -- To store the token's expiration date
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create a function to automatically update the 'updated_at' timestamp.
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the table, ensuring it's not created if it already exists.
DO
$$
BEGIN
  IF NOT EXISTS (
      SELECT 1
      FROM   pg_trigger
      WHERE  tgname = 'set_timestamp'
      AND    tgrelid = 'config'::regclass)
  THEN
      CREATE TRIGGER set_timestamp
      BEFORE UPDATE ON config
      FOR EACH ROW
      EXECUTE PROCEDURE trigger_set_timestamp();
  END IF;
END;
$$
LANGUAGE plpgsql;


-- Schema for Haka-Haki real-time trades.
CREATE TABLE IF NOT EXISTS trades (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  price DECIMAL NOT NULL,
  volume BIGINT NOT NULL,
  trade_type VARCHAR(10) NOT NULL -- 'HAKA', 'HAKI', 'NORMAL'
);

-- convert to hypertable; use explicit casts to satisfy function signature
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('trades'::regclass, 'timestamp'::name, if_not_exists => TRUE);
  END IF;
END$$;
CREATE INDEX IF NOT EXISTS trades_symbol_timestamp_idx ON trades (symbol, timestamp DESC);

-- additional hypertable for broker_flow added later in other file (see 05-broker-flow.sql)
CREATE INDEX IF NOT EXISTS trades_timestamp_idx ON trades (timestamp DESC);


-- Schema for End-of-Day broker summary statistics.
CREATE TABLE IF NOT EXISTS broker_summaries (
    id BIGSERIAL,
    date DATE NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    broker_id VARCHAR(10) NOT NULL,
    net_buy_value BIGINT NOT NULL,
    avg_buy_price DECIMAL NOT NULL,
    avg_sell_price DECIMAL NOT NULL,
    PRIMARY KEY (date, symbol, broker_id)
);

CREATE INDEX IF NOT EXISTS broker_summaries_symbol_date_idx ON broker_summaries (symbol, date DESC);
CREATE INDEX IF NOT EXISTS broker_summaries_broker_id_date_idx ON broker_summaries (broker_id, date DESC);

-- Schema for historical daily price data (OHLCV).
CREATE TABLE IF NOT EXISTS daily_prices (
    id BIGSERIAL,
    date DATE NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    open DECIMAL NOT NULL,
    high DECIMAL NOT NULL,
    low DECIMAL NOT NULL,
    close DECIMAL NOT NULL,
    volume BIGINT NOT NULL,
    PRIMARY KEY (date, symbol)
);

CREATE INDEX IF NOT EXISTS daily_prices_symbol_date_idx ON daily_prices (symbol, date DESC);

-- Schema for storing CNN model predictions.
CREATE TABLE IF NOT EXISTS cnn_predictions (
  id BIGSERIAL,
  date DATE NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  prediction VARCHAR(10) NOT NULL, -- 'UP' or 'DOWN'
  confidence_up DECIMAL NOT NULL, -- The model's raw output for the 'UP' class
  confidence_down DECIMAL NOT NULL, -- The model's raw output for the 'DOWN' class
  model_version VARCHAR(50), -- e.g., the checkpoint name
  PRIMARY KEY (date, symbol)
);

CREATE INDEX IF NOT EXISTS cnn_predictions_symbol_date_idx ON cnn_predictions (symbol, date DESC);

-- ---- Security hardening (RLS) ----
-- This block is safe on local Postgres and Supabase; it only applies policies when roles exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
    ALTER TABLE broker_summaries ENABLE ROW LEVEL SECURITY;
    ALTER TABLE daily_prices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE cnn_predictions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS trades_read_anon ON trades;
    CREATE POLICY trades_read_anon ON trades
      FOR SELECT TO anon, authenticated
      USING (true);

    DROP POLICY IF EXISTS broker_summaries_read_anon ON broker_summaries;
    CREATE POLICY broker_summaries_read_anon ON broker_summaries
      FOR SELECT TO anon, authenticated
      USING (true);

    DROP POLICY IF EXISTS daily_prices_read_anon ON daily_prices;
    CREATE POLICY daily_prices_read_anon ON daily_prices
      FOR SELECT TO anon, authenticated
      USING (true);

    DROP POLICY IF EXISTS cnn_predictions_read_anon ON cnn_predictions;
    CREATE POLICY cnn_predictions_read_anon ON cnn_predictions
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    DROP POLICY IF EXISTS trades_write_service_role ON trades;
    CREATE POLICY trades_write_service_role ON trades
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);

    DROP POLICY IF EXISTS broker_summaries_write_service_role ON broker_summaries;
    CREATE POLICY broker_summaries_write_service_role ON broker_summaries
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);

    DROP POLICY IF EXISTS daily_prices_write_service_role ON daily_prices;
    CREATE POLICY daily_prices_write_service_role ON daily_prices
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);

    DROP POLICY IF EXISTS cnn_predictions_write_service_role ON cnn_predictions;
    CREATE POLICY cnn_predictions_write_service_role ON cnn_predictions
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
