-- Enable pg_cron if not already enabled
-- Note: In this repo pg_cron is already referenced in earlier migrations.
-- pg_net is used for HTTP calls from cron (same pattern as monthly-overpass-harvest).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule daily digest at 00:00 UTC
-- Uses app.settings.supabase_url and app.settings.service_role_key GUC pattern
-- matching the existing cron jobs in this repo (see 20260210120000_monthly_overpass_harvest_cron.sql).
-- If the GUC is not set on the hosted project, apply a follow-up migration hardcoding
-- the values (see 20260324150000_brevo_trigger_hardcode_settings.sql for precedent).
select cron.schedule(
  'support-digest-daily',
  '0 0 * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/support-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
