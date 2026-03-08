-- Performance Optimization Aggregates
-- Continuous aggregates for heavy time-series tables
-- Performance Optimization Aggregates
-- Create TimescaleDB continuous aggregates and associated policies in an idempotent, guarded way.

-- Create materialized/continuous views. Use DROP+CREATE to ensure
-- creation happens outside any PL/pgSQL transaction block (required by
-- CREATE MATERIALIZED VIEW WITH DATA semantics). These are idempotent
-- at the cost of recreating the view when it exists.

-- order_flow_heatmap_1min_mv
-- SUPABASE-ONLY: this continuous aggregate is intended for TimescaleDB
-- and may require Supabase role adjustments if RLS is in effect.
-- It will only be applied when TimescaleDB is available; the migration runner
-- executes CREATE MATERIALIZED VIEW statements using autocommit which is
-- required for WITH DATA variants.
DROP MATERIALIZED VIEW IF EXISTS order_flow_heatmap_1min_mv CASCADE;
CREATE MATERIALIZED VIEW IF NOT EXISTS order_flow_heatmap_1min_mv
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', time) AS bucket,
       symbol,
       avg(bid_volume) AS avg_bid_vol,
       avg(ask_volume) AS avg_ask_vol,
       avg(net_volume) AS avg_net_vol,
       avg(bid_ask_ratio) AS avg_ratio,
       avg(intensity) AS avg_intensity
FROM order_flow_heatmap
GROUP BY bucket, symbol;

-- order_flow_anomaly_5min_mv
DROP MATERIALIZED VIEW IF EXISTS order_flow_anomaly_5min_mv CASCADE;
CREATE MATERIALIZED VIEW IF NOT EXISTS order_flow_anomaly_5min_mv
WITH (timescaledb.continuous) AS
SELECT time_bucket('5 minute', time) AS bucket,
       symbol,
       anomaly_type,
       count(*) AS cnt,
       avg((severity = 'HIGH')::int) AS high_fraction
FROM order_flow_anomalies
GROUP BY bucket, symbol, anomaly_type;

-- market_depth_summary_hourly_mv
DROP MATERIALIZED VIEW IF EXISTS market_depth_summary_hourly_mv CASCADE;
CREATE MATERIALIZED VIEW IF NOT EXISTS market_depth_summary_hourly_mv
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', time) AS bucket,
       symbol,
       avg(mid_price) AS avg_mid,
       avg(bid_ask_spread) AS avg_spread,
       avg(total_bid_volume) AS avg_bid_vol,
       avg(total_ask_volume) AS avg_ask_vol
FROM market_depth
GROUP BY bucket, symbol;

-- Policies: only add when TimescaleDB functions are available and policy not already present
-- Continuous aggregate policies: create them only when TimescaleDB is
-- available and when the continuous aggregate view exists. These calls
-- use TimescaleDB helper functions and will be skipped by the migration
-- runner if TimescaleDB is not present.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        -- Only add policies when the continuous aggregate shows up in the
        -- timescaledb_information view and when the user has confirmed RLS
        -- compatibility.
        IF EXISTS (SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'order_flow_heatmap_1min_mv') THEN
            PERFORM add_continuous_aggregate_policy('order_flow_heatmap_1min_mv',
                start_offset => INTERVAL '1 day',
                end_offset => INTERVAL '1 hour',
                schedule_interval => INTERVAL '1 minute');
        END IF;

        IF EXISTS (SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'order_flow_anomaly_5min_mv') THEN
            PERFORM add_continuous_aggregate_policy('order_flow_anomaly_5min_mv',
                start_offset => INTERVAL '7 days',
                end_offset => INTERVAL '1 hour',
                schedule_interval => INTERVAL '5 minutes');
        END IF;

        IF EXISTS (SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'market_depth_summary_hourly_mv') THEN
            PERFORM add_continuous_aggregate_policy('market_depth_summary_hourly_mv',
                start_offset => INTERVAL '30 days',
                end_offset => INTERVAL '1 hour',
                schedule_interval => INTERVAL '1 hour');
        END IF;
    END IF;
END;
$$;
