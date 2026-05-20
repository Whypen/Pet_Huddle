-- Pass 3: location ranking/fallback expansion.
-- Contract:
-- - Discover/Social rank district -> city -> radius -> country fallback when local rows are insufficient.
-- - Service ranks district -> city -> 50km, with no broad country fallback.
-- - Alert-derived Social uses alert incident geog first; direct/deeplink access remains on separate RPCs.

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
  v_viewer_city text := '';
  v_radius_m integer := greatest(1000, least(coalesce(nullif(p_filters->>'radius_m', '')::integer, 150000), 500000));
  v_min_age integer := greatest(16, coalesce(nullif(p_filters->>'min_age', '')::integer, 16));
  v_max_age integer := greatest(v_min_age, coalesce(nullif(p_filters->>'max_age', '')::integer, 99));
  v_gender text := nullif(p_filters->>'gender', '');
  v_orientations text[] := case when jsonb_typeof(p_filters->'orientations') = 'array' then array(select jsonb_array_elements_text(p_filters->'orientations')) else null end;
  v_degrees text[] := case when jsonb_typeof(p_filters->'degrees') = 'array' then array(select jsonb_array_elements_text(p_filters->'degrees')) else null end;
  v_species text[] := case when jsonb_typeof(p_filters->'species') = 'array' then array(select jsonb_array_elements_text(p_filters->'species')) else null end;
  v_languages text[] := case when jsonb_typeof(p_filters->'languages') = 'array' then array(select jsonb_array_elements_text(p_filters->'languages')) else null end;
  v_height_min numeric := nullif(p_filters->>'height_min', '')::numeric;
  v_height_max numeric := nullif(p_filters->>'height_max', '')::numeric;
  v_only_waved boolean := coalesce((p_filters->>'only_waved')::boolean, false);
  v_active_only boolean := coalesce((p_filters->>'active_only')::boolean, false);
  v_min_local_results integer := greatest(1, least(coalesce(nullif(p_filters->>'min_local_results', '')::integer, 50), 200));
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select
    case when p.dob is null then null else date_part('year', age(p.dob))::integer end,
    lower(coalesce(nullif(btrim(coalesce(p_filters->>'viewer_country_name', p_filters->>'viewer_country', p_filters->>'country')), ''), nullif(btrim(p.location_country), ''), '')),
    lower(coalesce(nullif(btrim(coalesce(p_filters->>'viewer_district', p_filters->>'district')), ''), nullif(btrim(p.location_district), ''), '')),
    lower(coalesce(nullif(btrim(coalesce(p_filters->>'viewer_city', p_filters->>'city')), ''), nullif(btrim(p.location_name), ''), ''))
  into v_viewer_age, v_viewer_country, v_viewer_district, v_viewer_city
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
          and ul.updated_at >= now() - interval '2 hours'
          and (ul.expires_at is null or ul.expires_at > now())
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
    select
      v_uid as id,
      v_anchor as geog,
      public.normalize_country_key(v_viewer_country) as country,
      nullif(v_viewer_district, '') as district,
      nullif(v_viewer_city, '') as city
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
  candidate_source as (
    select
      p.*,
      lower(nullif(btrim(coalesce(p.location_district, '')), '')) as candidate_district,
      lower(nullif(btrim(coalesce(p.location_name, '')), '')) as candidate_city,
      public.normalize_country_key(nullif(btrim(coalesce(p.location_country, '')), '')) as candidate_country,
      coalesce(
        p.location,
        p.location_geog,
        case
          when coalesce(p.latitude, p.last_lat) is not null
            and coalesce(p.longitude, p.last_lng) is not null
          then st_setsrid(st_makepoint(coalesce(p.longitude, p.last_lng), coalesce(p.latitude, p.last_lat)), 4326)::geography
          else null::geography
        end
      ) as candidate_geog
    from public.profiles p
  ),
  filtered as (
    select
      p.*,
      pd.species as pet_species_rows,
      pd.max_weight_kg,
      exists(select 1 from viewer_waves_in wi where wi.source_id = p.id) as waved_at_viewer,
      case
        when v.district is not null and p.candidate_district = v.district then 0
        when v.city is not null and p.candidate_city = v.city then 1
        when v.geog is not null and p.candidate_geog is not null and st_dwithin(p.candidate_geog, v.geog, v_radius_m) then 2
        when v.country is not null and p.candidate_country = v.country then 3
        else 9
      end as scope_priority,
      case
        when v.geog is not null and p.candidate_geog is not null then st_distance(p.candidate_geog, v.geog)
        else null::double precision
      end as distance_m
    from candidate_source p
    join viewer v on true
    left join pet_data pd on pd.owner_id = p.id
    where p.id <> v.id
      and coalesce(p.non_social, false) = false
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
      and (not v_active_only or p.last_active_at >= now() - interval '24 hours')
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
  ),
  counted as (
    select f.*, count(*) filter (where f.scope_priority in (0, 1, 2)) over () as local_count
    from filtered f
    where f.scope_priority in (0, 1, 2, 3)
  ),
  candidates as (
    select
      c.id,
      c.display_name,
      c.avatar_url,
      case
        when jsonb_typeof(c.photos) = 'object' then c.photos
        when jsonb_typeof(c.photos) = 'array' then jsonb_build_object(
          'cover', c.photos->>0,
          'establishing', c.photos->>1,
          'pack', c.photos->>2,
          'solo', c.photos->>3,
          'closer', c.photos->>4
        )
        else '{}'::jsonb
      end as photos,
      (c.verification_status = 'verified'::public.verification_status_enum) as is_verified,
      c.verification_status::text as verification_status,
      coalesce(c.has_car, false) as has_car,
      c.relationship_status,
      case when c.dob is null then null else date_part('year', age(c.dob))::integer end as age_years,
      c.location_name,
      c.location_country,
      c.gender_genre,
      c.height::numeric as height,
      c.effective_tier::text as effective_tier,
      c.tier::text as tier,
      coalesce(c.pet_species_rows, '{}'::text[]) as pet_species,
      case
        when c.max_weight_kg is null then null
        when c.max_weight_kg < 10 then 'Small'
        when c.max_weight_kg < 25 then 'Medium'
        else 'Large'
      end as pet_size,
      coalesce(c.pet_experience, '{}'::text[]) as pet_experience,
      c.experience_years::numeric as pet_experience_years,
      c.experience_years::numeric as experience_years,
      c.availability_status::text as availability_status,
      c.last_active_at,
      c.updated_at,
      c.created_at,
      (
        case when c.verification_status = 'verified'::public.verification_status_enum then 100 else 0 end
        + case when c.effective_tier::text = 'gold' then 50 when c.effective_tier::text in ('plus', 'premium') then 25 else 0 end
        + case when c.scope_priority = 0 then 40 when c.scope_priority = 1 then 30 when c.scope_priority = 2 then greatest(0, 25 - (coalesce(c.distance_m, 0) / 10000.0)) when c.scope_priority = 3 then 5 else 0 end
      )::numeric as score,
      c.waved_at_viewer,
      c.scope_priority,
      c.distance_m
    from counted c
    where c.scope_priority in (0, 1, 2)
       or (c.scope_priority = 3 and c.local_count < v_min_local_results)
  )
  select
    candidates.id,
    candidates.display_name,
    candidates.avatar_url,
    candidates.photos,
    candidates.is_verified,
    candidates.verification_status,
    candidates.has_car,
    candidates.relationship_status,
    candidates.age_years,
    candidates.location_name,
    candidates.location_country,
    candidates.gender_genre,
    candidates.height,
    candidates.effective_tier,
    candidates.tier,
    candidates.pet_species,
    candidates.pet_size,
    candidates.pet_experience,
    candidates.pet_experience_years,
    candidates.experience_years,
    candidates.availability_status,
    candidates.last_active_at,
    candidates.updated_at,
    candidates.created_at,
    candidates.score,
    candidates.waved_at_viewer
  from candidates
  order by candidates.scope_priority asc, candidates.score desc nulls last, candidates.distance_m asc nulls last, candidates.updated_at desc nulls last, candidates.created_at desc nulls last
  limit 80;
end;
$$;

revoke all on function public.get_discovery_cards(jsonb) from public, anon;
grant execute on function public.get_discovery_cards(jsonb) to authenticated;

create or replace function public.get_native_service_provider_cards(
  p_lat double precision default null,
  p_lng double precision default null,
  p_viewer_country text default null,
  p_viewer_scope jsonb default null
)
returns table(
  user_id uuid,
  story text,
  skills text[],
  proof_metadata jsonb,
  vet_license_found boolean,
  days text[],
  time_blocks text[],
  other_time_from text,
  other_time_to text,
  emergency_readiness boolean,
  min_notice_value integer,
  min_notice_unit text,
  location_styles text[],
  area_name text,
  services_offered text[],
  services_other text,
  pet_types text[],
  pet_types_other text,
  dog_sizes text[],
  currency text,
  starting_price numeric,
  rates text[],
  created_at timestamptz,
  updated_at timestamptz,
  display_name text,
  avatar_url text,
  has_car boolean,
  is_verified boolean,
  verification_status text,
  location_country text,
  is_bookmarked boolean,
  distance_km double precision
)
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select
      auth.uid() as user_id,
      case
        when p_lat is not null and p_lng is not null
        then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
        else null::geography
      end as geog,
      lower(nullif(btrim(coalesce(p_viewer_scope->>'district', '')), '')) as district,
      lower(nullif(btrim(coalesce(p_viewer_scope->>'city', '')), '')) as city
  ),
  hidden as (
    select r.user_id
    from public.user_moderation_restrictions r
    where r.restriction_key = 'marketplace_hidden'
      and (r.expires_at is null or r.expires_at > now())
  ),
  provider_source as (
    select
      pc.*,
      pp.display_name,
      pp.avatar_url,
      coalesce(pp.has_car, false) as has_car,
      coalesce(pp.is_verified, false) as is_verified,
      p.verification_status::text as verification_status,
      p.location_country,
      lower(nullif(btrim(coalesce(p.location_district, '')), '')) as provider_district,
      lower(nullif(btrim(coalesce(p.location_name, '')), '')) as provider_city,
      coalesce(p.location, p.location_geog) as provider_geog
    from public.pet_care_profiles pc
    join public.profiles_public pp on pp.id = pc.user_id
    join public.profiles p on p.id = pc.user_id
    where pc.listed = true
      and not exists (select 1 from hidden h where h.user_id = pc.user_id)
  ),
  scoped as (
    select
      ps.*,
      exists (
        select 1
        from public.service_bookmarks sb
        join viewer v on v.user_id = sb.user_id
        where sb.provider_user_id = ps.user_id
      ) as is_bookmarked,
      case
        when v.geog is not null and ps.provider_geog is not null
        then st_distance(ps.provider_geog, v.geog) / 1000.0
        else null::double precision
      end as distance_km,
      case
        when v.district is not null and ps.provider_district = v.district then 0
        when v.city is not null and ps.provider_city = v.city then 1
        when v.geog is not null and ps.provider_geog is not null and st_dwithin(ps.provider_geog, v.geog, 50000) then 2
        else 9
      end as scope_priority
    from provider_source ps
    join viewer v on true
  )
  select
    s.user_id,
    s.story,
    s.skills,
    s.proof_metadata,
    s.vet_license_found,
    s.days,
    s.time_blocks,
    s.other_time_from,
    s.other_time_to,
    s.emergency_readiness,
    s.min_notice_value,
    s.min_notice_unit,
    s.location_styles,
    s.area_name,
    s.services_offered,
    s.services_other,
    s.pet_types,
    s.pet_types_other,
    s.dog_sizes,
    s.currency,
    s.starting_price,
    s.rates,
    s.created_at,
    s.updated_at,
    s.display_name,
    s.avatar_url,
    s.has_car,
    s.is_verified,
    s.verification_status,
    s.location_country,
    s.is_bookmarked,
    s.distance_km
  from scoped s
  where s.scope_priority in (0, 1, 2)
  order by s.scope_priority asc, s.distance_km asc nulls last, s.service_rank_weight desc nulls last, s.updated_at desc nulls last;
$$;

revoke all on function public.get_native_service_provider_cards(double precision, double precision, text, jsonb) from public, anon;
grant execute on function public.get_native_service_provider_cards(double precision, double precision, text, jsonb) to authenticated;

create or replace function public.get_social_feed(
  p_viewer_id uuid,
  p_sort text default 'Latest',
  p_limit integer default 20,
  p_cursor jsonb default null,
  p_viewer_scope jsonb default null
)
returns table(
  id uuid,
  user_id uuid,
  title text,
  content text,
  tags text[],
  hashtags text[],
  images text[],
  created_at timestamptz,
  updated_at timestamptz,
  like_count integer,
  support_count integer,
  comment_count integer,
  score numeric,
  author_display_name text,
  author_avatar_url text,
  author_verification_status text,
  author_location_country text,
  author_non_social boolean,
  map_id uuid,
  alert_type text,
  alert_district text,
  has_alert_link boolean,
  video_provider text,
  provider_video_id text,
  video_playback_url text,
  video_embed_url text,
  video_thumbnail_url text,
  video_preview_url text,
  video_duration_seconds numeric,
  video_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text := coalesce(auth.role(), '');
  v_uid uuid;
  v_min_local_results integer := 50;
begin
  v_uid := case
    when v_caller_role = 'service_role' then coalesce(p_viewer_id, auth.uid())
    else auth.uid()
  end;

  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  if v_caller_role <> 'service_role' and p_viewer_id is not null and p_viewer_id <> v_uid then
    raise exception 'forbidden';
  end if;

  return query
  with viewer_scope as (
    select
      public.normalize_country_key(nullif(btrim(coalesce(p_viewer_scope->>'countryName', p_viewer_scope->>'country', '')), '')) as scope_country,
      lower(nullif(btrim(coalesce(p_viewer_scope->>'district', '')), '')) as scope_district,
      lower(nullif(btrim(coalesce(p_viewer_scope->>'city', '')), '')) as scope_city,
      case
        when nullif(btrim(p_viewer_scope->>'lat'), '') is not null
          and nullif(btrim(p_viewer_scope->>'lng'), '') is not null
          and (p_viewer_scope->>'lat')::double precision between -90 and 90
          and (p_viewer_scope->>'lng')::double precision between -180 and 180
        then st_setsrid(
          st_makepoint((p_viewer_scope->>'lng')::double precision, (p_viewer_scope->>'lat')::double precision),
          4326
        )::geography
        else null
      end as scope_geog,
      p_viewer_scope is not null as has_app_scope
  ),
  viewer as (
    select
      p.id,
      case when vs.has_app_scope then vs.scope_country else public.normalize_country_key(nullif(btrim(p.location_country), '')) end as country,
      case when vs.has_app_scope then vs.scope_district else lower(nullif(btrim(coalesce(p.location_district, '')), '')) end as district,
      case when vs.has_app_scope then vs.scope_city else lower(nullif(btrim(coalesce(p.location_name, '')), '')) end as city,
      case
        when vs.has_app_scope and vs.scope_geog is not null then vs.scope_geog
        when vs.has_app_scope then null
        else coalesce(
          p.location,
          p.location_geog,
          case when p.last_lng is not null and p.last_lat is not null then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography else null end
        )
      end as geog
    from public.profiles p
    cross join viewer_scope vs
    where p.id = v_uid
  ),
  support_counts as (
    select ts.thread_id, count(*)::int as cnt
    from public.thread_supports ts
    group by ts.thread_id
  ),
  alert_scope as (
    select
      t.id as thread_id,
      coalesce(t.map_id, ma_by_thread.id, ba_by_thread.id) as map_id,
      coalesce(ma_by_map.alert_type, ma_by_thread.alert_type, ba_by_map.type, ba_by_thread.type) as alert_type,
      lower(nullif(btrim(coalesce(ma_by_map.incident_district, ma_by_thread.incident_district, ba_by_map.incident_district, ba_by_thread.incident_district, ma_by_map.location_district, ma_by_thread.location_district, '')), '')) as location_district,
      lower(nullif(btrim(coalesce(ma_by_map.incident_city, ma_by_thread.incident_city, ba_by_map.incident_city, ba_by_thread.incident_city, '')), '')) as location_city,
      public.normalize_country_key(nullif(btrim(coalesce(ma_by_map.incident_country_name, ma_by_thread.incident_country_name, ba_by_map.incident_country_name, ba_by_thread.incident_country_name, '')), '')) as location_country,
      coalesce(
        ma_by_map.location_geog,
        case when ma_by_map.longitude is not null and ma_by_map.latitude is not null then st_setsrid(st_makepoint(ma_by_map.longitude, ma_by_map.latitude), 4326)::geography else null end,
        ma_by_thread.location_geog,
        case when ma_by_thread.longitude is not null and ma_by_thread.latitude is not null then st_setsrid(st_makepoint(ma_by_thread.longitude, ma_by_thread.latitude), 4326)::geography else null end,
        ba_by_map.geog,
        case when ba_by_map.longitude is not null and ba_by_map.latitude is not null then st_setsrid(st_makepoint(ba_by_map.longitude, ba_by_map.latitude), 4326)::geography else null end,
        ba_by_thread.geog,
        case when ba_by_thread.longitude is not null and ba_by_thread.latitude is not null then st_setsrid(st_makepoint(ba_by_thread.longitude, ba_by_thread.latitude), 4326)::geography else null end
      ) as scope_geog,
      (
        coalesce(t.is_map_alert, false) = true
        or t.map_id is not null
        or ma_by_thread.id is not null
        or ba_by_thread.id is not null
      ) as is_alert_derived
    from public.threads t
    left join public.map_alerts ma_by_map on ma_by_map.id = t.map_id
    left join public.map_alerts ma_by_thread on ma_by_thread.thread_id = t.id
    left join public.broadcast_alerts ba_by_map on ba_by_map.id = t.map_id
    left join public.broadcast_alerts ba_by_thread on ba_by_thread.thread_id = t.id
  ),
  base as (
    select
      t.id,
      t.user_id,
      t.title,
      t.content,
      t.tags,
      t.hashtags,
      t.images,
      t.created_at,
      t.created_at as updated_at,
      coalesce(sc.cnt, 0)::int as like_count,
      coalesce(sc.cnt, 0)::int as support_count,
      (select count(*)::int from public.thread_comments tc where tc.thread_id = t.id) as comment_count,
      p.display_name as author_display_name,
      p.avatar_url as author_avatar_url,
      p.verification_status::text as author_verification_status,
      p.location_country as author_location_country,
      coalesce(p.non_social, false) as author_non_social,
      t.video_provider,
      t.provider_video_id,
      t.video_playback_url,
      t.video_embed_url,
      t.video_thumbnail_url,
      t.video_preview_url,
      t.video_duration_seconds,
      t.video_status,
      a.map_id,
      a.alert_type,
      a.location_district as alert_district,
      a.is_alert_derived,
      case
        when coalesce(a.is_alert_derived, false) = true and v.geog is not null and a.scope_geog is not null and st_dwithin(v.geog, a.scope_geog, 150000) then 2
        when coalesce(a.is_alert_derived, false) = true and (v.geog is null or a.scope_geog is null) and v.city is not null and a.location_city = v.city then 1
        when coalesce(a.is_alert_derived, false) = true and (v.geog is null or a.scope_geog is null) and v.country is not null and a.location_country = v.country then 3
        when coalesce(a.is_alert_derived, false) = false and v.district is not null and lower(nullif(btrim(coalesce(p.location_district, '')), '')) = v.district then 0
        when coalesce(a.is_alert_derived, false) = false and v.city is not null and lower(nullif(btrim(coalesce(p.location_name, '')), '')) = v.city then 1
        when coalesce(a.is_alert_derived, false) = false and v.geog is not null and coalesce(p.location, p.location_geog) is not null and st_dwithin(v.geog, coalesce(p.location, p.location_geog), 150000) then 2
        when coalesce(a.is_alert_derived, false) = false and v.country is not null and public.normalize_country_key(nullif(btrim(p.location_country), '')) = v.country then 3
        else 9
      end as scope_priority
    from public.threads t
    join public.profiles p on p.id = t.user_id
    left join support_counts sc on sc.thread_id = t.id
    left join alert_scope a on a.thread_id = t.id
    join viewer v on true
    where coalesce(p.non_social, false) = false
      and coalesce(t.is_public, true) = true
      and not public.is_user_blocked(v.id, t.user_id)
      and not public.is_user_restriction_active(t.user_id, 'social_hidden', now())
  ),
  scoped as (
    select b.*, count(*) filter (where b.scope_priority in (0, 1, 2)) over () as local_count
    from base b
    where b.scope_priority in (0, 1, 2, 3)
  ),
  ranked as (
    select
      s.*,
      ((coalesce(s.like_count, 0) * 2) + (coalesce(s.comment_count, 0) * 3) + (coalesce(s.support_count, 0) * 1) - ((extract(epoch from (now() - s.created_at)) / 3600.0) * 0.10))::numeric as computed_score
    from scoped s
    where (s.scope_priority in (0, 1, 2) or (s.scope_priority = 3 and s.local_count < v_min_local_results))
      and (
        lower(coalesce(p_sort, 'latest')) <> 'trending'
        or s.created_at >= now() - interval '7 days'
      )
      and (
        p_cursor is null
        or (s.created_at, s.id) < (
          coalesce((p_cursor->>'created_at')::timestamptz, 'infinity'::timestamptz),
          coalesce((p_cursor->>'id')::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
        )
      )
  )
  select
    r.id,
    r.user_id,
    r.title,
    r.content,
    r.tags,
    r.hashtags,
    r.images,
    r.created_at,
    r.updated_at,
    r.like_count,
    r.support_count,
    r.comment_count,
    case when lower(coalesce(p_sort, 'latest')) = 'trending' then r.computed_score else null end as score,
    r.author_display_name,
    r.author_avatar_url,
    r.author_verification_status,
    r.author_location_country,
    r.author_non_social,
    r.map_id,
    r.alert_type,
    r.alert_district,
    (r.map_id is not null or nullif(btrim(coalesce(r.alert_type, '')), '') is not null or nullif(btrim(coalesce(r.alert_district, '')), '') is not null) as has_alert_link,
    r.video_provider,
    r.provider_video_id,
    r.video_playback_url,
    r.video_embed_url,
    r.video_thumbnail_url,
    r.video_preview_url,
    r.video_duration_seconds,
    r.video_status
  from ranked r
  order by
    r.scope_priority asc,
    case when lower(coalesce(p_sort, 'latest')) = 'trending' then r.computed_score end desc nulls last,
    r.created_at desc,
    r.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all on function public.get_social_feed(uuid, text, integer, jsonb, jsonb) from public, anon;
grant execute on function public.get_social_feed(uuid, text, integer, jsonb, jsonb) to authenticated;
grant execute on function public.get_social_feed(uuid, text, integer, jsonb, jsonb) to service_role;
