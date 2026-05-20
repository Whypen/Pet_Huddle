-- Remove legacy JWT-shaped Supabase service-role usage from database-side
-- network calls. Edge Functions now own Brevo sync with project secrets and
-- internal service-role guards.

create or replace function public.notify_brevo_verification_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.verification_status is not distinct from new.verification_status then
    return new;
  end if;

  raise warning
    '[brevo] verification status DB trigger skipped for user %: legacy service-role JWT removed; sync must be emitted by Edge Functions.',
    new.id;

  return new;
end;
$$;

drop trigger if exists trg_brevo_verification_status_changed on public.profiles;
create trigger trg_brevo_verification_status_changed
  after update of verification_status
  on public.profiles
  for each row
  execute function public.notify_brevo_verification_status_changed();

select cron.unschedule(jobid)
from cron.job
where jobname = 'support-digest-daily';
