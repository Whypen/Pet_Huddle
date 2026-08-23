-- Logged-out Map may show that an animal alert exists in an area, but must
-- never return the alert's stored exact coordinates. Reuse the canonical Map
-- area geometry already shared by native Map people projections.
create or replace function public.get_public_map_alerts(
  p_bbox jsonb default '{}'::jsonb
)
returns table(
  id uuid,
  latitude double precision,
  longitude double precision,
  alert_type text,
  area text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    cell.lat,
    cell.lng,
    coalesce(nullif(btrim(a.alert_type), ''), 'Stray'),
    coalesce(nullif(btrim(a.location_district), ''), ''),
    a.created_at
  from public.get_visible_broadcast_alerts(
    greatest(-90, least(90, coalesce((p_bbox->>'lat')::double precision, 22.3193))),
    greatest(-180, least(180, coalesce((p_bbox->>'lng')::double precision, 114.1694))),
    greatest(1000, least(coalesce((p_bbox->>'radius_m')::integer, 10000), 100000))
  ) a
  cross join lateral public.map_area_cell_v2(a.latitude, a.longitude) cell
  where coalesce(a.is_sensitive, false) = false
    and a.latitude is not null
    and a.longitude is not null
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce((p_bbox->>'limit')::integer, 100), 200));
$$;

revoke all on function public.get_public_map_alerts(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_map_alerts(jsonb)
  to anon, authenticated, service_role;

comment on function public.get_public_map_alerts(jsonb) is
  'Read-only logged-out Map alert projection. Coordinates are canonical 500m area-cell centres; exact stored alert coordinates are never returned.';
