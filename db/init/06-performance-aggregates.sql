-- Performance Optimization Aggregates
-- Continuous aggregates for heavy time-series tables

DO $$
    avg(ask_volume) AS avg_ask_vol,
    IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'order_flow_heatmap_1min_mv') THEN
        EXECUTE $$
        CREATE MATERIALIZED VIEW order_flow_heatmap_1min_mv
        WITH (timescaledb.continuous) AS
        SELECT time_bucket('1 minute', time) AS bucket,
               symbol,
               avg(bid_volume) AS avg_bid_vol,
               avg(ask_volume) AS avg_bid_vol,
               avg(net_volume) AS avg_net_vol,
               avg(bid_ask_ratio) AS avg_ratio,
               avg(intensity) AS avg_intensity
        FROM order_flow_heatmap
        GROUP BY bucket, symbol;
        $$;
    END IF;
END$$;

-- 5-minute anomaly counts by type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'order_flow_anomaly_5min_mv') THEN
        EXECUTE $$
        CREATE MATERIALIZED VIEW order_flow_anomaly_5min_mv
        WITH (timescaledb.continuous) AS
        SELECT time_bucket('5 minute', time) AS bucket,
               symbol,
               anomaly_type,
               count(*) AS cnt,
               avg(severity = 'HIGH')::int AS high_fraction
        FROM order_flow_anomalies
        GROUP BY bucket, symbol, anomaly_type;
        $$;
    END IF;
END$$;

-- Materialized view for market depth summary
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'market_depth_summary_hourly_mv') THEN
        EXECUTE $$
        CREATE MATERIALIZED VIEW market_depth_summary_hourly_mv
        WITH (timescaledb.continuous) AS
        SELECT time_bucket('1 hour', time) AS bucket,
               symbol,
               avg(mid_price) AS avg_mid,
               avg(bid_ask_spread) AS avg_spread,
               avg(total_bid_volume) AS avg_bid_vol,
               avg(total_ask_volume) AS avg_ask_vol
        FROM market_depth
        GROUP BY bucket, symbol;
        $$;
    END IF;
END$$;

-- Refresh policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'order_flow_heatmap_1min_mv') THEN
        PERFORM add_continuous_aggregate_policy('order_flow_heatmap_1min_mv',
            start_offset => INTERVAL '1 day',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '1 minute');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'order_flow_anomaly_5min_mv') THEN
        PERFORM add_continuous_aggregate_policy('order_flow_anomaly_5min_mv',
            start_offset => INTERVAL '7 days',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '5 minutes');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'market_depth_summary_hourly_mv') THEN
        PERFORM add_continuous_aggregate_policy('market_depth_summary_hourly_mv',
            start_offset => INTERVAL '30 days',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '1 hour');
    END IF;
END$$;
