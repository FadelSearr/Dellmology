-- SUPABASE-ONLY: Row-Level Security (RLS) skeleton and example policies
-- This file provides example RLS policies for key tables. It is intended
-- to be applied only when running against a Supabase/Postgres instance where
-- the SUPABASE_SERVICE_ROLE_KEY is available. The migration runner will skip
-- this file when SUPABASE_* env vars are not configured.

-- Example: enable RLS on the order_flow_heatmap hypertable
-- Replace `current_setting('jwt.claims.sub', true)` checks with your auth
-- provider's claim extraction if different.
ALTER TABLE IF EXISTS order_flow_heatmap ENABLE ROW LEVEL SECURITY;
-- Allow admins (service role) full access — service role should bypass RLS
-- via Supabase configuration; we still add a protective policy for clarity.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_service_role' AND tablename = 'order_flow_heatmap') THEN
        EXECUTE 'CREATE POLICY allow_service_role ON order_flow_heatmap FOR ALL USING (current_setting(''dellmology.is_service_role'', true) = ''true'') WITH CHECK (current_setting(''dellmology.is_service_role'', true) = ''true'')';
    END IF;
END;
$$;

-- Example: allow owners to view rows where `owner_id` matches JWT sub
DO $$
BEGIN
    -- Only create owner-based policy if the `owner_id` column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_flow_heatmap' AND column_name = 'owner_id') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owner_can_select' AND tablename = 'order_flow_heatmap') THEN
            EXECUTE 'CREATE POLICY owner_can_select ON order_flow_heatmap FOR SELECT USING (owner_id::text = current_setting(''jwt.claims.sub'', true))';
        END IF;
    END IF;
END;
$$;

-- Example: market_depth table RLS
ALTER TABLE IF EXISTS market_depth ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'market_read_public' AND tablename = 'market_depth') THEN
        EXECUTE 'CREATE POLICY market_read_public ON market_depth FOR SELECT USING (true)';
    END IF;
END;
$$;

-- Example: model registry RLS skeleton
-- Only enable RLS and create policies if the `model_registry` table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'model_registry') THEN
        ALTER TABLE model_registry ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'models_admin_access' AND tablename = 'model_registry') THEN
            EXECUTE 'CREATE POLICY models_admin_access ON model_registry FOR ALL USING (current_setting(''dellmology.is_service_role'', true) = ''true'') WITH CHECK (current_setting(''dellmology.is_service_role'', true) = ''true'')';
        END IF;
    END IF;
END;
$$;

-- Notes:
-- 1) Supabase injects JWT claims via `current_setting('jwt.claims.<claim>')`.
-- 2) To make the service role bypass RLS in CI/CD, consider setting a
--    session configuration variable (example above uses `dellmology.is_service_role`).
-- 3) Review and adapt policies to your auth model before enabling in prod.
