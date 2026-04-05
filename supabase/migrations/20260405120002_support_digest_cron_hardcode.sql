-- Fix support-digest-daily cron to use hardcoded project URL + service role key.
-- current_setting('app.settings.*') GUCs require ALTER DATABASE/ROLE (superuser)
-- which is not available on hosted Supabase — they silently return NULL and the
-- cron body errors without any visible failure.
-- Pattern matches 20260324150000_brevo_trigger_hardcode_settings.sql.

-- Remove the GUC-dependent version created by 20260405120001.
select cron.unschedule('support-digest-daily');

-- Reschedule with hardcoded values — deterministic on both local and remote.
select cron.schedule(
  'support-digest-daily',
  '0 0 * * *',
  $$
  select net.http_post(
    url     := 'https://ztrbourwcnhrpmzwlrcn.supabase.co/functions/v1/support-digest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cmJvdXJ3Y25ocnBtendscmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTM1NDY0MywiZXhwIjoyMDg0OTMwNjQzfQ.h4ccDhIeiOhDk9x-YgAGkgME9Nc372_RIWE0nQ9hnNA',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
