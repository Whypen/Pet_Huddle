-- Security remediation: remove hardcoded service role key from cron and trigger.
-- Replaces literal JWT in:
--   20260405120002_support_digest_cron_hardcode.sql  (cron job)
--   20260324150000_brevo_trigger_hardcode_settings.sql (trigger function)
--
-- Pattern: vault.decrypted_secrets lookup at runtime.
-- REQUIRED before cron/trigger will function:
--   Run in Supabase SQL editor (not in a migration):
--     select vault.create_secret('https://ztrbourwcnhrpmzwlrcn.supabase.co', 'supabase_project_url', 'Project base URL');
--     select vault.create_secret('<ROTATED_SERVICE_ROLE_KEY>', 'supabase_service_role_key', 'Service role JWT for pg_cron/trigger calls');
--
-- The old service role key committed in 20260324150000 and 20260405120002
-- must be considered leaked. Rotate it in Supabase dashboard before running
-- the vault.create_secret call above.

-- ── 1. Support-digest cron: replace hardcoded JWT with Vault lookup ───────────

select cron.unschedule('support-digest-daily');

select cron.schedule(
  'support-digest-daily',
  '0 0 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret
                from vault.decrypted_secrets
                where name = 'supabase_project_url')
               || '/functions/v1/support-digest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'supabase_service_role_key'
      ),
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── 2. Brevo trigger function: replace hardcoded JWT with Vault lookup ────────

CREATE OR REPLACE FUNCTION public.notify_brevo_verification_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF OLD.verification_status IS NOT DISTINCT FROM NEW.verification_status THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_project_url';

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_service_role_key';

  BEGIN
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/brevo-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object(
        'event',   'verification_completed',
        'user_id', NEW.id::text
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[brevo] verification trigger failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
