create or replace function public.resolve_reliable_country_key_for_user(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.normalize_country_key(nullif(btrim(p.location_country), ''))
  from public.profiles p
  where p.id = p_user_id
$$;

revoke all on function public.resolve_reliable_country_key_for_user(uuid) from public, anon;
grant execute on function public.resolve_reliable_country_key_for_user(uuid) to authenticated;
grant execute on function public.resolve_reliable_country_key_for_user(uuid) to service_role;

create or replace function public.is_same_country_or_within_distance(
  p_viewer uuid,
  p_target uuid,
  p_radius_m integer default 150000
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_country text;
  v_target_country text;
  v_viewer_geog geography;
  v_target_geog geography;
  v_effective_radius integer := least(greatest(coalesce(p_radius_m, 150000), 1000), 150000);
begin
  if p_viewer is null or p_target is null then
    return false;
  end if;

  if p_viewer = p_target then
    return true;
  end if;

  select
    public.normalize_country_key(nullif(btrim(p.location_country), '')),
    coalesce(
      p.location,
      p.location_geog,
      case
        when p.last_lng is not null and p.last_lat is not null
          then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography
        else null
      end
    )
  into v_viewer_country, v_viewer_geog
  from public.profiles p
  where p.id = p_viewer;

  select
    public.normalize_country_key(nullif(btrim(p.location_country), '')),
    coalesce(
      p.location,
      p.location_geog,
      case
        when p.last_lng is not null and p.last_lat is not null
          then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography
        else null
      end
    )
  into v_target_country, v_target_geog
  from public.profiles p
  where p.id = p_target;

  if v_viewer_country is not null and v_target_country is not null and v_viewer_country = v_target_country then
    return true;
  end if;

  if v_viewer_geog is not null and v_target_geog is not null then
    return st_dwithin(v_viewer_geog, v_target_geog, v_effective_radius);
  end if;

  return false;
end;
$$;

revoke all on function public.is_same_country_or_within_distance(uuid, uuid, integer) from public, anon;
grant execute on function public.is_same_country_or_within_distance(uuid, uuid, integer) to authenticated;
grant execute on function public.is_same_country_or_within_distance(uuid, uuid, integer) to service_role;

create or replace function public.is_in_scope(p_viewer uuid, p_target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller_role text := coalesce(auth.role(), '');
  v_viewer uuid;
begin
  v_viewer := case
    when v_caller_role = 'service_role' then coalesce(p_viewer, auth.uid())
    else auth.uid()
  end;

  if v_viewer is null or p_target is null then
    return false;
  end if;

  if v_viewer = p_target then
    return true;
  end if;

  return public.is_same_country_or_within_distance(v_viewer, p_target, 150000);
end;
$$;

create or replace function public.social_discovery_restricted(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_min_age integer,
  p_max_age integer,
  p_role text default null,
  p_gender text default null,
  p_species text[] default null,
  p_pet_size text default null,
  p_advanced boolean default false,
  p_height_min numeric default null,
  p_height_max numeric default null,
  p_only_waved boolean default false,
  p_active_only boolean default false
)
returns table(
  id uuid,
  display_name text,
  avatar_url text,
  is_verified boolean,
  has_car boolean,
  bio text,
  relationship_status text,
  dob date,
  location_name text,
  occupation text,
  school text,
  major text,
  gender_genre text,
  orientation text,
  height numeric,
  weight numeric,
  weight_unit text,
  tier text,
  pets jsonb,
  pet_species text[],
  pet_size text,
  social_album text[],
  show_occupation boolean,
  show_academic boolean,
  show_bio boolean,
  show_relationship_status boolean,
  show_age boolean,
  show_gender boolean,
  show_orientation boolean,
  show_height boolean,
  show_weight boolean,
  social_role text,
  score numeric
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.social_discovery(
    p_user_id,
    p_lat,
    p_lng,
    p_radius_m,
    p_min_age,
    p_max_age,
    p_role,
    p_gender,
    p_species,
    p_pet_size,
    p_advanced,
    p_height_min,
    p_height_max,
    p_only_waved,
    p_active_only
  ) d
  where not public.is_user_restriction_active(d.id, 'discovery_hidden', now())
    and public.is_same_country_or_within_distance(p_user_id, d.id, 150000);
$$;

revoke all on function public.social_discovery_restricted(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) from public;
revoke all on function public.social_discovery_restricted(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) from anon;
grant execute on function public.social_discovery_restricted(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) to authenticated;
grant execute on function public.social_discovery_restricted(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) to service_role;
