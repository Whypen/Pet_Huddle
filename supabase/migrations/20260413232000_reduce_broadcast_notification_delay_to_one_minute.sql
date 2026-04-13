-- Ensure queued broadcast notifications are visible within ~2 minutes in minutely cron mode.

create or replace function public.broadcast_notification_queue_delay()
returns interval
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_active_job boolean := false;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      select exists(
        select 1
        from cron.job
        where jobname = 'process_broadcast_alert_notifications_minutely'
          and coalesce(active, true) = true
      ) into v_has_active_job;
    exception
      when others then
        v_has_active_job := false;
    end;
  end if;

  if v_has_active_job then
    return interval '1 minute';
  end if;

  return interval '0 minutes';
end;
$$;
