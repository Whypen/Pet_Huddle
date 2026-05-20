-- Step 4B activation after certificate fixture harnesses and source-shape probes passed.

update public.credential_registry_sources
set active = true,
    updated_at = now()
where source_key in (
  'city_guilds_mycertis',
  'red_cross_certificate_lookup'
);
