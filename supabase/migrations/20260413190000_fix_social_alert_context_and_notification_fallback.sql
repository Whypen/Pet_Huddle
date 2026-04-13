-- Fixes:
-- 1) Ensure social feed can always resolve map_id + alert_type for News badge/See on Map via security definer RPC.
-- 2) Ensure broadcast notifications are delivered even when pg_cron is unavailable.

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
  select
    t.id as thread_id,
    t.map_id,
    coalesce(
      nullif(b.type, ''),
      'Others'
    ) as alert_type
  from public.threads t
  left join public.broadcast_alerts b on b.id = t.map_id
  where t.id = any(coalesce(p_thread_ids, array[]::uuid[]));
$$;

revoke all on function public.get_social_feed_alert_context(uuid[]) from public;
grant execute on function public.get_social_feed_alert_context(uuid[]) to authenticated;
grant execute on function public.get_social_feed_alert_context(uuid[]) to service_role;

create or replace function public.notify_on_broadcast_alert_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_location_district text;
  v_delay interval;
  v_has_cron boolean;
begin
  v_new_location_district := nullif(btrim(coalesce(to_jsonb(new)->>'location_district', '')), '');
  v_has_cron := exists (select 1 from pg_namespace where nspname = 'cron');
  v_delay := case when v_has_cron then interval '2 minutes' else interval '0 minutes' end;

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

  if not v_has_cron then
    perform public.process_due_broadcast_alert_notifications(500);
  end if;

  return new;
end;
$$;
