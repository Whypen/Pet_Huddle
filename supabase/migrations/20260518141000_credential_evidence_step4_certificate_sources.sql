-- Step 4B: certificate lookup sources start inactive.
-- Red Cross remains inactive until a server-side source-shape probe can reach
-- a stable certificate-ID lookup path without access denial.
-- City & Guilds is activated only after fixture tests and source-shape probes pass.

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
    'red_cross_certificate_lookup',
    'Red Cross certificate lookup',
    'issuer_certificate',
    'Supported Red Cross markets',
    'animal_first_aid',
    'web_lookup',
    'https://www.redcross.org/take-a-class/digital-certificate',
    'Matched to Red Cross certificate lookup only. This does not claim professional verification.',
    false,
    true,
    true
  ),
  (
    'city_guilds_mycertis',
    'City & Guilds certificate verification',
    'issuer_certificate',
    'Supported City & Guilds markets',
    'groomer',
    'web_lookup',
    'https://www.mycertis.com/verify?alternative=true',
    'Matched to City & Guilds certificate verification only. This does not claim professional verification.',
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
