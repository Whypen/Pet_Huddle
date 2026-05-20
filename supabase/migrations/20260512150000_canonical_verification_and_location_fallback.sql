-- Canonical verification source and non-GPS discovery fallback.

create or replace function public.sync_profile_is_verified_from_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.is_verified := (new.verification_status = 'verified'::public.verification_status_enum);
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_is_verified_from_status on public.profiles;
create trigger trg_sync_profile_is_verified_from_status
before insert or update of verification_status on public.profiles
for each row
execute function public.sync_profile_is_verified_from_status();

alter table public.profiles disable trigger trg_prevent_non_admin_verification;
alter table public.profiles disable trigger trg_prevent_sensitive_profile_updates;

update public.profiles
set is_verified = (verification_status = 'verified'::public.verification_status_enum)
where coalesce(is_verified, false) is distinct from (verification_status = 'verified'::public.verification_status_enum);

alter table public.profiles enable trigger trg_prevent_sensitive_profile_updates;
alter table public.profiles enable trigger trg_prevent_non_admin_verification;

create or replace function public.refresh_identity_verification_status(p_user_id uuid)
returns public.verification_status_enum
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_phone_complete boolean := false;
  v_human_status text := 'not_started';
  v_card_status text := 'not_started';
  v_final public.verification_status_enum := 'unverified';
  v_profile_phone_norm text := '';
  v_auth_phone text := '';
  v_auth_phone_norm text := '';
  v_auth_phone_confirmed boolean := false;
begin
  if p_user_id is null then
    raise exception 'missing_user_id';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  v_human_status := coalesce(v_profile.human_verification_status, 'not_started');
  v_card_status := coalesce(v_profile.card_verification_status, 'not_started');
  v_profile_phone_norm := regexp_replace(coalesce(v_profile.phone, ''), '[^0-9+]', '', 'g');

  select
    coalesce(au.phone, ''),
    (au.phone_confirmed_at is not null)
  into
    v_auth_phone,
    v_auth_phone_confirmed
  from auth.users au
  where au.id = p_user_id;

  v_auth_phone_norm := regexp_replace(coalesce(v_auth_phone, ''), '[^0-9+]', '', 'g');

  if v_profile_phone_norm <> '' then
    if v_auth_phone_confirmed and v_auth_phone_norm = v_profile_phone_norm then
      v_phone_complete := true;
    elsif exists (
      select 1
      from public.verification_requests vr
      where vr.user_id = p_user_id
        and vr.request_type = 'phone'
        and vr.status = 'approved'
        and regexp_replace(coalesce(vr.submitted_data->>'phone', ''), '[^0-9+]', '', 'g') = v_profile_phone_norm
    ) then
      v_phone_complete := true;
    end if;
  end if;

  if v_profile.verification_rejection_code = 'blocked_identity' then
    v_final := 'unverified';
  elsif v_phone_complete
     and v_human_status = 'passed'
     and v_card_status = 'passed' then
    v_final := 'verified';
  elsif v_phone_complete
     or v_human_status <> 'not_started'
     or v_card_status <> 'not_started' then
    v_final := 'pending';
  else
    v_final := 'unverified';
  end if;

  update public.profiles
  set verification_status = v_final
  where id = p_user_id;

  return v_final;
end;
$$;

grant execute on function public.refresh_identity_verification_status(uuid) to authenticated, service_role;

create or replace function public.pii_purge_identity_verification()
returns void
language plpgsql
as $$
begin
  delete from storage.objects o
  using public.profiles p
  where o.bucket_id = 'identity_verification'
    and o.owner = p.id
    and p.verification_status in ('verified'::public.verification_status_enum, 'unverified'::public.verification_status_enum)
    and p.updated_at <= now() - interval '7 days';
end;
$$;

create or replace function public.get_native_service_provider_cards(
  p_lat double precision default null,
  p_lng double precision default null,
  p_viewer_country text default null
)
returns table(
  user_id uuid,
  services_offered text[],
  currency text,
  starting_price numeric,
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
    pc.services_offered,
    pc.currency,
    pc.starting_price,
    pc.created_at,
    pc.updated_at,
    pp.display_name,
    pp.avatar_url,
    coalesce(pp.has_car, false) as has_car,
    (p.verification_status = 'verified'::public.verification_status_enum) as is_verified,
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
    and p.verification_status = 'verified'::public.verification_status_enum
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
  order by distance_km asc nulls last, pc.updated_at desc nulls last
  limit 100;
$$;

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
      (p.verification_status = 'verified'::public.verification_status_enum) as is_verified,
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
      and p.verification_status = 'verified'::public.verification_status_enum
      and not exists (
        select 1 from public.user_moderation_restrictions r
        where r.user_id = pc.user_id
          and r.restriction_key = 'marketplace_hidden'
          and (r.expires_at is null or r.expires_at > now())
      )
  ) row
  limit 1;
$$;

grant execute on function public.get_native_service_provider_detail(uuid) to authenticated;

create or replace function public.get_discovery_cards(p_filters jsonb default '{}'::jsonb)
returns table(
  id uuid,
  display_name text,
  avatar_url text,
  photos text[],
  is_verified boolean,
  verification_status text,
  has_car boolean,
  relationship_status text,
  age_years integer,
  location_name text,
  location_country text,
  gender_genre text,
  orientation text,
  degree text,
  height numeric,
  effective_tier text,
  tier text,
  pet_species text[],
  pet_size text,
  pet_experience text[],
  pet_experience_years numeric,
  experience_years numeric,
  languages text[],
  social_album text[],
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
  v_species text[] := case
    when jsonb_typeof(p_filters->'species') = 'array'
      then array(select jsonb_array_elements_text(p_filters->'species'))
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
  pets_by_owner as (
    select
      p.owner_id,
      array_remove(array_agg(distinct p.species), null) as species
    from public.pets p
    where coalesce(p.is_active, true) = true
    group by p.owner_id
  )
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.photos,
    (p.verification_status = 'verified'::public.verification_status_enum) as is_verified,
    p.verification_status::text,
    coalesce(p.has_car, false) as has_car,
    p.relationship_status,
    case when p.dob is null then null else date_part('year', age(p.dob))::integer end as age_years,
    p.location_name,
    p.location_country,
    p.gender_genre,
    p.orientation,
    p.degree,
    p.height,
    p.effective_tier::text,
    p.tier::text,
    coalesce(p.pet_species, pbo.species, '{}'::text[]) as pet_species,
    p.pet_size,
    p.pet_experience,
    p.pet_experience_years,
    p.experience_years,
    p.languages,
    p.social_album,
    p.availability_status::text,
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
  left join pets_by_owner pbo on pbo.owner_id = p.id
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
    and (v_height_min is null or p.height >= v_height_min)
    and (v_height_max is null or p.height <= v_height_max)
    and (
      v_species is null
      or coalesce(array_length(v_species, 1), 0) = 0
      or coalesce(p.pet_species, pbo.species, '{}'::text[]) && v_species
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
  order by score desc nulls last, p.updated_at desc nulls last, p.created_at desc nulls last
  limit 80;
end;
$$;

grant execute on function public.get_discovery_cards(jsonb) to authenticated;
