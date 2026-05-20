create or replace function public.get_native_family_account_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_owner_id uuid;
  v_viewer_role text := 'none';
  v_pending_viewer public.family_members%rowtype;
  v_accepted_viewer public.family_members%rowtype;
  v_quota_limit integer := 1;
  v_quota_used integer := 1;
  v_pending_invites jsonb := '[]'::jsonb;
  v_pending_invite jsonb := null;
  v_accepted_members jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('code', 'not_allowed', 'viewer_role', 'none');
  end if;

  v_profile := public._native_family_profile_json(v_uid);
  if v_profile is null then
    return jsonb_build_object('code', 'not_found', 'viewer_role', 'none');
  end if;

  select *
  into v_accepted_viewer
  from public.family_members fm
  where fm.invitee_user_id = v_uid
    and fm.status = 'accepted'
  order by fm.created_at asc
  limit 1;

  select *
  into v_pending_viewer
  from public.family_members fm
  where fm.invitee_user_id = v_uid
    and fm.status = 'pending'
  order by fm.created_at desc
  limit 1;

  if v_accepted_viewer.id is not null then
    v_owner_id := v_accepted_viewer.inviter_user_id;
    v_viewer_role := 'member';
  elsif v_pending_viewer.id is not null then
    v_owner_id := v_pending_viewer.inviter_user_id;
    v_viewer_role := 'invitee';
  else
    v_owner_id := v_uid;
    v_viewer_role := 'owner';
  end if;

  v_quota_limit := public._native_family_slot_limit(v_owner_id);
  v_quota_used := public._native_family_used_slots(v_owner_id);

  if v_viewer_role in ('owner', 'member') then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'family_member_id', fm.id,
        'status', fm.status,
        'created_at', fm.created_at,
        'profile', public._native_family_profile_json(fm.invitee_user_id)
      )
      order by fm.created_at asc
    ), '[]'::jsonb)
    into v_accepted_members
    from public.family_members fm
    where fm.inviter_user_id = v_owner_id
      and fm.status = 'accepted';
  end if;

  if v_viewer_role = 'owner' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'family_member_id', fm.id,
        'status', fm.status,
        'created_at', fm.created_at,
        'profile', public._native_family_profile_json(fm.invitee_user_id)
      )
      order by fm.created_at asc
    ), '[]'::jsonb)
    into v_pending_invites
    from public.family_members fm
    where fm.inviter_user_id = v_owner_id
      and fm.status = 'pending';
  end if;

  if v_pending_viewer.id is not null then
    v_pending_invite := jsonb_build_object(
      'family_member_id', v_pending_viewer.id,
      'status', v_pending_viewer.status,
      'created_at', v_pending_viewer.created_at,
      'owner_profile', public._native_family_profile_json(v_pending_viewer.inviter_user_id)
    );
  end if;

  return jsonb_build_object(
    'code', 'ok',
    'viewer_role', v_viewer_role,
    'owner_id', v_owner_id,
    'owner_profile', public._native_family_profile_json(v_owner_id),
    'accepted_members', v_accepted_members,
    'pending_invites', v_pending_invites,
    'pending_invite', v_pending_invite,
    'quota_used', v_quota_used,
    'quota_limit', v_quota_limit,
    'can_invite', v_viewer_role = 'owner' and v_quota_limit > 1 and v_quota_used < v_quota_limit,
    'can_cancel', v_viewer_role = 'owner',
    'can_remove', v_viewer_role = 'owner',
    'can_accept', v_viewer_role = 'invitee',
    'can_decline', v_viewer_role = 'invitee',
    'can_leave', v_viewer_role = 'member'
  );
end;
$$;

revoke all on function public.get_native_family_account_state() from public, anon;
grant execute on function public.get_native_family_account_state() to authenticated, service_role;
