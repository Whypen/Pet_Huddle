-- Native Service card/detail RPC split for cache/network/privacy gate.

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
    and coalesce(pp.is_verified, false) = true
    and p.verification_status::text = 'verified'
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
      and coalesce(pp.is_verified, false) = true
      and p.verification_status::text = 'verified'
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
