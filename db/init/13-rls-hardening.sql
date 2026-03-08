-- 13-rls-hardening.sql
-- Tighten RLS policies introduced by earlier skeleton migrations.
-- This migration is conservative: it updates SELECT policies to require
-- an authenticated JWT claim or an explicit `is_public` column when present.
-- It leaves service-role policies intact.

DO $$
BEGIN
  -- model_registry: replace permissive public select with authenticated-or-public
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'model_registry') THEN
    ALTER TABLE IF EXISTS public.model_registry ENABLE ROW LEVEL SECURITY;

    -- remove permissive policy if present
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'model_registry' AND policyname = 'models_public_select') THEN
      EXECUTE 'DROP POLICY IF EXISTS models_public_select ON public.model_registry';
    END IF;

    -- create tightened select policy: allow service role, or authenticated JWT, or is_public flag
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'model_registry' AND policyname = 'models_tight_select') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'model_registry' AND column_name = 'is_public') THEN
        EXECUTE $SQ$
          CREATE POLICY models_tight_select ON public.model_registry
          FOR SELECT USING (
            current_setting('dellmology.is_service_role', true) = 'true' OR
            current_setting('jwt.claims.role', true) = 'authenticated' OR
            (COALESCE(is_public::boolean, false) = true)
          );
        $SQ$;
      ELSE
        EXECUTE $SQ$
          CREATE POLICY models_tight_select ON public.model_registry
          FOR SELECT USING (
            current_setting('dellmology.is_service_role', true) = 'true' OR
            current_setting('jwt.claims.role', true) = 'authenticated'
          );
        $SQ$;
      END IF;
    END IF;
  END IF;
END;
$$;

DO $$
BEGIN
  -- broker_flow: tighten select policies similarly
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'broker_flow') THEN
    ALTER TABLE IF EXISTS public.broker_flow ENABLE ROW LEVEL SECURITY;

    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'broker_flow' AND policyname = 'brokerflow_select_all') THEN
      EXECUTE 'DROP POLICY IF EXISTS brokerflow_select_all ON public.broker_flow';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'broker_flow' AND policyname = 'brokerflow_tight_select') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'broker_flow' AND column_name = 'is_public') THEN
        EXECUTE $SQ$
          CREATE POLICY brokerflow_tight_select ON public.broker_flow
          FOR SELECT USING (
            current_setting('dellmology.is_service_role', true) = 'true' OR
            current_setting('jwt.claims.role', true) = 'authenticated' OR
            (COALESCE(is_public::boolean, false) = true)
          );
        $SQ$;
      ELSE
        EXECUTE $SQ$
          CREATE POLICY brokerflow_tight_select ON public.broker_flow
          FOR SELECT USING (
            current_setting('dellmology.is_service_role', true) = 'true' OR
            current_setting('jwt.claims.role', true) = 'authenticated'
          );
        $SQ$;
      END IF;
    END IF;
  END IF;
END;
$$;

-- Note: These policies assume the auth system exposes a `jwt.claims.role` claim
-- and that service-role operations set `dellmology.is_service_role` session var.
-- Review and adapt to your auth model before enabling in production.
