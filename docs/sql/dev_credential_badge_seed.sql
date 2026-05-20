-- DEV/STAGING ONLY: credential badge UI/RPC proof seed for Hyphen.
-- Do not run this in production. This is not verification logic and does not
-- bypass or weaken any registry adapter. It creates one synthetic matched row
-- so the public badge UI can be tested without real-world credentials.
--
-- Target:
--   profile display_name = Hyphen
--   source_key = vsbhk_registered_veterinary_surgeons
--
-- Public output remains redacted because only license_number_masked is set.
-- No raw license/certificate number is stored by this seed.

-- SEED
begin;

with target_provider as (
  select
    p.id as user_id,
    pc.id as provider_profile_id
  from public.profiles p
  left join public.pet_care_profiles pc on pc.user_id = p.id
  where lower(coalesce(p.display_name, '')) = 'hyphen'
  order by p.created_at desc nulls last
  limit 1
),
target_source as (
  select id as source_id
  from public.credential_registry_sources
  where source_key = 'vsbhk_registered_veterinary_surgeons'
  limit 1
),
seeded_credential as (
  insert into public.professional_credentials (
    user_id,
    provider_profile_id,
    credential_type,
    country_region,
    legal_name,
    license_number_hmac,
    license_number_masked,
    issuing_body,
    expiry_date,
    document_storage_path,
    status,
    verification_method,
    public_label,
    last_checked_at,
    matched_at
  )
  select
    target_provider.user_id,
    target_provider.provider_profile_id,
    'Veterinarian',
    'Hong Kong',
    'Hyphen Dev Credential',
    'dev_seed_hyphen_veterinarian_hmac_only_20260518',
    '••••1234',
    'Hong Kong Pet Club',
    date '2028-03-03',
    null,
    'registry_matched',
    'registry',
    'Registry matched',
    now(),
    now()
  from target_provider
  on conflict (
    user_id,
    lower(credential_type),
    lower(country_region),
    coalesce(lower(issuing_body), ''),
    coalesce(license_number_hmac, '')
  )
  where license_number_hmac is not null
  do update set
    provider_profile_id = excluded.provider_profile_id,
    legal_name = excluded.legal_name,
    license_number_masked = excluded.license_number_masked,
    expiry_date = excluded.expiry_date,
    document_storage_path = null,
    status = excluded.status,
    verification_method = excluded.verification_method,
    public_label = excluded.public_label,
    last_checked_at = excluded.last_checked_at,
    matched_at = excluded.matched_at,
    updated_at = now()
  returning id, user_id
)
insert into public.credential_verification_checks (
  credential_id,
  user_id,
  source_id,
  checked_at,
  status_before,
  status_after,
  lookup_inputs,
  match_result,
  matched_fields,
  confidence,
  raw_result_redacted,
  edge_function_run_id
)
select
  seeded_credential.id,
  seeded_credential.user_id,
  target_source.source_id,
  now(),
  'self_declared',
  'registry_matched',
  jsonb_build_object(
    'dev_seed', true,
    'credential_type', 'Veterinarian',
    'country_region', 'Hong Kong',
    'masked_identifier', '••••1234'
  ),
  jsonb_build_object(
    'outcome', 'matched',
    'dev_seed', true
  ),
  '["credential_type","country_region","masked_identifier"]'::jsonb,
  'high',
  jsonb_build_object(
    'stored', 'redacted',
    'dev_seed', true
  ),
  'dev-seed-hyphen-credential-badge'
from seeded_credential
cross join target_source
where target_source.source_id is not null;

commit;

-- PUBLIC RPC PROOF
-- select *
-- from public.get_public_provider_credential_badges(
--   'ac72fbb2-c4a9-4066-9775-111dae2da5a1'::uuid
-- );

-- CLEANUP
-- begin;
--
-- delete from public.professional_credentials pc
-- where pc.user_id = 'ac72fbb2-c4a9-4066-9775-111dae2da5a1'::uuid
--   and pc.credential_type = 'Veterinarian'
--   and pc.country_region = 'Hong Kong'
--   and pc.legal_name = 'Hyphen Dev Credential'
--   and pc.license_number_hmac = 'dev_seed_hyphen_veterinarian_hmac_only_20260518';
--
-- commit;
