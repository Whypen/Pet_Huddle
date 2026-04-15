insert into public.verification_requests (
  user_id,
  request_type,
  status,
  provider,
  submitted_data,
  verification_result,
  created_at
)
select
  p.id,
  'phone',
  'approved',
  'supabase',
  jsonb_build_object('phone', p.phone, 'source', 'legacy_metadata_backfill'),
  jsonb_build_object('status', 'approved', 'source', 'legacy_metadata_backfill'),
  coalesce(p.updated_at, now())
from public.profiles p
join auth.users u on u.id = p.id
where coalesce(p.phone, '') <> ''
  and regexp_replace(coalesce(p.phone, ''), '[^0-9+]', '', 'g') = regexp_replace(coalesce(u.raw_user_meta_data->>'phone_e164', ''), '[^0-9+]', '', 'g')
  and lower(coalesce(u.raw_user_meta_data->>'phone_verified_local', 'false')) = 'true'
  and not exists (
    select 1
    from public.verification_requests vr
    where vr.user_id = p.id
      and vr.request_type = 'phone'
      and vr.status = 'approved'
      and regexp_replace(coalesce(vr.submitted_data->>'phone', ''), '[^0-9+]', '', 'g') = regexp_replace(coalesce(p.phone, ''), '[^0-9+]', '', 'g')
  );
