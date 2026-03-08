-- Migration: 08-ml-models-rls.sql
-- Row-Level Security (RLS) skeleton for `ml_models` and audit table.
-- NOTE: these policies are examples for Supabase/Postgres. Review and adapt
-- to your deployment and service role strategy before applying.

-- Enable RLS on ml_models
ALTER TABLE IF EXISTS ml_models ENABLE ROW LEVEL SECURITY;

-- Allow selects for all authenticated users (adjust as needed)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ml_models_select_policy') THEN
        EXECUTE $sql$ CREATE POLICY ml_models_select_policy ON ml_models FOR SELECT USING (true); $sql$;
    END IF;
END$$;

-- Allow inserts/updates/deletes only by a service role or specific role
-- Replace 'auth.role() = ''service_role''' with your deployment's check.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ml_models_service_write_policy') THEN
        EXECUTE $sql$ CREATE POLICY ml_models_service_write_policy ON ml_models FOR ALL
            USING (current_setting('my.auth_role', true) = 'service_role')
            WITH CHECK (current_setting('my.auth_role', true) = 'service_role'); $sql$;
    END IF;
END$$;

-- RLS for audit table: allow inserts by service role only
ALTER TABLE IF EXISTS ml_model_audit ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ml_model_audit_insert_policy') THEN
        EXECUTE $sql$ CREATE POLICY ml_model_audit_insert_policy ON ml_model_audit FOR INSERT
            WITH CHECK (current_setting('my.auth_role', true) = 'service_role'); $sql$;
    END IF;
END$$;

-- NOTE: Supabase uses JWT claims and policy expressions like
-- (auth.role() = 'authenticated') or (auth.token() IS NOT NULL).
-- Keep this file as a template and apply the correct expressions for your
-- environment. Do NOT run these policies until you've validated them.
