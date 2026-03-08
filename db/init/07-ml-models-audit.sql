-- Migration: 07-ml-models-audit.sql
-- Ensure model names are unique and add an audit trail for model lifecycle events

-- Add unique constraint/index on model_name to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_ml_models_model_name ON ml_models (model_name);

-- Audit table for ml_models lifecycle events
CREATE TABLE IF NOT EXISTS ml_model_audit (
    id SERIAL PRIMARY KEY,
    model_name TEXT NOT NULL,
    action TEXT NOT NULL, -- e.g., 'created_challenger', 'promoted', 'archived'
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_model_audit_model ON ml_model_audit(model_name);
