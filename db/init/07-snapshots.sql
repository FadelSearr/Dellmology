-- Create snapshots table for persisted snapshots (used by web snapshot API)
-- Run this on your Postgres/TimescaleDB (Supabase) instance.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snapshots_created_at_idx ON snapshots(created_at DESC);
