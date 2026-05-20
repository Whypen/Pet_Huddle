create or replace function public.get_native_viewer_scope()
returns table(
  user_id uuid,
  cached_device_point jsonb,
  own_pin_point jsonb,
  recent_user_point jsonb,
  profile_point jsonb,
  country text,
  district text,
  location_name text,
  location_pinned_until timestamptz,
  location_retention_until timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as uid
  ),
  profile_row as (
    select p.*
    from public.profiles p
    join viewer v on v.uid = p.id
  ),
  cached_device as (
    select
      jsonb_build_object(
        'lat', st_y(ul.location::geometry),
        'lng', st_x(ul.location::geometry)
      ) as point
    from public.user_locations ul
    join viewer v on v.uid = ul.user_id
    where ul.updated_at >= now() - interval '2 hours'
      and (ul.expires_at is null or ul.expires_at > now())
      and ul.location is not null
    order by ul.updated_at desc
    limit 1
  )
  select
    p.id as user_id,
    cd.point as cached_device_point,
    case
      when p.location_pinned_until is not null
        and p.location_pinned_until > now()
        and p.last_lat is not null
        and p.last_lng is not null
      then jsonb_build_object('lat', p.last_lat, 'lng', p.last_lng)
      else null::jsonb
    end as own_pin_point,
    null::jsonb as recent_user_point,
    case
      when coalesce(p.location_geog, p.location) is not null
      then jsonb_build_object(
        'lat', st_y(coalesce(p.location_geog, p.location)::geometry),
        'lng', st_x(coalesce(p.location_geog, p.location)::geometry)
      )
      else null::jsonb
    end as profile_point,
    nullif(btrim(coalesce(p.location_country, '')), '') as country,
    nullif(btrim(coalesce(p.location_district, '')), '') as district,
    nullif(btrim(coalesce(p.location_name, '')), '') as location_name,
    p.location_pinned_until,
    p.location_retention_until
  from profile_row p
  left join cached_device cd on true
  where (select uid from viewer) is not null;
$$;

revoke all on function public.get_native_viewer_scope() from public, anon;
grant execute on function public.get_native_viewer_scope() to authenticated;
grant execute on function public.get_native_viewer_scope() to service_role;
