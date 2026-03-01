-- Performance Optimization Aggregates
-- Continuous aggregates for heavy time-series tables

-- 1-minute rollup of order flow heatmap intensities
CREATE MATERIALIZED VIEW IF NOT EXISTS order_flow_heatmap_1min
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', timestamp) AS bucket,
       symbol,
       avg(bid_volume) AS avg_bid_vol,
       avg(ask_volume) AS avg_ask_vol,
       avg(net_volume) AS avg_net_vol,
       avg(bid_ask_ratio) AS avg_ratio,
       avg(intensity) AS avg_intensity
FROM order_flow_heatmap
GROUP BY bucket, symbol;

-- 5-minute anomaly counts by type
CREATE MATERIALIZED VIEW IF NOT EXISTS order_flow_anomaly_5min
WITH (timescaledb.continuous) AS
SELECT time_bucket('5 minute', timestamp) AS bucket,
       symbol,
       anomaly_type,
       count(*) AS cnt,
       avg(severity = 'HIGH')::int AS high_fraction
FROM order_flow_anomalies
GROUP BY bucket, symbol, anomaly_type;

-- Materialized view for market depth summary
CREATE MATERIALIZED VIEW IF NOT EXISTS market_depth_summary_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', timestamp) AS bucket,
       symbol,
       avg(mid_price) AS avg_mid,
       avg(bid_ask_spread) AS avg_spread,
       avg(total_bid_volume) AS avg_bid_vol,
       avg(total_ask_volume) AS avg_ask_vol
FROM market_depth
GROUP BY bucket, symbol;

-- Refresh policies
SELECT add_continuous_aggregate_policy('order_flow_heatmap_1min',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 minute');

SELECT add_continuous_aggregate_policy('order_flow_anomaly_5min',
    start_offset => INTERVAL '7 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '5 minutes');

SELECT add_continuous_aggregate_policy('market_depth_summary_hourly',
    start_offset => INTERVAL '30 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');
