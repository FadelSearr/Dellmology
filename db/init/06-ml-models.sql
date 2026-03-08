-- Migration: 06-ml-models.sql
-- Create table to store ML model registry metadata (champion/challenger)
CREATE TABLE IF NOT EXISTS ml_models (
    id SERIAL PRIMARY KEY,
    model_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('champion','challenger','archived')),
    metrics JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_models_role ON ml_models(role);

-- Simple upsert helper (optional) - insert a new record for a model
