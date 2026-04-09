-- Canonicalize account-deletion purge and duplicate gates for reusable deleted (non-banned) accounts.

create or replace function public.delete_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_banned boolean := false;
begin
  -- Preserve blocklist entries only for banned users.
  select exists (
    select 1
    from public.user_moderation um
    where um.user_id = p_user_id
      and um.moderation_state = 'banned'
      and (um.unbanned_at is null)
  ) into v_is_banned;

  -- Handle NO ACTION FK blockers.
  delete from public.chat_messages where sender_id = p_user_id;
  update public.verification_uploads set reviewed_by = null where reviewed_by = p_user_id;

  -- For non-banned deletions, remove moderation residue that would block credential reuse.
  if not v_is_banned then
    delete from public.banned_identifiers where source_user_id = p_user_id;
    delete from public.user_moderation where user_id = p_user_id;
  end if;

  -- Delete profile first (cascades through profile FK graph), then auth user.
  delete from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;
end;
$$;

comment on function public.delete_user_account(uuid)
is 'Deletes account data and auth user; preserves blocklist retention only for banned users.';

create or replace function public.is_social_id_taken(p_social_id text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  with normalized as (
    select nullif(lower(trim(coalesce(p_social_id, ''))), '') as social
  )
  select exists (
    select 1
    from normalized n
    join public.profiles p
      on n.social is not null
     and lower(trim(coalesce(p.social_id, ''))) = n.social
    join auth.users u on u.id = p.id
    where p.account_status <> 'removed'
      and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );
$$;

comment on function public.is_social_id_taken(text)
is 'Checks social_id availability against live non-removed profiles linked to auth.users.';

create or replace function public.check_identifier_registered(
  p_email text default null::text,
  p_phone text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(trim(coalesce(p_phone, '')), '\\D', '', 'g'), '');
  v_email_exists boolean := false;
  v_phone_exists boolean := false;
  v_field text := null;
  v_has_block_lookup boolean := false;
  v_blocks jsonb := jsonb_build_object(
    'blocked', false,
    'blocked_by', null,
    'public_message', null,
    'review_required', false,
    'cooldown_until', null
  );
begin
  select to_regprocedure('public.lookup_signup_blocks(text,text,text,text)') is not null
    into v_has_block_lookup;

  if v_has_block_lookup then
    select public.lookup_signup_blocks(v_email, v_phone, null, null) into v_blocks;
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
is 'Checks if email/phone is registered for live non-removed accounts and returns block/review signals when lookup_signup_blocks is available.';

-- One-time cleanup: remove stale block hashes for removed non-banned users.
with removed_non_banned as (
  select
    p.id,
    nullif(lower(trim(coalesce(p.email, ''))), '') as email_norm,
    nullif(regexp_replace(trim(coalesce(p.phone, '')), '\\D', '', 'g'), '') as phone_norm
  from public.profiles p
  where p.account_status = 'removed'
    and not exists (
      select 1
      from public.user_moderation um
      where um.user_id = p.id
        and um.moderation_state = 'banned'
        and um.unbanned_at is null
    )
)
delete from public.banned_identifiers bi
using removed_non_banned r
where bi.active = true
  and (
    (bi.identifier_type = 'email' and r.email_norm is not null and bi.identifier_hash = public.hash_identifier(r.email_norm))
    or
    (bi.identifier_type = 'phone' and r.phone_norm is not null and bi.identifier_hash = public.hash_identifier(r.phone_norm))
  );

-- One-time cleanup: delete orphan removed profiles not tied to auth users and not banned.
delete from public.profiles p
where p.account_status = 'removed'
  and not exists (select 1 from auth.users u where u.id = p.id)
  and not exists (
    select 1
    from public.user_moderation um
    where um.user_id = p.id
      and um.moderation_state = 'banned'
      and um.unbanned_at is null
  );
