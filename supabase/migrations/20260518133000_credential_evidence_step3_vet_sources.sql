-- Step 3B: official vet registry sources start inactive.
-- They are activated only after fixture tests and live source-shape probes pass.

insert into public.credential_registry_sources (
  source_key,
  source_name,
  source_type,
  country_region,
  credential_type,
  automation_level,
  source_url,
  usage_caveat,
  active,
  safe_to_show_source_name,
  allow_public_masked_identifier
)
values
  (
    'vsbhk_registered_veterinary_surgeons',
    'VSBHK Registered Veterinary Surgeons List',
    'official_registry',
    'Hong Kong',
    'Veterinarian',
    'web_lookup',
    'https://www.vsbhk.org.hk/english/vsro/vsro.html',
    'Matched to the VSBHK Registered Veterinary Surgeons list only. This does not claim global professional verification.',
    false,
    true,
    true
  ),
  (
    'rcvs_find_a_vet_surgeon',
    'RCVS Find a Vet Surgeon',
    'official_registry',
    'United Kingdom',
    'Veterinarian',
    'web_lookup',
    'https://findavet.rcvs.org.uk/find-a-vet-surgeon/',
    'Matched to the RCVS Find a Vet Surgeon register result only. This does not claim global professional verification.',
    false,
    true,
    true
  ),
  (
    'rcvs_find_a_vet_nurse',
    'RCVS Find a Vet Nurse',
    'official_registry',
    'United Kingdom',
    'Vet Nurse',
    'web_lookup',
    'https://findavet.rcvs.org.uk/find-a-vet-nurse/',
    'Matched to the RCVS Find a Vet Nurse register result only. This does not claim global professional verification.',
    false,
    true,
    true
  )
on conflict (source_key) do update
set source_name = excluded.source_name,
    source_type = excluded.source_type,
    country_region = excluded.country_region,
    credential_type = excluded.credential_type,
    automation_level = excluded.automation_level,
    source_url = excluded.source_url,
    usage_caveat = excluded.usage_caveat,
    active = false,
    safe_to_show_source_name = excluded.safe_to_show_source_name,
    allow_public_masked_identifier = excluded.allow_public_masked_identifier,
    updated_at = now();
