-- 12-runtime-config-audit.sql
-- Create runtime_config_audit table and trigger to maintain immutable hash chain

CREATE TABLE IF NOT EXISTS public.runtime_config_audit (
  id bigserial PRIMARY KEY,
  config_key text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  actor text,
  source text,
  payload jsonb,
  payload_hash text,
  previous_hash text,
  record_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runtime_config_audit_key ON public.runtime_config_audit(config_key);

-- Trigger function to compute payload_hash and record_hash chaining
CREATE OR REPLACE FUNCTION public.runtime_config_audit_trigger_fn() RETURNS trigger AS $$
DECLARE
  last_hash text;
  payload_txt text;
  payload_h text;
  rec_h text;
BEGIN
  -- compute payload text
  IF NEW.payload IS NULL THEN
    payload_txt := '';
  ELSE
    payload_txt := NEW.payload::text;
  END IF;

  -- compute payload hash
  payload_h := encode(digest(payload_txt, 'sha256'), 'hex');

  -- fetch last record_hash
  SELECT record_hash INTO last_hash FROM public.runtime_config_audit ORDER BY id DESC LIMIT 1;
  IF last_hash IS NULL THEN
    last_hash := 'GENESIS';
  END IF;

  -- set fields on NEW
  NEW.payload_hash := payload_h;
  NEW.previous_hash := last_hash;

  rec_h := encode(digest((NEW.previous_hash || '|' || NEW.config_key || '|' || COALESCE(NEW.old_value, 'NULL') || '|' || NEW.new_value || '|' || COALESCE(NEW.actor, '') || '|' || COALESCE(NEW.source, '') || '|' || COALESCE(NEW.payload_hash, '')), 'sha256'), 'hex');
  NEW.record_hash := rec_h;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Attach trigger: run BEFORE INSERT to populate hash fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'runtime_config_audit_trigger') THEN
    CREATE TRIGGER runtime_config_audit_trigger
    BEFORE INSERT ON public.runtime_config_audit
    FOR EACH ROW EXECUTE FUNCTION public.runtime_config_audit_trigger_fn();
  END IF;
END;
$$;

-- Notes: The trigger uses Postgres' digest() function provided by the pgcrypto extension.
-- Ensure pgcrypto is available in the environment where migrations run.
