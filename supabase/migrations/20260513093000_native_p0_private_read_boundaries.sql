create or replace function public.request_storage_cleanup(
  p_bucket text,
  p_object_path text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_bucket text := lower(btrim(coalesce(p_bucket, '')));
  v_path text := btrim(coalesce(p_object_path, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_uid is null and v_role <> 'service_role' then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_bucket not in ('notices', 'social_album', 'alerts', 'chat_attachments', 'profile_photos', 'profiles') then
    raise exception 'invalid_bucket' using errcode = '22023';
  end if;

  v_path := regexp_replace(split_part(v_path, '?', 1), '^/+', '');
  if v_path = '' or v_path like '%..%' then
    raise exception 'invalid_object_path' using errcode = '22023';
  end if;

  if v_role <> 'service_role' and v_path not like v_uid::text || '/%' then
    raise exception 'object_path_owner_mismatch' using errcode = '42501';
  end if;

  insert into public.storage_cleanup_queue(bucket, object_path, reason, requested_by)
  values (v_bucket, v_path, nullif(v_reason, ''), v_uid)
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.request_storage_cleanup(text, text, text) from public, anon;
grant execute on function public.request_storage_cleanup(text, text, text) to authenticated, service_role;

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
  )
  where auth.uid() is not null;
$$;

revoke all on function public.get_native_profile_summary() from public, anon;
grant execute on function public.get_native_profile_summary() to authenticated, service_role;

create or replace function public.get_native_verify_identity_profile_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'verification_status', p.verification_status,
    'card_verification_status', to_jsonb(p)->>'card_verification_status',
    'card_verified', coalesce((to_jsonb(p)->>'card_verified')::boolean, false),
    'card_brand', to_jsonb(p)->>'card_brand',
    'card_last4', to_jsonb(p)->>'card_last4',
    'stripe_setup_intent_id', to_jsonb(p)->>'stripe_setup_intent_id',
    'legal_name', p.legal_name,
    'verification_rejection_code', to_jsonb(p)->>'verification_rejection_code'
  )
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_native_verify_identity_profile_snapshot() from public, anon;
grant execute on function public.get_native_verify_identity_profile_snapshot() to authenticated, service_role;

create or replace function public.get_native_viewer_group_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  profile_row as (
    select jsonb_build_object(
      'location_country', p.location_country,
      'location_district', p.location_district,
      'location_name', p.location_name
    ) as profile
    from public.profiles p
    join viewer v on v.user_id = p.id
    limit 1
  ),
  pet_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'species', pet.species,
      'breed', pet.breed
    ) order by pet.created_at desc nulls last), '[]'::jsonb) as pets
    from public.pets pet
    join viewer v on v.user_id = pet.owner_id
    where coalesce(pet.is_active, true) = true
  ),
  request_rows as (
    select coalesce(jsonb_agg(gjr.chat_id order by gjr.created_at desc nulls last), '[]'::jsonb) as requested_chat_ids
    from public.group_join_requests gjr
    join viewer v on v.user_id = gjr.user_id
    where gjr.status = 'pending'
    limit 100
  )
  select jsonb_build_object(
    'profile', (select profile from profile_row),
    'pets', coalesce((select pets from pet_rows), '[]'::jsonb),
    'requested_chat_ids', coalesce((select requested_chat_ids from request_rows), '[]'::jsonb)
  )
  where (select user_id from viewer) is not null;
$$;

revoke all on function public.get_native_viewer_group_context() from public, anon;
grant execute on function public.get_native_viewer_group_context() to authenticated, service_role;
