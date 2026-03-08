-- This migration provides a JSONB-backed metrics table for flexible model evaluation
-- Use a distinct table name to avoid colliding with earlier structured `model_metrics` table
CREATE TABLE IF NOT EXISTS model_metrics_jsonb (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_metrics_jsonb_created_at_idx ON model_metrics_jsonb(created_at DESC);
