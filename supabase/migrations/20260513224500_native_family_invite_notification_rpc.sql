create or replace function public.send_native_family_invite_notification(
  p_family_member_id uuid,
  p_invitee_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inviter_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_family_member_id is null or p_invitee_user_id is null then
    raise exception 'missing_family_invite';
  end if;

  if not exists (
    select 1
    from public.family_members fm
    where fm.id = p_family_member_id
      and fm.inviter_user_id = v_uid
      and fm.invitee_user_id = p_invitee_user_id
      and fm.status in ('pending', 'accepted')
  ) then
    raise exception 'family_invite_not_allowed';
  end if;

  select nullif(trim(p.display_name), '')
  into v_inviter_name
  from public.profiles p
  where p.id = v_uid
  limit 1;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    message,
    metadata,
    data,
    read,
    is_read
  )
  values (
    p_invitee_user_id,
    'family_invite',
    'Family Invite',
    coalesce(v_inviter_name, 'A Huddle member') || ' has invited you to join their family!',
    coalesce(v_inviter_name, 'A Huddle member') || ' has invited you to join their family!',
    jsonb_build_object('inviter_id', v_uid, 'family_member_id', p_family_member_id),
    jsonb_build_object('kind', 'family_invite', 'href', '/settings'),
    false,
    false
  );

  return true;
end;
$$;

revoke all on function public.send_native_family_invite_notification(uuid, uuid) from public, anon;
grant execute on function public.send_native_family_invite_notification(uuid, uuid) to authenticated, service_role;
