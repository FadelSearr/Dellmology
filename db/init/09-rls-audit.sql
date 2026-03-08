-- 09-rls-audit.sql
-- Adds an audit table and an audit trigger function; creates a trigger for ml_models if present.

CREATE TABLE IF NOT EXISTS public.ml_audit_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  operation text NOT NULL,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

CREATE OR REPLACE FUNCTION public.ml_audit_trigger_fn() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.ml_audit_log(table_name, operation, changed_by, payload)
      VALUES (TG_TABLE_NAME, TG_OP, current_setting('app.current_user', true), row_to_json(OLD)::jsonb);
    RETURN OLD;
  ELSE
    INSERT INTO public.ml_audit_log(table_name, operation, changed_by, payload)
      VALUES (TG_TABLE_NAME, TG_OP, current_setting('app.current_user', true), row_to_json(NEW)::jsonb);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger on ml_models if the table exists; if not, skip with notice.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ml_models') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ml_models_audit_trigger') THEN
      CREATE TRIGGER ml_models_audit_trigger
      AFTER INSERT OR UPDATE OR DELETE ON public.ml_models
      FOR EACH ROW EXECUTE FUNCTION public.ml_audit_trigger_fn();
    END IF;
  ELSE
    RAISE NOTICE 'ml_models table not present; skipping ml_models audit trigger creation';
  END IF;
END;
$$;
