create or replace function public.get_native_verify_identity_profile_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'phone', p.phone,
    'phone_verification_status', p.phone_verification_status,
    'phone_verified_at', p.phone_verified_at,
    'verification_status', p.verification_status,
    'is_verified', p.is_verified,
    'human_verification_status', to_jsonb(p)->>'human_verification_status',
    'human_verified_at', to_jsonb(p)->>'human_verified_at',
    'card_verification_status', to_jsonb(p)->>'card_verification_status',
    'card_verified', coalesce((to_jsonb(p)->>'card_verified')::boolean, false),
    'card_verified_at', to_jsonb(p)->>'card_verified_at',
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
