-- Migration: 09-ml-models-checkpoint.sql
-- Add checkpoint_name column to ml_models to reference saved checkpoints

ALTER TABLE IF EXISTS ml_models
  ADD COLUMN IF NOT EXISTS checkpoint_name TEXT;

CREATE INDEX IF NOT EXISTS idx_ml_models_checkpoint_name ON ml_models(checkpoint_name);
