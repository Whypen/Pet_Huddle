-- Fix social Map deep-link target precedence and cron delay guard.

create or replace function public.get_social_feed_alert_context(p_thread_ids uuid[])
returns table(
  thread_id uuid,
  map_id uuid,
  alert_type text
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select t.id as thread_id, t.map_id
    from public.threads t
    where t.id = any(coalesce(p_thread_ids, array[]::uuid[]))
  ),
  by_map as (
    select b.thread_id, b.map_id, ba.type
    from base b
    left join public.broadcast_alerts ba on ba.id = b.map_id
  ),
  by_thread as (
    select
      b.thread_id,
      ba.id as alert_id,
      ba.type,
      row_number() over (partition by b.thread_id order by ba.created_at desc, ba.id desc) as rn
    from base b
    left join public.broadcast_alerts ba on ba.thread_id = b.thread_id
  )
  select
    b.thread_id,
    coalesce(
      bt.alert_id,
      case when b.type is not null then b.map_id else null end
    ) as map_id,
    coalesce(
      nullif(bt.type, ''),
      nullif(b.type, ''),
      'Others'
    ) as alert_type
  from by_map b
  left join by_thread bt on bt.thread_id = b.thread_id and bt.rn = 1;
$$;

revoke all on function public.get_social_feed_alert_context(uuid[]) from public;
grant execute on function public.get_social_feed_alert_context(uuid[]) to authenticated;
grant execute on function public.get_social_feed_alert_context(uuid[]) to service_role;

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
    return interval '2 minutes';
  end if;

  return interval '0 minutes';
end;
$$;
