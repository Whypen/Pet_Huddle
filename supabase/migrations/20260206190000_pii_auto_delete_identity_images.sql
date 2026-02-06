-- PII auto-delete: remove identity_verification images 7 days after verification decision
-- Deletes storage.objects where bucket_id = 'identity_verification' and profile is approved/rejected for 7+ days

create or replace function public.pii_purge_identity_verification()
returns void
language plpgsql
as $$
begin
  delete from storage.objects o
  using public.profiles p
  where o.bucket_id = 'identity_verification'
    and o.owner = p.id
    and p.verification_status in ('approved', 'rejected')
    and p.updated_at <= now() - interval '7 days';
end;
$$;

-- Daily purge at 02:15
select
  case
    when not exists (select 1 from cron.job where jobname = 'pii_purge_daily')
      then cron.schedule('pii_purge_daily', '15 2 * * *', 'select public.pii_purge_identity_verification();')
    else null
  end;
