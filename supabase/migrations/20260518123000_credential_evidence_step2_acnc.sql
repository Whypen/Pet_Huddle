-- Step 2A/2B: enable the ACNC downloadable/API-backed charity source.
-- Other Step 2 sources stay deferred until their access pattern is safe for
-- one-credential deterministic checks without raw identifier storage.

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
values (
  'acnc_registered_charities',
  'ACNC Charity Register',
  'org_registry',
  'Australia',
  'rescue_foster_org',
  'api',
  'https://data.gov.au/data/api/3/action/datastore_search',
  'Matched to the ACNC Charity Register dataset only. This confirms organization registration data, not the individual fosterer or volunteer relationship.',
  true,
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
    active = excluded.active,
    safe_to_show_source_name = excluded.safe_to_show_source_name,
    allow_public_masked_identifier = excluded.allow_public_masked_identifier,
    updated_at = now();

create or replace function public.credential_identifier_matches_hmac(
  p_expected_hmac text,
  p_candidate_identifier text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if nullif(btrim(coalesce(p_expected_hmac, '')), '') is null then
    return false;
  end if;

  return public.credential_identifier_hmac(p_candidate_identifier) = p_expected_hmac;
end;
$$;

revoke all on function public.credential_identifier_matches_hmac(text, text) from public, anon, authenticated;
grant execute on function public.credential_identifier_matches_hmac(text, text) to service_role;
