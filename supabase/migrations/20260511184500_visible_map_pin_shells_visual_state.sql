drop function if exists public.get_visible_map_pin_shells(double precision, double precision, integer);

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
  is_alert boolean,
  alert_type text,
  marker_state text,
  display_name text,
  avatar_url text,
  is_verified boolean,
  is_invisible boolean,
  gender_genre text
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
      true as is_alert,
      b.type as alert_type,
      case
        when b.created_at + make_interval(hours => greatest(1, least(72, coalesce(b.duration_hours, 24)))) > now()
          then 'active'
        when now() <= (
          b.created_at
          + make_interval(hours => greatest(1, least(72, coalesce(b.duration_hours, 24))))
          + interval '7 days'
        )
          then 'expired_dot'
        else 'hidden'
      end as marker_state,
      null::text as display_name,
      null::text as avatar_url,
      false as is_verified,
      false as is_invisible,
      null::text as gender_genre
    from public.broadcast_alerts b
    cross join params p
    where b.creator_id is not null
      and not exists (select 1 from blocked x where x.user_id = b.creator_id)
      and coalesce(b.geog, st_setsrid(st_makepoint(b.longitude, b.latitude), 4326)::geography) is not null
      and st_dwithin(
        coalesce(b.geog, st_setsrid(st_makepoint(b.longitude, b.latitude), 4326)::geography),
        p.center_geog,
        p.radius_m
      )
      and (
        b.creator_id = p.viewer_id
        or p.viewer_id is null
        or not public.is_user_restriction_active(b.creator_id, 'map_hidden', now())
      )
      and (
        b.created_at + make_interval(hours => greatest(1, least(72, coalesce(b.duration_hours, 24)))) > now()
        or now() <= (
          b.created_at
          + make_interval(hours => greatest(1, least(72, coalesce(b.duration_hours, 24))))
          + interval '7 days'
        )
      )
  ),
  user_shells as (
    select
      pr.id as pin_id,
      pr.last_lat as lat,
      pr.last_lng as lng,
      'user'::text as pin_type,
      coalesce(pr.location_pinned_until, pr.updated_at, now()) as updated_at,
      false as is_alert,
      null::text as alert_type,
      'active'::text as marker_state,
      pr.display_name,
      pr.avatar_url,
      (pr.is_verified = true or lower(coalesce(pr.verification_status::text, '')) = 'verified') as is_verified,
      coalesce(pr.hide_from_map, false) as is_invisible,
      pr.gender_genre
    from public.profiles pr
    cross join params p
    where p.viewer_id is not null
      and pr.id <> p.viewer_id
      and not exists (select 1 from blocked x where x.user_id = pr.id)
      and coalesce(pr.hide_from_map, false) = false
      and pr.location_pinned_until is not null
      and pr.location_pinned_until > now()
      and coalesce(pr.location, pr.location_geog) is not null
      and st_dwithin(coalesce(pr.location, pr.location_geog), p.center_geog, p.radius_m)
      and not public.is_user_restriction_active(pr.id, 'map_hidden', now())
  )
  select * from alert_shells where marker_state <> 'hidden'
  union all
  select * from user_shells
  order by updated_at desc
  limit 500;
$$;

revoke all on function public.get_visible_map_pin_shells(double precision, double precision, integer) from public, anon;
grant execute on function public.get_visible_map_pin_shells(double precision, double precision, integer) to authenticated;
grant execute on function public.get_visible_map_pin_shells(double precision, double precision, integer) to service_role;
