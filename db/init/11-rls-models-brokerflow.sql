-- 11-rls-models-brokerflow.sql
-- SUPABASE-ONLY: Apply Row-Level Security policies for `model_registry` and `broker_flow` tables.
-- Intended to be safe: enables RLS and creates conservative policies that
-- allow read access for non-sensitive queries but restrict write operations
-- to the service role (or explicit owners where applicable).

DO $$
BEGIN
  -- model_registry table: enable RLS if present
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'model_registry') THEN
    ALTER TABLE IF EXISTS public.model_registry ENABLE ROW LEVEL SECURITY;

    -- Allow service role (set via session variable) full access
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'model_registry' AND policyname = 'models_service_role_all') THEN
      EXECUTE 'CREATE POLICY models_service_role_all ON public.model_registry FOR ALL USING (current_setting(''dellmology.is_service_role'', true) = ''true'') WITH CHECK (current_setting(''dellmology.is_service_role'', true) = ''true'')';
    END IF;

    -- Allow read-only SELECT for authenticated users (example: allow public read)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'model_registry' AND policyname = 'models_public_select') THEN
      EXECUTE 'CREATE POLICY models_public_select ON public.model_registry FOR SELECT USING (true)';
    END IF;
  END IF;
END;
$$;

DO $$
BEGIN
  -- broker_flow table: enable RLS if present (sensitive broker flows may be guarded)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'broker_flow') THEN
    ALTER TABLE IF EXISTS public.broker_flow ENABLE ROW LEVEL SECURITY;

    -- Service role full access
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'broker_flow' AND policyname = 'brokerflow_service_role_all') THEN
      EXECUTE 'CREATE POLICY brokerflow_service_role_all ON public.broker_flow FOR ALL USING (current_setting(''dellmology.is_service_role'', true) = ''true'') WITH CHECK (current_setting(''dellmology.is_service_role'', true) = ''true'')';
    END IF;

    -- Allow SELECT for rows that are public (if column `is_public` exists)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'broker_flow' AND column_name = 'is_public') THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'broker_flow' AND policyname = 'brokerflow_public_select') THEN
        EXECUTE 'CREATE POLICY brokerflow_public_select ON public.broker_flow FOR SELECT USING (is_public = true)';
      END IF;
    ELSE
      -- Fallback: allow SELECT for all (change this if you require stricter access)
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'broker_flow' AND policyname = 'brokerflow_select_all') THEN
        EXECUTE 'CREATE POLICY brokerflow_select_all ON public.broker_flow FOR SELECT USING (true)';
      END IF;
    END IF;

    -- Owner-based update/delete if `owner_id` exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'broker_flow' AND column_name = 'owner_id') THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'broker_flow' AND policyname = 'brokerflow_owner_modify') THEN
        EXECUTE 'CREATE POLICY brokerflow_owner_modify ON public.broker_flow FOR UPDATE, DELETE USING (owner_id::text = current_setting(''jwt.claims.sub'', true)) WITH CHECK (owner_id::text = current_setting(''jwt.claims.sub'', true))';
      END IF;
    END IF;
  END IF;
END;
$$;

-- Notes:
-- - These are conservative example policies. Review in your Supabase project
--   and adapt `USING` and `WITH CHECK` clauses to match your auth model.
-- - The migrations runner in `apps/ml-engine/scripts/run_migrations.py` is
--   designed to skip or run these files depending on environment variables.
