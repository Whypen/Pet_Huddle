-- Superseded by 20260427154500_remove_legacy_supabase_jwt_from_db_network_calls.sql.
-- Do not hardcode Supabase service-role JWTs in database cron jobs.

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
      'Authorization', 'Bearer removed_legacy_service_role_jwt',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
