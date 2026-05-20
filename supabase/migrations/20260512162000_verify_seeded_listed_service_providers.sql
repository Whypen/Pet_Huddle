alter table public.profiles disable trigger trg_prevent_non_admin_verification;
alter table public.profiles disable trigger trg_prevent_sensitive_profile_updates;

update public.profiles p
set
  phone_verification_status = 'verified'::public.verification_status_enum,
  phone_verified_at = coalesce(p.phone_verified_at, now()),
  human_verification_status = 'passed',
  human_verified_at = coalesce(p.human_verified_at, now()),
  card_verification_status = 'passed',
  card_verified = true,
  verification_rejection_code = null,
  verification_status = 'verified'::public.verification_status_enum
where p.id in (
  select pc.user_id
  from public.pet_care_profiles pc
  join auth.users au on au.id = pc.user_id
  where pc.listed = true
    and lower(au.email) like 'testaccount%@huddle.test'
);

alter table public.profiles enable trigger trg_prevent_sensitive_profile_updates;
alter table public.profiles enable trigger trg_prevent_non_admin_verification;
