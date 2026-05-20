-- Step 3B activation after fixture harness and live source-shape probes passed.
-- These sources still require one submitted credential per check, strong
-- identifiers, server-side lookup only, and redacted result storage.

update public.credential_registry_sources
set active = true,
    updated_at = now()
where source_key in (
  'vsbhk_registered_veterinary_surgeons',
  'rcvs_find_a_vet_surgeon',
  'rcvs_find_a_vet_nurse'
);
