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
  v_email text;
  v_phone text;
  v_email_norm text;
  v_phone_norm text;
  v_inserted integer := 0;
  v_message text := coalesce(p_public_message, 'Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.');
begin
  select p.email, p.phone into v_email, v_phone
  from public.profiles p
  where p.id = p_user_id;

  if v_email is null and v_phone is null then
    select u.email, u.phone into v_email, v_phone
    from auth.users u
    where u.id = p_user_id;
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

  v_email_norm := public.normalize_email_for_ban(v_email);
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

  v_phone_norm := public.normalize_phone_for_ban(v_phone);
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
    'public_message', v_message,
    'email_found', v_email is not null,
    'phone_found', v_phone is not null
  );
end;
$$;

grant execute on function public.admin_ban_user(uuid, text, text, boolean, boolean, jsonb) to service_role;
