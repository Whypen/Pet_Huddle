alter table public.identity_card_verifications
  add column if not exists card_fingerprint text;

alter table public.profiles
  add column if not exists verification_rejection_code text;

comment on column public.profiles.verification_rejection_code
is 'Private backend-only rejection marker for identity verification gates. Not exposed on public profile surfaces.';

create or replace function public.normalize_legal_name_for_identity(input_value text)
returns text
language sql
immutable
as $$
  select nullif(
    lower(
      regexp_replace(
        btrim(coalesce(input_value, '')),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

comment on function public.normalize_legal_name_for_identity(text)
is 'Canonical legal-name normalization for private identity verification matching: trim, collapse internal whitespace, lowercase.';

create table if not exists public.blocked_identity_verifications (
  id uuid primary key default gen_random_uuid(),
  source_user_id uuid not null references auth.users(id) on delete cascade,
  legal_name_hash text not null,
  card_fingerprint_hash text not null,
  card_last4 text not null check (card_last4 ~ '^[0-9]{4}$'),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_blocked_identity_verifications_source_tuple
  on public.blocked_identity_verifications(source_user_id, legal_name_hash, card_fingerprint_hash, card_last4);

create index if not exists idx_blocked_identity_verifications_match
  on public.blocked_identity_verifications(active, legal_name_hash, card_fingerprint_hash, card_last4);

alter table public.blocked_identity_verifications enable row level security;
revoke all on public.blocked_identity_verifications from anon, authenticated;

create or replace function public.sync_blocked_identity_verifications_for_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moderation_state text;
  v_legal_name_norm text;
  v_card_last4 text;
  v_card_fingerprint text;
  v_metadata jsonb := '{}'::jsonb;
  v_rows integer := 0;
begin
  if p_user_id is null then
    raise exception 'missing_user_id';
  end if;

  select moderation_state, coalesce(metadata, '{}'::jsonb)
  into v_moderation_state, v_metadata
  from public.user_moderation
  where user_id = p_user_id;

  if coalesce(v_moderation_state, 'active') <> 'banned' then
    update public.blocked_identity_verifications
    set active = false,
        updated_at = now()
    where source_user_id = p_user_id
      and active = true;
    return 0;
  end if;

  select
    public.normalize_legal_name_for_identity(p.legal_name),
    nullif(trim(coalesce(icv.card_last4, '')), ''),
    nullif(trim(coalesce(icv.card_fingerprint, '')), '')
  into
    v_legal_name_norm,
    v_card_last4,
    v_card_fingerprint
  from public.profiles p
  left join public.identity_card_verifications icv
    on icv.user_id = p.id
  where p.id = p_user_id;

  if v_legal_name_norm is null or v_card_last4 is null or v_card_fingerprint is null then
    update public.blocked_identity_verifications
    set active = false,
        updated_at = now()
    where source_user_id = p_user_id
      and active = true;
    return 0;
  end if;

  insert into public.blocked_identity_verifications (
    source_user_id,
    legal_name_hash,
    card_fingerprint_hash,
    card_last4,
    active,
    metadata,
    updated_at
  )
  values (
    p_user_id,
    public.hash_identifier(v_legal_name_norm),
    public.hash_identifier(v_card_fingerprint),
    v_card_last4,
    true,
    jsonb_build_object(
      'source', 'user_moderation',
      'moderation_metadata', v_metadata
    ),
    now()
  )
  on conflict (source_user_id, legal_name_hash, card_fingerprint_hash, card_last4) do update
    set active = true,
        metadata = excluded.metadata,
        updated_at = now();

  get diagnostics v_rows = row_count;
  return coalesce(v_rows, 0);
end;
$$;

revoke all on function public.sync_blocked_identity_verifications_for_user(uuid) from public;
grant execute on function public.sync_blocked_identity_verifications_for_user(uuid) to service_role;

create or replace function public.handle_blocked_identity_verifications_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_blocked_identity_verifications_for_user(new.user_id);
  return new;
end;
$$;

drop trigger if exists trg_sync_blocked_identity_verifications on public.user_moderation;

create trigger trg_sync_blocked_identity_verifications
after insert or update of moderation_state, metadata on public.user_moderation
for each row
execute function public.handle_blocked_identity_verifications_sync();

do $$
declare
  v_row record;
begin
  for v_row in
    select user_id
    from public.user_moderation
    where moderation_state = 'banned'
  loop
    perform public.sync_blocked_identity_verifications_for_user(v_row.user_id);
  end loop;
end;
$$;

create or replace function public.check_blocked_identity_verification(
  p_legal_name text,
  p_card_last4 text,
  p_card_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_legal_name_norm text := public.normalize_legal_name_for_identity(p_legal_name);
  v_card_last4_norm text := nullif(trim(coalesce(p_card_last4, '')), '');
  v_card_fingerprint_norm text := nullif(trim(coalesce(p_card_fingerprint, '')), '');
  v_match public.blocked_identity_verifications%rowtype;
begin
  if v_legal_name_norm is null or v_card_last4_norm is null or v_card_fingerprint_norm is null then
    return jsonb_build_object(
      'blocked', false,
      'match_count', 0
    );
  end if;

  select *
  into v_match
  from public.blocked_identity_verifications
  where active = true
    and legal_name_hash = public.hash_identifier(v_legal_name_norm)
    and card_fingerprint_hash = public.hash_identifier(v_card_fingerprint_norm)
    and card_last4 = v_card_last4_norm
  limit 1;

  return jsonb_build_object(
    'blocked', found,
    'match_count', case when found then 1 else 0 end,
    'blocked_identity_id', case when found then v_match.id else null end,
    'source_user_id', case when found then v_match.source_user_id else null end
  );
end;
$$;

comment on function public.check_blocked_identity_verification(text, text, text)
is 'Private backend identity check using normalized legal name + card fingerprint + card last4 against banned identity tuples.';

revoke all on function public.check_blocked_identity_verification(text, text, text) from public;
grant execute on function public.check_blocked_identity_verification(text, text, text) to service_role;

create or replace function public.refresh_identity_verification_status(p_user_id uuid)
returns public.verification_status_enum
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_phone_complete boolean := false;
  v_device_complete boolean := false;
  v_human_status text := 'not_started';
  v_card_status text := 'not_started';
  v_final public.verification_status_enum := 'unverified';
begin
  if p_user_id is null then
    raise exception 'missing_user_id';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  v_human_status := coalesce(v_profile.human_verification_status, 'not_started');
  v_card_status := coalesce(v_profile.card_verification_status, 'not_started');

  select exists(
    select 1
    from public.device_fingerprint_history d
    where d.user_id = p_user_id
  )
  into v_device_complete;

  select (
    coalesce(nullif(btrim(v_profile.phone), ''), '') <> ''
    or exists (
      select 1
      from auth.users au
      where au.id = p_user_id
        and au.phone_confirmed_at is not null
    )
  )
  into v_phone_complete;

  if v_profile.verification_rejection_code = 'blocked_identity' then
    v_final := 'unverified';
  elsif v_device_complete
     and v_phone_complete
     and v_human_status = 'passed'
     and v_card_status = 'passed' then
    v_final := 'verified';
  elsif v_human_status <> 'not_started'
     or v_card_status <> 'not_started' then
    v_final := 'pending';
  else
    v_final := 'unverified';
  end if;

  update public.profiles
  set verification_status = v_final,
      is_verified = (v_final = 'verified')
  where id = p_user_id;

  return v_final;
end;
$$;

grant execute on function public.refresh_identity_verification_status(uuid) to authenticated, service_role;
