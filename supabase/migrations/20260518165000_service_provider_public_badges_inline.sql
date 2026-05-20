drop function if exists public.get_native_service_provider_cards(double precision, double precision, text, jsonb);

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
  distance_km double precision,
  public_credential_badges jsonb
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
  active_service_providers as (
    select distinct sc.provider_id as user_id
    from public.service_chats sc
    join viewer v on v.user_id = sc.requester_id
    where sc.status in ('pending', 'booked', 'in_progress')
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
    join viewer v on true
    where pc.listed = true
      and pc.user_id <> v.user_id
      and not public.is_user_blocked(v.user_id, pc.user_id)
      and not exists (select 1 from hidden h where h.user_id = pc.user_id)
      and not exists (select 1 from active_service_providers asp where asp.user_id = pc.user_id)
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
    s.distance_km,
    coalesce((
      select jsonb_agg(to_jsonb(b))
      from public.get_public_provider_credential_badges(s.user_id) b
    ), '[]'::jsonb) as public_credential_badges
  from scoped s
  where s.scope_priority in (0, 1, 2)
  order by s.scope_priority asc, s.distance_km asc nulls last, s.service_rank_weight desc nulls last, s.updated_at desc nulls last;
$$;

revoke all on function public.get_native_service_provider_cards(double precision, double precision, text, jsonb) from public, anon;
grant execute on function public.get_native_service_provider_cards(double precision, double precision, text, jsonb) to authenticated;

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
      null::double precision as distance_km,
      coalesce((
        select jsonb_agg(to_jsonb(b))
        from public.get_public_provider_credential_badges(pc.user_id) b
      ), '[]'::jsonb) as public_credential_badges
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
