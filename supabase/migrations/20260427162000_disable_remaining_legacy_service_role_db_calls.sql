-- Disable remaining database-owned HTTP callers that depend on
-- app.settings.service_role_key. Supabase Edge Functions should own outbound
-- service-role work using project secrets, not database GUC-stored JWTs.

select cron.unschedule(jobid)
from cron.job
where command ilike '%app.settings.service_role_key%'
   or command ilike '%removed_legacy_service_role_jwt%'
   or command ilike '%/functions/v1/support-digest%'
   or command ilike '%/functions/v1/overpass-harvest%';

create or replace function public.process_service_payout_releases()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
begin
  raise warning
    '[payout] database payout release sweep skipped: legacy service-role JWT DB network call removed; use an Edge Function scheduler with project secrets.';

  return 0;
end;
$function$;
