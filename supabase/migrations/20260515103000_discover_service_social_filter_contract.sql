-- Fix native filter contracts:
-- 1. Discover Active Only is 24h.
-- 2. Service cards expose all client-filtered fields and no artificial 100-row cap inside the 50km pool.
-- 3. Social alert-derived feed rows require same alert country plus max 150km when both geogs exist.
--
-- Remote schema proved before writing:
-- - pet_care_profiles has skills, proof_metadata, vet_license_found, days, emergency_readiness,
--   location_styles, services_offered, services_other, pet_types, pet_types_other, dog_sizes, rates.
-- - map_alerts has location_geog, latitude, longitude, address, location_district, thread_id.
-- - broadcast_alerts has geog, latitude, longitude, address, thread_id.

drop function if exists public.get_native_service_provider_cards(double precision, double precision, text);

create function public.get_native_service_provider_cards(
  p_lat double precision default null,
  p_lng double precision default null,
  p_viewer_country text default null
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
    select auth.uid() as user_id
  ),
  hidden as (
    select r.user_id
    from public.user_moderation_restrictions r
    where r.restriction_key = 'marketplace_hidden'
      and (r.expires_at is null or r.expires_at > now())
  )
  select
    pc.user_id,
    pc.story,
    pc.skills,
    pc.proof_metadata,
    pc.vet_license_found,
    pc.days,
    pc.time_blocks,
    pc.other_time_from,
    pc.other_time_to,
    pc.emergency_readiness,
    pc.min_notice_value,
    pc.min_notice_unit,
    pc.location_styles,
    pc.area_name,
    pc.services_offered,
    pc.services_other,
    pc.pet_types,
    pc.pet_types_other,
    pc.dog_sizes,
    pc.currency,
    pc.starting_price,
    pc.rates,
    pc.created_at,
    pc.updated_at,
    pp.display_name,
    pp.avatar_url,
    coalesce(pp.has_car, false) as has_car,
    coalesce(pp.is_verified, false) as is_verified,
    p.verification_status::text,
    p.location_country,
    exists (
      select 1
      from public.service_bookmarks sb
      join viewer v on v.user_id = sb.user_id
      where sb.provider_user_id = pc.user_id
    ) as is_bookmarked,
    case
      when p_lat is not null and p_lng is not null and coalesce(p.location, p.location_geog) is not null
        then st_distance(coalesce(p.location, p.location_geog), st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0
      else null
    end as distance_km
  from public.pet_care_profiles pc
  join public.profiles_public pp on pp.id = pc.user_id
  join public.profiles p on p.id = pc.user_id
  where pc.listed = true
    and not exists (select 1 from hidden h where h.user_id = pc.user_id)
    and (
      nullif(btrim(coalesce(p_viewer_country, '')), '') is null
      or nullif(btrim(coalesce(p.location_country, '')), '') is null
      or lower(btrim(p.location_country)) = lower(btrim(p_viewer_country))
    )
    and (
      p_lat is null
      or p_lng is null
      or coalesce(p.location, p.location_geog) is null
      or st_dwithin(coalesce(p.location, p.location_geog), st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, 50000)
    )
  order by distance_km asc nulls last, pc.service_rank_weight desc nulls last, pc.updated_at desc nulls last;
$$;

revoke all on function public.get_native_service_provider_cards(double precision, double precision, text) from public, anon;
grant execute on function public.get_native_service_provider_cards(double precision, double precision, text) to authenticated;

create or replace function public.get_native_service_provider_detail(p_provider_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(row)
  from (
    select
      pc.user_id,
      pc.story,
      pc.skills,
      pc.proof_metadata,
      pc.vet_license_found,
      pc.days,
      pc.time_blocks,
      pc.other_time_from,
      pc.other_time_to,
      pc.emergency_readiness,
      pc.min_notice_value,
      pc.min_notice_unit,
      pc.location_styles,
      pc.area_name,
      pc.services_offered,
      pc.services_other,
      pc.pet_types,
      pc.pet_types_other,
      pc.dog_sizes,
      pc.currency,
      pc.starting_price,
      pc.rates,
      pc.listed,
      pc.created_at,
      pc.updated_at,
      pp.display_name,
      pp.avatar_url,
      coalesce(pp.has_car, false) as has_car,
      coalesce(pp.is_verified, false) as is_verified,
      p.verification_status::text,
      p.location_country,
      p.social_album,
      exists (
        select 1
        from public.service_bookmarks sb
        where sb.user_id = auth.uid()
          and sb.provider_user_id = pc.user_id
      ) as is_bookmarked,
      null::double precision as distance_km
    from public.pet_care_profiles pc
    join public.profiles_public pp on pp.id = pc.user_id
    join public.profiles p on p.id = pc.user_id
    where pc.user_id = p_provider_user_id
      and pc.listed = true
      and not exists (
        select 1 from public.user_moderation_restrictions r
        where r.user_id = pc.user_id
          and r.restriction_key = 'marketplace_hidden'
          and (r.expires_at is null or r.expires_at > now())
      )
  ) row
  limit 1;
$$;

revoke all on function public.get_native_service_provider_detail(uuid) from public, anon;
grant execute on function public.get_native_service_provider_detail(uuid) to authenticated;

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
  v_orientations text[] := case when jsonb_typeof(p_filters->'orientations') = 'array' then array(select jsonb_array_elements_text(p_filters->'orientations')) else null end;
  v_degrees text[] := case when jsonb_typeof(p_filters->'degrees') = 'array' then array(select jsonb_array_elements_text(p_filters->'degrees')) else null end;
  v_species text[] := case when jsonb_typeof(p_filters->'species') = 'array' then array(select jsonb_array_elements_text(p_filters->'species')) else null end;
  v_languages text[] := case when jsonb_typeof(p_filters->'languages') = 'array' then array(select jsonb_array_elements_text(p_filters->'languages')) else null end;
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
  candidate_source as (
    select
      p.*,
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
            when v.geog is not null and p.candidate_geog is not null and st_dwithin(p.candidate_geog, v.geog, v_radius_m)
              then greatest(0, 50 - (st_distance(p.candidate_geog, v.geog) / 10000.0))
            when v.geog is null and v.district <> '' and lower(coalesce(p.location_district, p.location_name, '')) = v.district then 25
            when v.geog is null and v.country <> '' and lower(coalesce(p.location_country, '')) = v.country then 10
            else 0
          end
      )::numeric as score,
      exists(select 1 from viewer_waves_in wi where wi.source_id = p.id) as waved_at_viewer
    from candidate_source p
    join viewer v on true
    left join pet_data pd on pd.owner_id = p.id
    where p.id <> v.id
      and coalesce(p.non_social, false) = false
      and (
        (v.geog is not null and p.candidate_geog is not null and st_dwithin(p.candidate_geog, v.geog, v_radius_m))
        or (v.geog is null and v.district <> '' and lower(coalesce(p.location_district, p.location_name, '')) = v.district)
        or (v.geog is null and v.district = '' and v.country <> '' and lower(coalesce(p.location_country, '')) = v.country)
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
  )
  select *
  from candidates
  order by score desc nulls last, updated_at desc nulls last, created_at desc nulls last
  limit 80;
end;
$$;

revoke all on function public.get_discovery_cards(jsonb) from public, anon;
grant execute on function public.get_discovery_cards(jsonb) to authenticated;

create or replace function public.get_social_feed(
  p_viewer_id uuid,
  p_sort text default 'Latest',
  p_limit integer default 20,
  p_cursor jsonb default null
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
  with viewer as (
    select
      p.id,
      public.normalize_country_key(nullif(btrim(p.location_country), '')) as country,
      lower(nullif(btrim(coalesce(p.location_district, '')), '')) as district,
      lower(nullif(btrim(coalesce(p.location_name, '')), '')) as city,
      coalesce(
        p.location,
        p.location_geog,
        case when p.last_lng is not null and p.last_lat is not null then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography else null end
      ) as geog
    from public.profiles p
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
      coalesce(
        nullif(btrim(ma_by_map.location_district), ''),
        nullif(btrim(ma_by_thread.location_district), ''),
        nullif(btrim(split_part(coalesce(ma_by_map.address, ''), ',', 2)), ''),
        nullif(btrim(split_part(coalesce(ma_by_thread.address, ''), ',', 2)), ''),
        nullif(btrim(split_part(coalesce(ba_by_map.address, ''), ',', 2)), ''),
        nullif(btrim(split_part(coalesce(ba_by_thread.address, ''), ',', 2)), '')
      ) as location_district,
      coalesce(
        nullif(btrim(split_part(coalesce(ma_by_map.address, ''), ',', 3)), ''),
        nullif(btrim(split_part(coalesce(ma_by_thread.address, ''), ',', 3)), ''),
        nullif(btrim(split_part(coalesce(ba_by_map.address, ''), ',', 3)), ''),
        nullif(btrim(split_part(coalesce(ba_by_thread.address, ''), ',', 3)), '')
      ) as location_city,
      coalesce(
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ma_by_map.address, '')), ',', 1))), '')),
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ma_by_thread.address, '')), ',', 1))), '')),
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ba_by_map.address, '')), ',', 1))), '')),
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ba_by_thread.address, '')), ',', 1))), ''))
      ) as location_country,
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
        when lower(nullif(btrim(coalesce(a.location_district, '')), '')) is not null
          and lower(nullif(btrim(coalesce(a.location_district, '')), '')) = v.district then 0
        when lower(nullif(btrim(coalesce(a.location_city, '')), '')) is not null
          and lower(nullif(btrim(coalesce(a.location_city, '')), '')) = v.city then 1
        when not coalesce(a.is_alert_derived, false)
          and lower(nullif(btrim(coalesce(p.location_district, '')), '')) is not null
          and lower(nullif(btrim(coalesce(p.location_district, '')), '')) = v.district then 0
        when not coalesce(a.is_alert_derived, false)
          and lower(nullif(btrim(coalesce(p.location_name, '')), '')) is not null
          and lower(nullif(btrim(coalesce(p.location_name, '')), '')) = v.city then 1
        else 2
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
      and (
        case
          when coalesce(a.is_alert_derived, false) = true and (
            a.scope_geog is not null
            or nullif(btrim(coalesce(a.location_country, '')), '') is not null
          ) then (
            v.country is not null
            and a.location_country = v.country
            and (
              v.geog is null
              or a.scope_geog is null
              or st_dwithin(v.geog, a.scope_geog, 150000)
            )
          )
          when coalesce(a.is_alert_derived, false) = true then false
          else public.is_in_scope(v.id, t.user_id)
        end
      )
  ),
  ranked as (
    select
      b.*,
      ((coalesce(b.like_count, 0) * 2) + (coalesce(b.comment_count, 0) * 3) + (coalesce(b.support_count, 0) * 1) - ((extract(epoch from (now() - b.created_at)) / 3600.0) * 0.10))::numeric as computed_score
    from base b
    where (
      lower(coalesce(p_sort, 'latest')) <> 'trending'
      or b.created_at >= now() - interval '7 days'
    )
      and (
        p_cursor is null
        or (b.created_at, b.id) < (
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

revoke all on function public.get_social_feed(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.get_social_feed(uuid, text, integer, jsonb) to authenticated;
grant execute on function public.get_social_feed(uuid, text, integer, jsonb) to service_role;
