create or replace function public.get_visible_map_pin_shells(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 25000
)
returns table(
  pin_id uuid,
  lat double precision,
  lng double precision,
  pin_type text,
  updated_at timestamptz,
  is_alert boolean
)
language sql
security definer
set search_path = public
as $$
  with params as (
    select
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as center_geog,
      greatest(0, least(coalesce(p_radius_m, 25000), 25000))::int as radius_m,
      auth.uid() as viewer_id
  ),
  blocked as (
    select
      case
        when ub.blocker_id = (select viewer_id from params) then ub.blocked_id
        else ub.blocker_id
      end as user_id
    from public.user_blocks ub
    where ub.blocker_id = (select viewer_id from params)
       or ub.blocked_id = (select viewer_id from params)
  ),
  alert_shells as (
    select
      b.id as pin_id,
      b.latitude as lat,
      b.longitude as lng,
      lower(coalesce(b.type, 'alert')) as pin_type,
      b.created_at as updated_at,
      true as is_alert
    from public.broadcast_alerts b
    cross join params p
    where b.creator_id is not null
      and b.creator_id <> all(select user_id from blocked where user_id is not null)
      and coalesce(b.geog, st_setsrid(st_makepoint(b.longitude, b.latitude), 4326)::geography) is not null
      and st_dwithin(
        coalesce(b.geog, st_setsrid(st_makepoint(b.longitude, b.latitude), 4326)::geography),
        p.center_geog,
        p.radius_m
      )
      and (
        b.creator_id = p.viewer_id
        or not public.is_user_restriction_active(b.creator_id, 'map_hidden', now())
      )
      and (
        b.created_at + make_interval(hours => greatest(1, least(72, coalesce(b.duration_hours, 24)))) > now()
      )
  ),
  user_shells as (
    select
      pr.id as pin_id,
      pr.last_lat as lat,
      pr.last_lng as lng,
      'user'::text as pin_type,
      coalesce(pr.updated_at, pr.location_pinned_until, now()) as updated_at,
      false as is_alert
    from public.profiles pr
    cross join params p
    where pr.id <> p.viewer_id
      and pr.id <> all(select user_id from blocked where user_id is not null)
      and coalesce(pr.hide_from_map, false) = false
      and pr.location_pinned_until is not null
      and pr.location_pinned_until > now()
      and coalesce(pr.location, pr.location_geog) is not null
      and st_dwithin(coalesce(pr.location, pr.location_geog), p.center_geog, p.radius_m)
      and not public.is_user_restriction_active(pr.id, 'map_hidden', now())
  )
  select * from alert_shells
  union all
  select * from user_shells
  order by updated_at desc
  limit 500;
$$;

revoke all on function public.get_visible_map_pin_shells(double precision, double precision, integer) from public, anon;
grant execute on function public.get_visible_map_pin_shells(double precision, double precision, integer) to authenticated;
grant execute on function public.get_visible_map_pin_shells(double precision, double precision, integer) to service_role;
