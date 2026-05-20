drop function if exists public.get_discovery_cards(jsonb);

create or replace function public.get_discovery_cards(p_filters jsonb default '{}'::jsonb)
returns table(
  id uuid,
  display_name text,
  avatar_url text,
  photos jsonb,
  is_verified boolean,
  verification_status text,
  has_car boolean,
  relationship_status text,
  age_years integer,
  location_name text,
  location_country text,
  gender_genre text,
  height numeric,
  effective_tier text,
  tier text,
  pet_species text[],
  pet_size text,
  pet_experience text[],
  pet_experience_years numeric,
  experience_years numeric,
  availability_status text,
  last_active_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz,
  score numeric,
  waved_at_viewer boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lat double precision := nullif(p_filters->>'lat', '')::double precision;
  v_lng double precision := nullif(p_filters->>'lng', '')::double precision;
  v_anchor geography;
  v_viewer_age integer;
  v_viewer_country text := '';
  v_viewer_district text := '';
  v_radius_m integer := greatest(1000, least(coalesce(nullif(p_filters->>'radius_m', '')::integer, 150000), 500000));
  v_min_age integer := greatest(16, coalesce(nullif(p_filters->>'min_age', '')::integer, 16));
  v_max_age integer := greatest(v_min_age, coalesce(nullif(p_filters->>'max_age', '')::integer, 99));
  v_gender text := nullif(p_filters->>'gender', '');
  v_orientations text[] := case
    when jsonb_typeof(p_filters->'orientations') = 'array'
      then array(select jsonb_array_elements_text(p_filters->'orientations'))
    else null
  end;
  v_degrees text[] := case
    when jsonb_typeof(p_filters->'degrees') = 'array'
      then array(select jsonb_array_elements_text(p_filters->'degrees'))
    else null
  end;
  v_species text[] := case
    when jsonb_typeof(p_filters->'species') = 'array'
      then array(select jsonb_array_elements_text(p_filters->'species'))
    else null
  end;
  v_languages text[] := case
    when jsonb_typeof(p_filters->'languages') = 'array'
      then array(select jsonb_array_elements_text(p_filters->'languages'))
    else null
  end;
  v_height_min numeric := nullif(p_filters->>'height_min', '')::numeric;
  v_height_max numeric := nullif(p_filters->>'height_max', '')::numeric;
  v_only_waved boolean := coalesce((p_filters->>'only_waved')::boolean, false);
  v_active_only boolean := coalesce((p_filters->>'active_only')::boolean, false);
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select
    case when p.dob is null then null else date_part('year', age(p.dob))::integer end,
    coalesce(nullif(btrim(p.location_country), ''), ''),
    coalesce(nullif(btrim(p.location_district), ''), nullif(btrim(p.location_name), ''), '')
  into v_viewer_age, v_viewer_country, v_viewer_district
  from public.profiles p
  where p.id = v_uid;

  if v_viewer_age is not null and v_viewer_age < 16 then
    raise exception 'age_blocked';
  end if;

  if v_lat is not null and v_lng is not null then
    v_anchor := st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography;
  else
    select coalesce(
      (
        select ul.location
        from public.user_locations ul
        where ul.user_id = v_uid
          and ul.is_public = true
        order by ul.updated_at desc nulls last
        limit 1
      ),
      p.location,
      p.location_geog
    )
    into v_anchor
    from public.profiles p
    where p.id = v_uid;
  end if;

  return query
  with viewer as (
    select v_uid as id, v_anchor as geog, lower(v_viewer_country) as country, lower(v_viewer_district) as district
  ),
  viewer_waves_out as (
    select coalesce(w.to_user_id, w.receiver_id) as target_id
    from public.waves w
    join viewer v on true
    where coalesce(w.from_user_id, w.sender_id) = v.id
  ),
  viewer_waves_in as (
    select coalesce(w.from_user_id, w.sender_id) as source_id
    from public.waves w
    join viewer v on true
    where coalesce(w.to_user_id, w.receiver_id) = v.id
  ),
  active_matches as (
    select case when m.user1_id = v.id then m.user2_id else m.user1_id end as target_id
    from public.matches m
    join viewer v on true
    where m.is_active = true
      and (m.user1_id = v.id or m.user2_id = v.id)
  ),
  pet_data as (
    select
      pet.owner_id,
      array_remove(array_agg(distinct nullif(btrim(pet.species), '')), null) as species,
      max(
        case
          when pet.weight is null then null
          when lower(coalesce(pet.weight_unit, 'kg')) in ('lb', 'lbs', 'pound', 'pounds') then pet.weight::numeric * 0.45359237
          else pet.weight::numeric
        end
      ) as max_weight_kg
    from public.pets pet
    where coalesce(pet.is_active, true) = true
    group by pet.owner_id
  ),
  candidates as (
    select
      p.id,
      p.display_name,
      p.avatar_url,
      case
        when jsonb_typeof(p.photos) = 'object' then p.photos
        when jsonb_typeof(p.photos) = 'array' then jsonb_build_object(
          'cover', p.photos->>0,
          'establishing', p.photos->>1,
          'pack', p.photos->>2,
          'solo', p.photos->>3,
          'closer', p.photos->>4
        )
        else '{}'::jsonb
      end as photos,
      (p.verification_status = 'verified'::public.verification_status_enum) as is_verified,
      p.verification_status::text as verification_status,
      coalesce(p.has_car, false) as has_car,
      p.relationship_status,
      case when p.dob is null then null else date_part('year', age(p.dob))::integer end as age_years,
      p.location_name,
      p.location_country,
      p.gender_genre,
      p.height::numeric as height,
      p.effective_tier::text as effective_tier,
      p.tier::text as tier,
      coalesce(pd.species, '{}'::text[]) as pet_species,
      case
        when pd.max_weight_kg is null then null
        when pd.max_weight_kg < 10 then 'Small'
        when pd.max_weight_kg < 25 then 'Medium'
        else 'Large'
      end as pet_size,
      coalesce(p.pet_experience, '{}'::text[]) as pet_experience,
      p.experience_years::numeric as pet_experience_years,
      p.experience_years::numeric as experience_years,
      p.availability_status::text as availability_status,
      p.last_active_at,
      p.updated_at,
      p.created_at,
      (
        case when p.verification_status = 'verified'::public.verification_status_enum then 100 else 0 end
        + case when p.effective_tier::text = 'gold' then 50 when p.effective_tier::text in ('plus', 'premium') then 25 else 0 end
        + case
            when v.geog is not null and coalesce(p.location, p.location_geog) is not null and st_dwithin(coalesce(p.location, p.location_geog), v.geog, v_radius_m)
              then greatest(0, 50 - (st_distance(coalesce(p.location, p.location_geog), v.geog) / 10000.0))
            when v.district <> '' and lower(coalesce(p.location_district, p.location_name, '')) = v.district then 25
            when v.country <> '' and lower(coalesce(p.location_country, '')) = v.country then 10
            else 0
          end
      )::numeric as score,
      exists(select 1 from viewer_waves_in wi where wi.source_id = p.id) as waved_at_viewer
    from public.profiles p
    join viewer v on true
    left join pet_data pd on pd.owner_id = p.id
    where p.id <> v.id
      and coalesce(p.non_social, false) = false
      and (
        (v.geog is not null and coalesce(p.location, p.location_geog) is not null and st_dwithin(coalesce(p.location, p.location_geog), v.geog, v_radius_m))
        or (v.district <> '' and lower(coalesce(p.location_district, p.location_name, '')) = v.district)
        or (v.country <> '' and lower(coalesce(p.location_country, '')) = v.country)
        or coalesce(p.location, p.location_geog) is null
      )
      and (p.dob is null or date_part('year', age(p.dob)) between v_min_age and v_max_age)
      and (v_gender is null or p.gender_genre = v_gender)
      and (v_orientations is null or coalesce(array_length(v_orientations, 1), 0) = 0 or p.orientation = any(v_orientations))
      and (v_degrees is null or coalesce(array_length(v_degrees, 1), 0) = 0 or p.degree = any(v_degrees))
      and (v_height_min is null or p.height >= v_height_min)
      and (v_height_max is null or p.height <= v_height_max)
      and (v_languages is null or coalesce(array_length(v_languages, 1), 0) = 0 or coalesce(p.languages, '{}'::text[]) && v_languages)
      and (
        v_species is null
        or coalesce(array_length(v_species, 1), 0) = 0
        or coalesce(pd.species, '{}'::text[]) && v_species
      )
      and (not v_active_only or p.last_active_at >= now() - interval '30 days')
      and (not v_only_waved or exists(select 1 from viewer_waves_in wi where wi.source_id = p.id))
      and not exists(select 1 from viewer_waves_out wo where wo.target_id = p.id)
      and not exists(select 1 from active_matches am where am.target_id = p.id)
      and not public.is_user_blocked(v.id, p.id)
      and not exists (
        select 1
        from public.user_unmatches uu
        where (uu.actor_id = v.id and uu.target_id = p.id)
           or (uu.actor_id = p.id and uu.target_id = v.id)
      )
  )
  select *
  from candidates
  order by score desc nulls last, updated_at desc nulls last, created_at desc nulls last
  limit 80;
end;
$$;

revoke all on function public.get_discovery_cards(jsonb) from public, anon;
grant execute on function public.get_discovery_cards(jsonb) to authenticated;
