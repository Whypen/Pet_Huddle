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
    set account_status = 'suspended',
        suspension_expires_at = null,
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
        suspension_expires_at = null,
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

create or replace function public.admin_upsert_abuse_signal(
  p_signal_type text,
  p_signal_value text,
  p_risk_level text default 'medium',
  p_review_required boolean default true,
  p_cooldown_until timestamptz default null,
  p_reason_internal text default null,
  p_source_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signal_type text := lower(trim(coalesce(p_signal_type, '')));
  v_signal_value text := trim(coalesce(p_signal_value, ''));
  v_risk_level text := lower(trim(coalesce(p_risk_level, 'medium')));
begin
  if v_signal_type not in ('device', 'install') then
    raise exception 'invalid_signal_type';
  end if;
  if v_risk_level not in ('low', 'medium', 'high') then
    raise exception 'invalid_risk_level';
  end if;
  if v_signal_value = '' then
    raise exception 'signal_value_required';
  end if;

  insert into public.abuse_signals(
    signal_type,
    signal_hash,
    risk_level,
    review_required,
    cooldown_until,
    active,
    source_user_id,
    reason_internal,
    metadata,
    updated_at
  ) values (
    v_signal_type,
    public.hash_identifier(v_signal_value),
    v_risk_level,
    p_review_required,
    p_cooldown_until,
    true,
    p_source_user_id,
    p_reason_internal,
    coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  on conflict (signal_type, signal_hash) do update
    set risk_level = excluded.risk_level,
        review_required = excluded.review_required,
        cooldown_until = excluded.cooldown_until,
        active = true,
        source_user_id = excluded.source_user_id,
        reason_internal = excluded.reason_internal,
        metadata = excluded.metadata,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_upsert_abuse_signal(text, text, text, boolean, timestamptz, text, uuid, jsonb) from public;
grant execute on function public.admin_upsert_abuse_signal(text, text, text, boolean, timestamptz, text, uuid, jsonb) to service_role;
