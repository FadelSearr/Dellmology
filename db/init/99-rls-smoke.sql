-- RLS smoke verification script
-- Run after applying schema init files on environments with Supabase roles.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'RLS smoke: role anon exists';
  ELSE
    RAISE NOTICE 'RLS smoke: role anon not found';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE NOTICE 'RLS smoke: role service_role exists';
  ELSE
    RAISE NOTICE 'RLS smoke: role service_role not found';
  END IF;
END $$;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'trades',
    'broker_summaries',
    'daily_prices',
    'cnn_predictions',
    'broker_flow',
    'order_flow_heatmap',
    'order_flow_anomalies',
    'order_events',
    'broker_zscore',
    'market_depth',
    'haka_haki_summary'
  )
ORDER BY tablename;

SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'trades',
    'broker_summaries',
    'daily_prices',
    'cnn_predictions',
    'broker_flow',
    'order_flow_heatmap',
    'order_flow_anomalies',
    'order_events',
    'broker_zscore',
    'market_depth',
    'haka_haki_summary'
  )
ORDER BY tablename, policyname;
