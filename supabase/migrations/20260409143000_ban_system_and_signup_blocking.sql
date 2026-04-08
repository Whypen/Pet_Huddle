create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_moderation (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  moderation_state text not null default 'active' check (moderation_state in ('active','banned','suspended','review')),
  reason_internal text,
  public_message text not null default 'Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.',
  banned_at timestamptz,
  banned_by uuid,
  unbanned_at timestamptz,
  unbanned_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_moderation_state on public.user_moderation(moderation_state);

create table if not exists public.banned_identifiers (
  id uuid primary key default gen_random_uuid(),
  identifier_type text not null check (identifier_type in ('email','phone')),
  identifier_hash text not null,
  source_user_id uuid references public.profiles(id) on delete set null,
  reason_internal text,
  public_message text not null default 'Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.',
  active boolean not null default true,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_banned_identifiers_type_hash
  on public.banned_identifiers(identifier_type, identifier_hash);

create index if not exists idx_banned_identifiers_active
  on public.banned_identifiers(active, identifier_type);

create table if not exists public.abuse_signals (
  id uuid primary key default gen_random_uuid(),
  signal_type text not null check (signal_type in ('device','install')),
  signal_hash text not null,
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high')),
  review_required boolean not null default false,
  cooldown_until timestamptz,
  active boolean not null default true,
  source_user_id uuid references public.profiles(id) on delete set null,
  reason_internal text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_abuse_signals_type_hash
  on public.abuse_signals(signal_type, signal_hash);

create index if not exists idx_abuse_signals_active
  on public.abuse_signals(active, signal_type, risk_level);

alter table public.user_moderation enable row level security;
alter table public.banned_identifiers enable row level security;
alter table public.abuse_signals enable row level security;

revoke all on public.user_moderation from anon, authenticated;
revoke all on public.banned_identifiers from anon, authenticated;
revoke all on public.abuse_signals from anon, authenticated;

create or replace function public.normalize_email_for_ban(input_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(input_email, ''))), '');
$$;

create or replace function public.normalize_phone_for_ban(input_phone text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(trim(coalesce(input_phone, '')), '\\D', '', 'g'), '');
$$;

create or replace function public.hash_identifier(input_value text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(coalesce(input_value, ''), 'sha256'), 'hex');
$$;

create or replace function public.lookup_signup_blocks(
  p_email text default null::text,
  p_phone text default null::text,
  p_device_id text default null::text,
  p_install_id text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_norm text := public.normalize_email_for_ban(p_email);
  v_phone_norm text := public.normalize_phone_for_ban(p_phone);
  v_email_hash text := case when v_email_norm is null then null else public.hash_identifier(v_email_norm) end;
  v_phone_hash text := case when v_phone_norm is null then null else public.hash_identifier(v_phone_norm) end;
  v_device_hash text := case when nullif(trim(coalesce(p_device_id, '')), '') is null then null else public.hash_identifier(trim(p_device_id)) end;
  v_install_hash text := case when nullif(trim(coalesce(p_install_id, '')), '') is null then null else public.hash_identifier(trim(p_install_id)) end;
  v_block record;
  v_abuse record;
  v_message text := 'Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.';
begin
  if v_email_hash is not null then
    select identifier_type, public_message
    into v_block
    from public.banned_identifiers
    where active = true
      and identifier_type = 'email'
      and identifier_hash = v_email_hash
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'blocked', true,
        'blocked_by', 'email',
        'public_message', coalesce(v_block.public_message, v_message),
        'review_required', false,
        'cooldown_until', null
      );
    end if;
  end if;

  if v_phone_hash is not null then
    select identifier_type, public_message
    into v_block
    from public.banned_identifiers
    where active = true
      and identifier_type = 'phone'
      and identifier_hash = v_phone_hash
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'blocked', true,
        'blocked_by', 'phone',
        'public_message', coalesce(v_block.public_message, v_message),
        'review_required', false,
        'cooldown_until', null
      );
    end if;
  end if;

  select risk_level, review_required, cooldown_until
  into v_abuse
  from public.abuse_signals
  where active = true
    and (
      (signal_type = 'device' and v_device_hash is not null and signal_hash = v_device_hash)
      or
      (signal_type = 'install' and v_install_hash is not null and signal_hash = v_install_hash)
    )
  order by
    case risk_level when 'high' then 3 when 'medium' then 2 else 1 end desc,
    updated_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'blocked', false,
      'blocked_by', null,
      'public_message', null,
      'review_required', coalesce(v_abuse.review_required, false) or v_abuse.risk_level = 'high',
      'cooldown_until', v_abuse.cooldown_until
    );
  end if;

  return jsonb_build_object(
    'blocked', false,
    'blocked_by', null,
    'public_message', null,
    'review_required', false,
    'cooldown_until', null
  );
end;
$$;

create or replace function public.check_identifier_registered(
  p_email text default null::text,
  p_phone text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_exists boolean := false;
  v_phone_exists boolean := false;
  v_field text := null;
  v_email text := public.normalize_email_for_ban(p_email);
  v_phone text := public.normalize_phone_for_ban(p_phone);
  v_blocks jsonb := public.lookup_signup_blocks(p_email, p_phone, null, null);
begin
  if coalesce((v_blocks->>'blocked')::boolean, false) then
    return jsonb_build_object(
      'registered', false,
      'field', null,
      'blocked', true,
      'blocked_by', v_blocks->>'blocked_by',
      'public_message', v_blocks->>'public_message',
      'review_required', false,
      'cooldown_until', null
    );
  end if;

  if v_email is not null then
    select exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      where lower(coalesce(u.email, '')) = v_email
        and p.account_status <> 'removed'
    ) into v_email_exists;
  end if;

  if v_phone is not null then
    select exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      where regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g') = v_phone
        and p.account_status <> 'removed'
    ) into v_phone_exists;
  end if;

  if v_email_exists then
    v_field := 'email';
  elsif v_phone_exists then
    v_field := 'phone';
  end if;

  return jsonb_build_object(
    'registered', (v_email_exists or v_phone_exists),
    'field', v_field,
    'blocked', false,
    'blocked_by', null,
    'public_message', null,
    'review_required', coalesce((v_blocks->>'review_required')::boolean, false),
    'cooldown_until', v_blocks->>'cooldown_until'
  );
end;
$$;

comment on function public.check_identifier_registered(text, text)
is 'Checks if email or phone is already registered for a non-removed profile and surfaces blocklist moderation state.';

create or replace function public.admin_ban_user(
  p_user_id uuid,
  p_reason_internal text default null::text,
  p_public_message text default null::text,
  p_block_email boolean default true,
  p_block_phone boolean default true,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_email_norm text;
  v_phone_norm text;
  v_inserted integer := 0;
  v_message text := coalesce(p_public_message, 'Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.');
begin
  select id, email, phone into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'profile_not_found';
  end if;

  insert into public.user_moderation(
    user_id, moderation_state, reason_internal, public_message, banned_at, metadata, updated_at
  ) values (
    p_user_id, 'banned', p_reason_internal, v_message, now(), coalesce(p_metadata, '{}'::jsonb), now()
  )
  on conflict (user_id) do update
    set moderation_state = 'banned',
        reason_internal = excluded.reason_internal,
        public_message = excluded.public_message,
        banned_at = now(),
        metadata = excluded.metadata,
        updated_at = now();

  v_email_norm := public.normalize_email_for_ban(v_profile.email);
  if p_block_email and v_email_norm is not null then
    insert into public.banned_identifiers(identifier_type, identifier_hash, source_user_id, reason_internal, public_message, active, expires_at, metadata, updated_at)
    values ('email', public.hash_identifier(v_email_norm), p_user_id, p_reason_internal, v_message, true, null, coalesce(p_metadata, '{}'::jsonb), now())
    on conflict (identifier_type, identifier_hash) do update
      set active = true,
          expires_at = null,
          source_user_id = excluded.source_user_id,
          reason_internal = excluded.reason_internal,
          public_message = excluded.public_message,
          metadata = excluded.metadata,
          updated_at = now();
    v_inserted := v_inserted + 1;
  end if;

  v_phone_norm := public.normalize_phone_for_ban(v_profile.phone);
  if p_block_phone and v_phone_norm is not null then
    insert into public.banned_identifiers(identifier_type, identifier_hash, source_user_id, reason_internal, public_message, active, expires_at, metadata, updated_at)
    values ('phone', public.hash_identifier(v_phone_norm), p_user_id, p_reason_internal, v_message, true, null, coalesce(p_metadata, '{}'::jsonb), now())
    on conflict (identifier_type, identifier_hash) do update
      set active = true,
          expires_at = null,
          source_user_id = excluded.source_user_id,
          reason_internal = excluded.reason_internal,
          public_message = excluded.public_message,
          metadata = excluded.metadata,
          updated_at = now();
    v_inserted := v_inserted + 1;
  end if;

  update public.profiles
    set account_status = 'removed',
        updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'blocked_identifiers_upserted', v_inserted,
    'public_message', v_message
  );
end;
$$;

create or replace function public.admin_unban_user(
  p_user_id uuid,
  p_clear_identifiers boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleared integer := 0;
begin
  update public.user_moderation
    set moderation_state = 'active',
        unbanned_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
        updated_at = now()
  where user_id = p_user_id;

  update public.profiles
    set account_status = 'active',
        updated_at = now()
  where id = p_user_id;

  if p_clear_identifiers then
    update public.banned_identifiers
      set active = false,
          updated_at = now()
    where source_user_id = p_user_id
      and active = true;
    get diagnostics v_cleared = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'identifiers_cleared', v_cleared
  );
end;
$$;

revoke all on function public.lookup_signup_blocks(text, text, text, text) from public;
revoke all on function public.admin_ban_user(uuid, text, text, boolean, boolean, jsonb) from public;
revoke all on function public.admin_unban_user(uuid, boolean, jsonb) from public;

grant execute on function public.check_identifier_registered(text, text) to anon, authenticated, service_role;
grant execute on function public.lookup_signup_blocks(text, text, text, text) to service_role;
grant execute on function public.admin_ban_user(uuid, text, text, boolean, boolean, jsonb) to service_role;
grant execute on function public.admin_unban_user(uuid, boolean, jsonb) to service_role;
