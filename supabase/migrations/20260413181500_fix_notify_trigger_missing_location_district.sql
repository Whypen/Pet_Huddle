-- Fix broadcast trigger for schemas where broadcast_alerts has no location_district column.
-- Use JSON access to avoid runtime "record new has no field" errors.

create or replace function public.notify_on_broadcast_alert_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_location_district text;
begin
  v_new_location_district := nullif(btrim(coalesce(to_jsonb(new)->>'location_district', '')), '');

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
    now() + interval '2 minutes'
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

  return new;
end;
$$;
