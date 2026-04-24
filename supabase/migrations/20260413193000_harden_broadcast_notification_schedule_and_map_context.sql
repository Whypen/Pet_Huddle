-- Harden broadcast notification delivery and map context resolution.

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
      row_number() over (partition by b.thread_id order by ba.created_at desc) as rn
    from base b
    left join public.broadcast_alerts ba on ba.thread_id = b.thread_id
  )
  select
    b.thread_id,
    coalesce(b.map_id, bt.alert_id) as map_id,
    coalesce(
      nullif(b.type, ''),
      nullif(bt.type, ''),
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
  v_has_job boolean := false;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      select exists(
        select 1 from cron.job where jobname = 'process_broadcast_alert_notifications_minutely'
      ) into v_has_job;
    exception
      when others then
        v_has_job := false;
    end;
  end if;

  if v_has_job then
    return interval '2 minutes';
  end if;

  return interval '0 minutes';
end;
$$;

create or replace function public.notify_on_broadcast_alert_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_location_district text;
  v_delay interval;
begin
  v_new_location_district := nullif(btrim(coalesce(to_jsonb(new)->>'location_district', '')), '');
  v_delay := public.broadcast_notification_queue_delay();

  insert into public.broadcast_alert_notification_queue (
    alert_id,
    recipient_user_id,
    alert_type,
    location_name,
    thread_id,
    available_at
  )
  select
    new.id,
    p.id,
    new.type,
    coalesce(
      v_new_location_district,
      nullif(btrim(new.address), ''),
      nullif(btrim(p.location_district), ''),
      nullif(btrim(p.location_name), ''),
      'your area'
    ),
    new.thread_id,
    now() + v_delay
  from public.profiles p
  where p.id <> new.creator_id
    and p.location_retention_until is not null
    and p.location_retention_until > now()
    and coalesce(p.location, p.location_geog) is not null
    and new.geog is not null
    and st_dwithin(
      coalesce(p.location, p.location_geog),
      new.geog,
      greatest(0, least(coalesce(round(new.range_km * 1000.0)::int, 10000), 150000))
    )
  order by p.location_retention_until desc
  limit 500
  on conflict (alert_id, recipient_user_id) do nothing;

  -- If no active cron job, process due notifications immediately.
  if v_delay = interval '0 minutes' then
    perform public.process_due_broadcast_alert_notifications(500);
  end if;

  return new;
end;
$$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'process_broadcast_alert_notifications_minutely';
    exception
      when others then
        null;
    end;

    begin
      perform cron.schedule(
        'process_broadcast_alert_notifications_minutely',
        '* * * * *',
        $cron$select public.process_due_broadcast_alert_notifications(300);$cron$
      );
    exception
      when others then
        raise notice 'Unable to schedule process_broadcast_alert_notifications_minutely; fallback immediate mode remains active.';
    end;
  end if;
end $$;
