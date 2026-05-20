alter table public.family_members
  drop constraint if exists family_members_status_check;

alter table public.family_members
  add constraint family_members_status_check
  check (status in ('pending', 'accepted', 'declined'));

alter table public.family_members
  add column if not exists ended_reason text,
  add column if not exists ended_by uuid references public.profiles(id) on delete set null,
  add column if not exists ended_at timestamptz;

alter table public.family_members
  drop constraint if exists family_members_ended_reason_check;

alter table public.family_members
  add constraint family_members_ended_reason_check
  check (ended_reason is null or ended_reason in ('declined', 'cancelled', 'removed', 'left'));

create index if not exists idx_family_members_inviter_status
  on public.family_members(inviter_user_id, status, created_at desc);

create index if not exists idx_family_members_invitee_status
  on public.family_members(invitee_user_id, status, created_at desc);

create or replace function public._native_family_profile_json(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'social_id', p.social_id,
    'tier', p.tier,
    'effective_tier', coalesce(nullif(row_to_json(p)::jsonb ->> 'effective_tier', ''), p.tier),
    'family_slots', coalesce(p.family_slots, 0)
  )
  from public.profiles p
  where p.id = p_user_id
  limit 1;
$$;

create or replace function public._native_family_slot_limit(p_owner_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tier text := lower(coalesce(public._qms_effective_tier(p_owner_id), 'free'));
  v_family_slots integer := 0;
  v_base integer := 1;
begin
  select coalesce(p.family_slots, 0)
  into v_family_slots
  from public.profiles p
  where p.id = p_owner_id;

  if v_tier in ('plus', 'premium', 'gold') then
    v_base := 2;
  end if;

  return least(4, greatest(1, v_base + greatest(0, coalesce(v_family_slots, 0))));
end;
$$;

create or replace function public._native_family_used_slots(p_owner_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select 1 + count(*)::integer
  from public.family_members fm
  where fm.inviter_user_id = p_owner_id
    and fm.status in ('pending', 'accepted');
$$;

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

create or replace function public.search_native_family_invite_candidates(
  p_query text,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_limit integer := least(20, greatest(1, coalesce(p_limit, 10)));
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  if v_query is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(public._native_family_profile_json(candidate.id) order by candidate.rank_label)
    from (
      select p.id, coalesce(p.display_name, p.social_id, p.id::text) as rank_label
      from public.profiles p
      where p.id <> v_uid
        and (
          p.display_name ilike '%' || v_query || '%'
          or p.social_id ilike '%' || replace(v_query, '@', '') || '%'
        )
        and not public.is_user_blocked(v_uid, p.id)
        and not exists (
          select 1
          from public.family_members fm
          where fm.status in ('pending', 'accepted')
            and (fm.inviter_user_id = p.id or fm.invitee_user_id = p.id)
        )
      order by coalesce(p.display_name, p.social_id, p.id::text)
      limit v_limit
    ) candidate
  ), '[]'::jsonb);
end;
$$;

create or replace function public.create_native_family_invite(p_invitee_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target_exists boolean := false;
  v_quota_limit integer;
  v_quota_used integer;
  v_family_member_id uuid;
  v_inviter_name text;
begin
  if v_uid is null then
    return jsonb_build_object('code', 'not_allowed');
  end if;
  if p_invitee_user_id is null then
    return jsonb_build_object('code', 'not_found');
  end if;
  if p_invitee_user_id = v_uid then
    return jsonb_build_object('code', 'not_allowed');
  end if;

  select exists(select 1 from public.profiles p where p.id = p_invitee_user_id)
  into v_target_exists;
  if not v_target_exists then
    return jsonb_build_object('code', 'not_found');
  end if;

  if public.is_user_blocked(v_uid, p_invitee_user_id) then
    return jsonb_build_object('code', 'blocked');
  end if;

  if exists (
    select 1 from public.family_members fm
    where fm.status in ('pending', 'accepted')
      and fm.invitee_user_id = v_uid
  ) then
    return jsonb_build_object('code', 'not_allowed');
  end if;

  if exists (
    select 1 from public.family_members fm
    where fm.inviter_user_id = v_uid
      and fm.invitee_user_id = p_invitee_user_id
      and fm.status = 'accepted'
  ) then
    return jsonb_build_object('code', 'already_family');
  end if;

  if exists (
    select 1 from public.family_members fm
    where fm.inviter_user_id = v_uid
      and fm.invitee_user_id = p_invitee_user_id
      and fm.status = 'pending'
  ) then
    return jsonb_build_object('code', 'invite_already_pending');
  end if;

  if exists (
    select 1 from public.family_members fm
    where fm.status in ('pending', 'accepted')
      and (fm.inviter_user_id = p_invitee_user_id or fm.invitee_user_id = p_invitee_user_id)
  ) then
    return jsonb_build_object('code', 'already_in_other_family');
  end if;

  v_quota_limit := public._native_family_slot_limit(v_uid);
  v_quota_used := public._native_family_used_slots(v_uid);
  if v_quota_limit <= 1 then
    return jsonb_build_object('code', 'upgrade_required', 'quota_used', v_quota_used, 'quota_limit', v_quota_limit);
  end if;
  if v_quota_used >= v_quota_limit then
    return jsonb_build_object('code', 'quota_full', 'quota_used', v_quota_used, 'quota_limit', v_quota_limit);
  end if;

  insert into public.family_members(inviter_user_id, invitee_user_id, status)
  values (v_uid, p_invitee_user_id, 'pending')
  returning id into v_family_member_id;

  select nullif(trim(p.display_name), '')
  into v_inviter_name
  from public.profiles p
  where p.id = v_uid
  limit 1;

  insert into public.notifications(user_id, type, title, body, message, metadata, data, read, is_read)
  select
    p_invitee_user_id,
    'family_invite',
    'Family Invite',
    'You''re invited to join a Family Account and share its membership perks.',
    'You''re invited to join a Family Account and share its membership perks.',
    jsonb_build_object(
      'kind', 'family_invite',
      'inviter_id', v_uid,
      'inviter_name', coalesce(v_inviter_name, 'A Huddle member'),
      'family_member_id', v_family_member_id,
      'href', '/settings?family=1',
      'deepLink', '/settings?family=1'
    ),
    jsonb_build_object('kind', 'family_invite', 'href', '/settings?family=1', 'deepLink', '/settings?family=1'),
    false,
    false
  where not exists (
    select 1
    from public.notifications n
    where n.user_id = p_invitee_user_id
      and n.type = 'family_invite'
      and (
        n.metadata ->> 'family_member_id' = v_family_member_id::text
        or (
          n.metadata ->> 'inviter_id' = v_uid::text
          and coalesce(n.metadata ->> 'kind', '') = 'family_invite'
        )
      )
  );

  return jsonb_build_object(
    'code', 'invited',
    'family_member_id', v_family_member_id,
    'quota_used', public._native_family_used_slots(v_uid),
    'quota_limit', v_quota_limit
  );
end;
$$;

create or replace function public.accept_native_family_invite(p_family_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_uid is null then return jsonb_build_object('code', 'not_allowed'); end if;
  update public.family_members
  set status = 'accepted'
  where id = p_family_member_id
    and invitee_user_id = v_uid
    and status = 'pending';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return jsonb_build_object('code', 'invalid_state'); end if;
  return jsonb_build_object('code', 'accepted');
end;
$$;

create or replace function public.decline_native_family_invite(p_family_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_uid is null then return jsonb_build_object('code', 'not_allowed'); end if;
  update public.family_members
  set status = 'declined',
      ended_reason = 'declined',
      ended_by = v_uid,
      ended_at = now()
  where id = p_family_member_id
    and invitee_user_id = v_uid
    and status = 'pending';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return jsonb_build_object('code', 'invalid_state'); end if;
  return jsonb_build_object('code', 'declined');
end;
$$;

create or replace function public.cancel_native_family_invite(p_family_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_uid is null then return jsonb_build_object('code', 'not_allowed'); end if;
  update public.family_members
  set status = 'declined',
      ended_reason = 'cancelled',
      ended_by = v_uid,
      ended_at = now()
  where id = p_family_member_id
    and inviter_user_id = v_uid
    and status = 'pending';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return jsonb_build_object('code', 'invalid_state'); end if;
  return jsonb_build_object('code', 'cancelled');
end;
$$;

create or replace function public.remove_native_family_member(p_family_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_uid is null then return jsonb_build_object('code', 'not_allowed'); end if;
  update public.family_members
  set status = 'declined',
      ended_reason = 'removed',
      ended_by = v_uid,
      ended_at = now()
  where id = p_family_member_id
    and inviter_user_id = v_uid
    and invitee_user_id <> v_uid
    and status = 'accepted';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return jsonb_build_object('code', 'invalid_state'); end if;
  return jsonb_build_object('code', 'removed');
end;
$$;

create or replace function public.leave_native_family()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_uid is null then return jsonb_build_object('code', 'not_allowed'); end if;
  update public.family_members
  set status = 'declined',
      ended_reason = 'left',
      ended_by = v_uid,
      ended_at = now()
  where invitee_user_id = v_uid
    and status = 'accepted';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return jsonb_build_object('code', 'invalid_state'); end if;
  return jsonb_build_object('code', 'left');
end;
$$;

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
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.family_members fm
    where fm.id = p_family_member_id
      and fm.inviter_user_id = v_uid
      and fm.invitee_user_id = p_invitee_user_id
      and fm.status = 'pending'
  ) then
    raise exception 'family_invite_not_allowed';
  end if;

  return true;
end;
$$;

revoke all on function public._native_family_profile_json(uuid) from public, anon;
revoke all on function public._native_family_slot_limit(uuid) from public, anon;
revoke all on function public._native_family_used_slots(uuid) from public, anon;
revoke all on function public.get_native_family_account_state() from public, anon;
revoke all on function public.search_native_family_invite_candidates(text, integer) from public, anon;
revoke all on function public.create_native_family_invite(uuid) from public, anon;
revoke all on function public.accept_native_family_invite(uuid) from public, anon;
revoke all on function public.decline_native_family_invite(uuid) from public, anon;
revoke all on function public.cancel_native_family_invite(uuid) from public, anon;
revoke all on function public.remove_native_family_member(uuid) from public, anon;
revoke all on function public.leave_native_family() from public, anon;
revoke all on function public.send_native_family_invite_notification(uuid, uuid) from public, anon;

grant execute on function public._native_family_profile_json(uuid) to authenticated, service_role;
grant execute on function public._native_family_slot_limit(uuid) to authenticated, service_role;
grant execute on function public._native_family_used_slots(uuid) to authenticated, service_role;
grant execute on function public.get_native_family_account_state() to authenticated, service_role;
grant execute on function public.search_native_family_invite_candidates(text, integer) to authenticated, service_role;
grant execute on function public.create_native_family_invite(uuid) to authenticated, service_role;
grant execute on function public.accept_native_family_invite(uuid) to authenticated, service_role;
grant execute on function public.decline_native_family_invite(uuid) to authenticated, service_role;
grant execute on function public.cancel_native_family_invite(uuid) to authenticated, service_role;
grant execute on function public.remove_native_family_member(uuid) to authenticated, service_role;
grant execute on function public.leave_native_family() to authenticated, service_role;
grant execute on function public.send_native_family_invite_notification(uuid, uuid) to authenticated, service_role;
