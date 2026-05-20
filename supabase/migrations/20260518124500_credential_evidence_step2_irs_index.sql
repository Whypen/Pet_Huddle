-- Step 2B: IRS EO BMF matching uses a pre-indexed local table.
-- The Edge Function must never scan the large IRS CSV files per request.
-- Keep this source inactive until an EO BMF import/index job exists and data
-- freshness is proven. While inactive, public UI must not show IRS checks as
-- available.

create table if not exists public.credential_irs_eo_bmf_index (
  id uuid primary key default gen_random_uuid(),
  ein_hmac text not null unique,
  organization_name text not null,
  organization_name_normalized text not null,
  subsection_code text,
  affiliation_code text,
  deductibility_code text,
  foundation_code text,
  source_region text,
  source_posting_date date,
  source_url text not null default 'https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf',
  active boolean not null default true,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credential_irs_eo_bmf_index_ein_hmac_not_blank
    check (length(btrim(ein_hmac)) > 0),
  constraint credential_irs_eo_bmf_index_name_not_blank
    check (length(btrim(organization_name)) > 0),
  constraint credential_irs_eo_bmf_index_normalized_name_not_blank
    check (length(btrim(organization_name_normalized)) > 0)
);

create index if not exists idx_credential_irs_eo_bmf_index_active_ein
  on public.credential_irs_eo_bmf_index (active, ein_hmac);

create index if not exists idx_credential_irs_eo_bmf_index_normalized_name
  on public.credential_irs_eo_bmf_index (organization_name_normalized);

drop trigger if exists set_credential_irs_eo_bmf_index_updated_at on public.credential_irs_eo_bmf_index;
create trigger set_credential_irs_eo_bmf_index_updated_at
  before update on public.credential_irs_eo_bmf_index
  for each row execute procedure public.set_updated_at();

alter table public.credential_irs_eo_bmf_index enable row level security;
revoke all on table public.credential_irs_eo_bmf_index from public, anon, authenticated;

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
  'irs_eo_bmf',
  'IRS Exempt Organizations Business Master File Extract',
  'org_registry',
  'United States',
  'rescue_foster_org',
  'downloadable',
  'https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf',
  'Matched to the IRS Exempt Organizations Business Master File Extract only. This confirms a tax-exempt organization record, not the carer’s role with that organization.',
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
