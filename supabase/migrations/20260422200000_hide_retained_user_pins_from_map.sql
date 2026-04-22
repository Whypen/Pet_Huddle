create or replace function public.get_friend_pins_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int default 50000
)
returns table(
  id uuid,
  display_name text,
  avatar_url text,
  dob date,
  relationship_status text,
  owns_pets boolean,
  pet_species text[],
  location_name text,
  last_lat double precision,
  last_lng double precision,
  location_pinned_until timestamptz,
  location_retention_until timestamptz,
  marker_state text
)
language sql
security definer
as $$
  with pet_data as (
    select owner_id, array_remove(array_agg(distinct species), null) as pet_species
    from public.pets
    where is_active = true
    group by owner_id
  )
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.dob,
    p.relationship_status,
    p.owns_pets,
    pd.pet_species,
    p.location_name,
    p.last_lat,
    p.last_lng,
    p.location_pinned_until,
    p.location_retention_until,
    'active'::text as marker_state
  from public.profiles p
  left join pet_data pd on pd.owner_id = p.id
  where p.id <> auth.uid()
    and coalesce(p.location, p.location_geog) is not null
    and p.location_pinned_until is not null
    and p.location_pinned_until > now()
    and ST_DWithin(
      coalesce(p.location, p.location_geog),
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      greatest(0, least(p_radius_m, 50000))
    )
  order by p.location_pinned_until desc
  limit 200;
$$;

revoke all on function public.get_friend_pins_nearby(double precision, double precision, int) from anon;
grant execute on function public.get_friend_pins_nearby(double precision, double precision, int) to authenticated;
grant execute on function public.get_friend_pins_nearby(double precision, double precision, int) to service_role;
