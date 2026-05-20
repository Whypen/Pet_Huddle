-- Credential evidence matching framework.
-- This is separate from identity verification and never updates profile identity flags.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.credential_source_type as enum (
    'official_registry',
    'issuer_certificate',
    'org_registry',
    'licence_registry',
    'directory'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.credential_automation_level as enum (
    'api',
    'downloadable',
    'web_lookup'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.professional_credential_status as enum (
    'self_declared',
    'check_pending',
    'registry_matched',
    'certificate_matched',
    'organization_matched',
    'directory_matched',
    'unable_to_verify'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.credential_verification_method as enum (
    'none',
    'registry',
    'certificate',
    'organization',
    'directory'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.credential_confidence as enum (
    'none',
    'low',
    'medium',
    'high'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.credential_registry_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_name text not null,
  source_type public.credential_source_type not null,
  country_region text not null,
  credential_type text not null,
  automation_level public.credential_automation_level not null,
  source_url text,
  usage_caveat text not null default '',
  active boolean not null default false,
  safe_to_show_source_name boolean not null default true,
  allow_public_masked_identifier boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credential_registry_sources_source_key_not_blank
    check (length(btrim(source_key)) > 0),
  constraint credential_registry_sources_source_name_not_blank
    check (length(btrim(source_name)) > 0),
  constraint credential_registry_sources_country_region_not_blank
    check (length(btrim(country_region)) > 0),
  constraint credential_registry_sources_credential_type_not_blank
    check (length(btrim(credential_type)) > 0)
);

create table if not exists public.professional_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_profile_id uuid null references public.pet_care_profiles(id) on delete set null,
  credential_type text not null,
  country_region text not null,
  legal_name text not null,
  license_number_hmac text,
  license_number_masked text,
  issuing_body text,
  expiry_date date,
  document_storage_path text,
  status public.professional_credential_status not null default 'self_declared',
  verification_method public.credential_verification_method not null default 'none',
  public_label text not null default 'Self-declared',
  last_checked_at timestamptz,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_credentials_credential_type_not_blank
    check (length(btrim(credential_type)) > 0),
  constraint professional_credentials_country_region_not_blank
    check (length(btrim(country_region)) > 0),
  constraint professional_credentials_legal_name_not_blank
    check (length(btrim(legal_name)) > 0),
  constraint professional_credentials_public_label_allowed
    check (public_label = any (array[
      'Self-declared',
      'Registry matched',
      'Certificate matched',
      'Organization matched',
      'Directory matched',
      'Unable to verify online'
    ])),
  constraint professional_credentials_method_matches_status
    check (
      (status in ('self_declared', 'check_pending', 'unable_to_verify') and verification_method = 'none')
      or (status = 'registry_matched' and verification_method = 'registry')
      or (status = 'certificate_matched' and verification_method = 'certificate')
      or (status = 'organization_matched' and verification_method = 'organization')
      or (status = 'directory_matched' and verification_method = 'directory')
    )
);

create table if not exists public.credential_verification_checks (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.professional_credentials(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid references public.credential_registry_sources(id) on delete set null,
  checked_at timestamptz not null default now(),
  status_before public.professional_credential_status not null,
  status_after public.professional_credential_status not null,
  lookup_inputs jsonb not null default '{}'::jsonb,
  match_result jsonb not null default '{}'::jsonb,
  matched_fields jsonb not null default '[]'::jsonb,
  confidence public.credential_confidence not null default 'none',
  raw_result_redacted jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  edge_function_run_id text,
  created_at timestamptz not null default now(),
  constraint credential_verification_checks_lookup_inputs_object
    check (jsonb_typeof(lookup_inputs) = 'object'),
  constraint credential_verification_checks_match_result_object
    check (jsonb_typeof(match_result) = 'object'),
  constraint credential_verification_checks_matched_fields_array
    check (jsonb_typeof(matched_fields) = 'array'),
  constraint credential_verification_checks_raw_result_redacted_object
    check (jsonb_typeof(raw_result_redacted) = 'object')
);

create table if not exists public.credential_verification_evidence (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.professional_credentials(id) on delete cascade,
  evidence_type text not null,
  storage_path text not null,
  redacted_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint credential_verification_evidence_type_not_blank
    check (length(btrim(evidence_type)) > 0),
  constraint credential_verification_evidence_storage_path_not_blank
    check (length(btrim(storage_path)) > 0),
  constraint credential_verification_evidence_redacted_metadata_object
    check (jsonb_typeof(redacted_metadata) = 'object')
);

create index if not exists idx_credential_registry_sources_active_lookup
  on public.credential_registry_sources (active, lower(credential_type), lower(country_region));

create index if not exists idx_professional_credentials_user_id
  on public.professional_credentials (user_id);

create index if not exists idx_professional_credentials_status
  on public.professional_credentials (status);

create index if not exists idx_professional_credentials_lookup
  on public.professional_credentials (lower(credential_type), lower(country_region));

create unique index if not exists idx_professional_credentials_identifier_unique
  on public.professional_credentials (
    user_id,
    lower(credential_type),
    lower(country_region),
    coalesce(lower(issuing_body), ''),
    coalesce(license_number_hmac, '')
  )
  where license_number_hmac is not null;

create index if not exists idx_credential_verification_checks_credential_checked
  on public.credential_verification_checks (credential_id, checked_at desc);

create index if not exists idx_credential_verification_checks_user_id
  on public.credential_verification_checks (user_id);

create index if not exists idx_credential_verification_checks_source_checked
  on public.credential_verification_checks (source_id, checked_at desc);

create index if not exists idx_credential_verification_evidence_credential_id
  on public.credential_verification_evidence (credential_id);

drop trigger if exists set_credential_registry_sources_updated_at on public.credential_registry_sources;
create trigger set_credential_registry_sources_updated_at
  before update on public.credential_registry_sources
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_professional_credentials_updated_at on public.professional_credentials;
create trigger set_professional_credentials_updated_at
  before update on public.professional_credentials
  for each row execute procedure public.set_updated_at();

alter table public.credential_registry_sources enable row level security;
alter table public.professional_credentials enable row level security;
alter table public.credential_verification_checks enable row level security;
alter table public.credential_verification_evidence enable row level security;

drop policy if exists "credential sources public active read" on public.credential_registry_sources;
create policy "credential sources public active read"
  on public.credential_registry_sources
  for select
  using (active = true);

drop policy if exists "users read own professional credentials" on public.professional_credentials;
create policy "users read own professional credentials"
  on public.professional_credentials
  for select
  using (user_id = auth.uid());

drop policy if exists "users insert own professional credentials" on public.professional_credentials;
create policy "users insert own professional credentials"
  on public.professional_credentials
  for insert
  with check (user_id = auth.uid());

drop policy if exists "users update own editable professional credentials" on public.professional_credentials;
create policy "users update own editable professional credentials"
  on public.professional_credentials
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and status in ('self_declared', 'unable_to_verify')
  );

drop policy if exists "users delete own idle professional credentials" on public.professional_credentials;
create policy "users delete own idle professional credentials"
  on public.professional_credentials
  for delete
  using (user_id = auth.uid() and status <> 'check_pending');

drop policy if exists "users read own credential checks" on public.credential_verification_checks;
create policy "users read own credential checks"
  on public.credential_verification_checks
  for select
  using (user_id = auth.uid());

drop policy if exists "users read own credential evidence" on public.credential_verification_evidence;
create policy "users read own credential evidence"
  on public.credential_verification_evidence
  for select
  using (
    exists (
      select 1
      from public.professional_credentials pc
      where pc.id = credential_verification_evidence.credential_id
        and pc.user_id = auth.uid()
    )
  );

drop policy if exists "users insert own credential evidence" on public.credential_verification_evidence;
create policy "users insert own credential evidence"
  on public.credential_verification_evidence
  for insert
  with check (
    exists (
      select 1
      from public.professional_credentials pc
      where pc.id = credential_verification_evidence.credential_id
        and pc.user_id = auth.uid()
    )
  );

drop policy if exists "users delete own credential evidence" on public.credential_verification_evidence;
create policy "users delete own credential evidence"
  on public.credential_verification_evidence
  for delete
  using (
    exists (
      select 1
      from public.professional_credentials pc
      where pc.id = credential_verification_evidence.credential_id
        and pc.user_id = auth.uid()
    )
  );

create or replace function public.credential_normalize_text(p_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(p_value, ''))), '\s+', ' ', 'g'), '');
$$;

create or replace function public.credential_public_label(
  p_status public.professional_credential_status
)
returns text
language sql
immutable
as $$
  select case p_status
    when 'registry_matched' then 'Registry matched'
    when 'certificate_matched' then 'Certificate matched'
    when 'organization_matched' then 'Organization matched'
    when 'directory_matched' then 'Directory matched'
    when 'unable_to_verify' then 'Unable to verify online'
    else 'Self-declared'
  end;
$$;

create or replace function public.credential_method_for_status(
  p_status public.professional_credential_status
)
returns public.credential_verification_method
language sql
immutable
as $$
  select case p_status
    when 'registry_matched' then 'registry'::public.credential_verification_method
    when 'certificate_matched' then 'certificate'::public.credential_verification_method
    when 'organization_matched' then 'organization'::public.credential_verification_method
    when 'directory_matched' then 'directory'::public.credential_verification_method
    else 'none'::public.credential_verification_method
  end;
$$;

create or replace function public.credential_mask_identifier(p_identifier text)
returns text
language plpgsql
immutable
as $$
declare
  v_clean text := regexp_replace(btrim(coalesce(p_identifier, '')), '\s+', '', 'g');
  v_len int := length(v_clean);
begin
  if v_len = 0 then
    return null;
  end if;

  if v_len <= 4 then
    return repeat('*', greatest(v_len - 1, 1)) || right(v_clean, 1);
  end if;

  return left(v_clean, 2) || repeat('*', greatest(v_len - 4, 2)) || right(v_clean, 2);
end;
$$;

create or replace function public.credential_identifier_hmac(p_identifier text)
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_clean text := credential_normalize_text(p_identifier);
  v_secret text := nullif(current_setting('app.credential_hmac_key', true), '');
begin
  if v_clean is null then
    return null;
  end if;

  if v_secret is null then
    raise exception 'missing_credential_hmac_key' using errcode = 'P0001';
  end if;

  return encode(extensions.hmac(v_clean, v_secret, 'sha256'), 'hex');
end;
$$;

create or replace function public.submit_professional_credential(
  p_credential_type text,
  p_country_region text,
  p_legal_name text,
  p_license_number text default null,
  p_issuing_body text default null,
  p_expiry_date date default null,
  p_provider_profile_id uuid default null,
  p_document_storage_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_credential_id uuid;
  v_license_hmac text := credential_identifier_hmac(p_license_number);
  v_license_masked text := credential_mask_identifier(p_license_number);
  v_source public.credential_registry_sources%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if credential_normalize_text(p_credential_type) is null
    or credential_normalize_text(p_country_region) is null
    or credential_normalize_text(p_legal_name) is null then
    raise exception 'credential_required_fields_missing' using errcode = 'P0001';
  end if;

  if p_provider_profile_id is not null and not exists (
    select 1
    from public.pet_care_profiles pc
    where pc.id = p_provider_profile_id
      and pc.user_id = v_user_id
  ) then
    raise exception 'provider_profile_not_owned' using errcode = 'P0001';
  end if;

  select *
  into v_source
  from public.credential_registry_sources crs
  where crs.active = true
    and credential_normalize_text(crs.credential_type) = credential_normalize_text(p_credential_type)
    and credential_normalize_text(crs.country_region) = credential_normalize_text(p_country_region)
  order by crs.created_at asc
  limit 1;

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
    public_label
  )
  values (
    v_user_id,
    p_provider_profile_id,
    btrim(p_credential_type),
    btrim(p_country_region),
    regexp_replace(btrim(p_legal_name), '\s+', ' ', 'g'),
    v_license_hmac,
    v_license_masked,
    nullif(btrim(coalesce(p_issuing_body, '')), ''),
    p_expiry_date,
    nullif(btrim(coalesce(p_document_storage_path, '')), ''),
    'self_declared',
    'none',
    'Self-declared'
  )
  returning id into v_credential_id;

  return jsonb_build_object(
    'id', v_credential_id,
    'status', 'self_declared',
    'public_label', 'Self-declared',
    'check_available', v_source.id is not null,
    'source_key', v_source.source_key,
    'source_type', v_source.source_type,
    'caveat', coalesce(v_source.usage_caveat, 'Self-declared · Not verified by Huddle')
  );
end;
$$;

create or replace function public.get_my_professional_credentials()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', pc.id,
      'credential_type', pc.credential_type,
      'country_region', pc.country_region,
      'legal_name', pc.legal_name,
      'license_number_masked', pc.license_number_masked,
      'issuing_body', pc.issuing_body,
      'expiry_date', pc.expiry_date,
      'status', pc.status,
      'verification_method', pc.verification_method,
      'public_label', pc.public_label,
      'last_checked_at', pc.last_checked_at,
      'matched_at', pc.matched_at,
      'created_at', pc.created_at,
      'updated_at', pc.updated_at,
      'check_available', exists (
        select 1
        from public.credential_registry_sources crs
        where crs.active = true
          and public.credential_normalize_text(crs.credential_type) = public.credential_normalize_text(pc.credential_type)
          and public.credential_normalize_text(crs.country_region) = public.credential_normalize_text(pc.country_region)
      )
    )
    order by pc.created_at desc
  ), '[]'::jsonb)
  from public.professional_credentials pc
  where pc.user_id = auth.uid();
$$;

create or replace function public.check_professional_credential_registry(
  p_credential_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_credential public.professional_credentials%rowtype;
  v_source public.credential_registry_sources%rowtype;
  v_recent_check timestamptz;
  v_check_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select *
  into v_credential
  from public.professional_credentials pc
  where pc.id = p_credential_id
    and pc.user_id = v_user_id;

  if v_credential.id is null then
    raise exception 'credential_not_found' using errcode = 'P0001';
  end if;

  select *
  into v_source
  from public.credential_registry_sources crs
  where crs.active = true
    and credential_normalize_text(crs.credential_type) = credential_normalize_text(v_credential.credential_type)
    and credential_normalize_text(crs.country_region) = credential_normalize_text(v_credential.country_region)
  order by crs.created_at asc
  limit 1;

  if v_source.id is null then
    raise exception 'unsupported_credential_source' using errcode = 'P0001';
  end if;

  select max(cvc.checked_at)
  into v_recent_check
  from public.credential_verification_checks cvc
  where cvc.user_id = v_user_id
    and cvc.credential_id = p_credential_id
    and cvc.source_id = v_source.id;

  if v_recent_check is not null and v_recent_check > now() - interval '24 hours' then
    raise exception 'credential_check_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.credential_verification_checks (
    credential_id,
    user_id,
    source_id,
    status_before,
    status_after,
    lookup_inputs,
    match_result,
    matched_fields,
    confidence,
    raw_result_redacted
  )
  values (
    p_credential_id,
    v_user_id,
    v_source.id,
    v_credential.status,
    'check_pending',
    jsonb_build_object(
      'credential_type', v_credential.credential_type,
      'country_region', v_credential.country_region,
      'legal_name_present', v_credential.legal_name is not null,
      'masked_identifier', case when v_source.allow_public_masked_identifier then v_credential.license_number_masked else null end
    ),
    jsonb_build_object('outcome', 'check_pending'),
    '[]'::jsonb,
    'none',
    jsonb_build_object('stored', 'redacted')
  )
  returning id into v_check_id;

  update public.professional_credentials
  set status = 'check_pending',
      verification_method = 'none',
      public_label = 'Self-declared',
      last_checked_at = now(),
      matched_at = null
  where id = p_credential_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'credential_id', p_credential_id,
    'check_id', v_check_id,
    'status', 'check_pending',
    'source_id', v_source.id,
    'source_key', v_source.source_key,
    'edge_function', 'credential-registry-check'
  );
end;
$$;

create or replace function public.finish_professional_credential_check(
  p_check_id uuid,
  p_status_after public.professional_credential_status,
  p_match_result jsonb default '{}'::jsonb,
  p_matched_fields jsonb default '[]'::jsonb,
  p_confidence public.credential_confidence default 'none',
  p_raw_result_redacted jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_error_message text default null,
  p_edge_function_run_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check public.credential_verification_checks%rowtype;
  v_label text;
  v_method public.credential_verification_method;
  v_matched_at timestamptz := null;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = 'P0001';
  end if;

  if p_status_after = 'check_pending' then
    raise exception 'invalid_final_status' using errcode = 'P0001';
  end if;

  select *
  into v_check
  from public.credential_verification_checks
  where id = p_check_id;

  if v_check.id is null then
    raise exception 'check_not_found' using errcode = 'P0001';
  end if;

  v_label := public.credential_public_label(p_status_after);
  v_method := public.credential_method_for_status(p_status_after);

  if p_status_after in ('registry_matched', 'certificate_matched', 'organization_matched', 'directory_matched') then
    v_matched_at := now();
  end if;

  update public.credential_verification_checks
  set status_after = p_status_after,
      match_result = coalesce(p_match_result, '{}'::jsonb),
      matched_fields = coalesce(p_matched_fields, '[]'::jsonb),
      confidence = p_confidence,
      raw_result_redacted = coalesce(p_raw_result_redacted, '{}'::jsonb),
      error_code = p_error_code,
      error_message = p_error_message,
      edge_function_run_id = p_edge_function_run_id
  where id = p_check_id;

  update public.professional_credentials
  set status = p_status_after,
      verification_method = v_method,
      public_label = v_label,
      last_checked_at = now(),
      matched_at = v_matched_at
  where id = v_check.credential_id
    and user_id = v_check.user_id;

  return jsonb_build_object(
    'credential_id', v_check.credential_id,
    'check_id', p_check_id,
    'status', p_status_after,
    'public_label', v_label
  );
end;
$$;

create or replace function public.get_public_provider_credential_badges(
  p_provider_id uuid
)
returns table(
  credential_type text,
  public_label text,
  source_type text,
  source_name text,
  checked_at timestamptz,
  masked_identifier text,
  caveat text
)
language sql
security definer
set search_path = public
as $$
  select
    pc.credential_type,
    pc.public_label,
    crs.source_type::text,
    case when coalesce(crs.safe_to_show_source_name, false) then crs.source_name else null end as source_name,
    pc.last_checked_at as checked_at,
    case when coalesce(crs.allow_public_masked_identifier, false) then pc.license_number_masked else null end as masked_identifier,
    case
      when pc.status = 'self_declared' then 'Self-declared · Not verified by Huddle'
      else coalesce(nullif(crs.usage_caveat, ''), 'Credential evidence matched to the named source only.')
    end as caveat
  from public.professional_credentials pc
  left join lateral (
    select cvc.source_id
    from public.credential_verification_checks cvc
    where cvc.credential_id = pc.id
      and cvc.status_after = pc.status
    order by cvc.checked_at desc
    limit 1
  ) latest on true
  left join public.credential_registry_sources crs on crs.id = latest.source_id
  where pc.user_id = p_provider_id
    and pc.status in (
      'self_declared',
      'registry_matched',
      'certificate_matched',
      'organization_matched',
      'directory_matched',
      'unable_to_verify'
    )
  order by
    case pc.status
      when 'registry_matched' then 1
      when 'certificate_matched' then 2
      when 'organization_matched' then 3
      when 'directory_matched' then 4
      when 'unable_to_verify' then 5
      else 6
    end,
    pc.updated_at desc;
$$;

revoke all on table public.credential_registry_sources from public, anon, authenticated;
revoke all on table public.professional_credentials from public, anon, authenticated;
revoke all on table public.credential_verification_checks from public, anon, authenticated;
revoke all on table public.credential_verification_evidence from public, anon, authenticated;

grant select on table public.credential_registry_sources to anon, authenticated;
grant select, insert, update, delete on table public.professional_credentials to authenticated;
grant select on table public.credential_verification_checks to authenticated;
grant select, insert, delete on table public.credential_verification_evidence to authenticated;

revoke all on function public.submit_professional_credential(text, text, text, text, text, date, uuid, text) from public, anon;
grant execute on function public.submit_professional_credential(text, text, text, text, text, date, uuid, text) to authenticated;

revoke all on function public.get_my_professional_credentials() from public, anon;
grant execute on function public.get_my_professional_credentials() to authenticated;

revoke all on function public.check_professional_credential_registry(uuid) from public, anon;
grant execute on function public.check_professional_credential_registry(uuid) to authenticated;

revoke all on function public.finish_professional_credential_check(uuid, public.professional_credential_status, jsonb, jsonb, public.credential_confidence, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_professional_credential_check(uuid, public.professional_credential_status, jsonb, jsonb, public.credential_confidence, jsonb, text, text, text) to service_role;

revoke all on function public.get_public_provider_credential_badges(uuid) from public;
grant execute on function public.get_public_provider_credential_badges(uuid) to anon, authenticated;
