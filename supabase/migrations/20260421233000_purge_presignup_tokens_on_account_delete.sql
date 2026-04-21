-- Purge reusable presignup verification artifacts when an account is deleted.
-- Otherwise a deleted user's email can still resolve as "pre-verified" during
-- signup because get-pre-signup-verify-status trusts public.presignup_tokens.

create or replace function public.delete_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_banned boolean := false;
  v_profile_email text := null;
begin
  -- Preserve blocklist entries only for banned users.
  select exists (
    select 1
    from public.user_moderation um
    where um.user_id = p_user_id
      and um.moderation_state = 'banned'
      and (um.unbanned_at is null)
  ) into v_is_banned;

  select nullif(lower(trim(coalesce(p.email, ''))), '')
    into v_profile_email
  from public.profiles p
  where p.id = p_user_id;

  -- Handle NO ACTION FK blockers.
  delete from public.chat_messages where sender_id = p_user_id;
  update public.verification_uploads set reviewed_by = null where reviewed_by = p_user_id;

  -- For non-banned deletions, remove moderation residue that would block credential reuse.
  if not v_is_banned then
    delete from public.banned_identifiers where source_user_id = p_user_id;
    delete from public.user_moderation where user_id = p_user_id;
  end if;

  -- Account deletion must also purge presignup verification artifacts for the
  -- same email. Otherwise SignupCredentials can fetch a still-verified
  -- signup_proof by email alone and bypass the verify-email step.
  if v_profile_email is not null then
    delete from public.presignup_tokens
    where lower(trim(coalesce(email, ''))) = v_profile_email;
  end if;

  -- Delete profile first (cascades through profile FK graph), then auth user.
  delete from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;
end;
$$;

comment on function public.delete_user_account(uuid)
is 'Deletes account data, auth user, and reusable presignup verification artifacts; preserves blocklist retention only for banned users.';
