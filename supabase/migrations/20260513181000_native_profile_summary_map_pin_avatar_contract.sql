create or replace function public.get_native_profile_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with profile_row as (
    select
      jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'email', p.email,
        'social_id', p.social_id,
        'avatar_url', p.avatar_url,
        'availability_status', p.availability_status,
        'is_verified', p.is_verified,
        'verification_status', p.verification_status,
        'effective_tier', coalesce(to_jsonb(p)->>'effective_tier', p.tier::text),
        'tier', p.tier,
        'non_social', coalesce((to_jsonb(p)->>'non_social')::boolean, false),
        'hide_from_map', coalesce((to_jsonb(p)->>'hide_from_map')::boolean, false),
        'pet_experience', p.pet_experience,
        'family_slots', p.family_slots,
        'country', p.location_country,
        'city', p.location_name,
        'location_label', p.location_name,
        'location_name', p.location_name,
        'location_country', p.location_country,
        'location_district', p.location_district,
        'dob', p.dob,
        'latitude', coalesce(p.latitude, p.last_lat),
        'longitude', coalesce(p.longitude, p.last_lng),
        'last_lat', p.last_lat,
        'last_lng', p.last_lng,
        'location_pinned_until', p.location_pinned_until,
        'social_album', p.social_album
      ) as profile
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ),
  quota_row as (
    select to_jsonb(q) as quota
    from public.get_quota_snapshot() q
    limit 1
  )
  select jsonb_build_object(
    'profile', (select profile from profile_row),
    'quota', (select quota from quota_row)
  );
$$;

revoke all on function public.get_native_profile_summary() from public, anon;
grant execute on function public.get_native_profile_summary() to authenticated, service_role;
