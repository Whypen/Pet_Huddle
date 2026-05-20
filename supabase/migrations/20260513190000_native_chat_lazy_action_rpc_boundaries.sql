create or replace function public.send_native_chat_message(
  p_chat_id uuid,
  p_content text
)
returns table (
  id uuid,
  chat_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz
)
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
    from public.chat_room_members crm
    where crm.chat_id = p_chat_id
      and crm.user_id = v_uid
      and coalesce(crm.left_at, crm.deleted_at) is null
  ) then
    raise exception 'chat_membership_required';
  end if;

  return query
  insert into public.chat_messages (chat_id, sender_id, content)
  values (p_chat_id, v_uid, coalesce(p_content, ''))
  returning chat_messages.id, chat_messages.chat_id, chat_messages.sender_id, chat_messages.content, chat_messages.created_at;
end;
$$;

revoke all on function public.send_native_chat_message(uuid, text) from public, anon;
grant execute on function public.send_native_chat_message(uuid, text) to authenticated, service_role;

create or replace function public.get_native_chat_read_receipts(p_message_ids uuid[])
returns table (message_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  scoped_messages as (
    select cm.id, cm.chat_id
    from public.chat_messages cm
    join viewer v on v.user_id is not null
    where cm.id = any(coalesce(p_message_ids, array[]::uuid[]))
      and exists (
        select 1
        from public.chat_room_members crm
        where crm.chat_id = cm.chat_id
          and crm.user_id = v.user_id
      )
  )
  select distinct mr.message_id
  from public.message_reads mr
  join scoped_messages sm on sm.id = mr.message_id
  join viewer v on true
  where mr.user_id <> v.user_id;
$$;

revoke all on function public.get_native_chat_read_receipts(uuid[]) from public, anon;
grant execute on function public.get_native_chat_read_receipts(uuid[]) to authenticated, service_role;

create or replace function public.get_native_group_invite_chat_id(p_invite_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('chat_id', gci.chat_id)
  from public.group_chat_invites gci
  where gci.id = p_invite_id
    and (
      gci.invitee_user_id = auth.uid()
      or exists (
        select 1
        from public.chat_room_members crm
        where crm.chat_id = gci.chat_id
          and crm.user_id = auth.uid()
      )
    )
  limit 1;
$$;

revoke all on function public.get_native_group_invite_chat_id(uuid) from public, anon;
grant execute on function public.get_native_group_invite_chat_id(uuid) to authenticated, service_role;

create or replace function public.decline_native_group_invite(
  p_invite_id uuid default null,
  p_chat_id uuid default null
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

  update public.group_chat_invites gci
  set status = 'declined', responded_at = now()
  where gci.invitee_user_id = v_uid
    and gci.status = 'pending'
    and (p_invite_id is null or gci.id = p_invite_id)
    and (p_chat_id is null or gci.chat_id = p_chat_id);

  return true;
end;
$$;

revoke all on function public.decline_native_group_invite(uuid, uuid) from public, anon;
grant execute on function public.decline_native_group_invite(uuid, uuid) to authenticated, service_role;

create or replace function public.request_native_group_join(p_chat_id uuid)
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
    select 1 from public.chats c
    where c.id = p_chat_id and c.type = 'group'
  ) then
    raise exception 'group_room_required';
  end if;

  insert into public.group_join_requests (chat_id, user_id, status)
  values (p_chat_id, v_uid, 'pending')
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.request_native_group_join(uuid) from public, anon;
grant execute on function public.request_native_group_join(uuid) to authenticated, service_role;

create or replace function public.invite_native_group_members(
  p_chat_id uuid,
  p_chat_name text,
  p_invitee_user_ids uuid[]
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

  if not public.is_native_group_admin(p_chat_id, v_uid) then
    raise exception 'group_admin_required';
  end if;

  insert into public.group_chat_invites (chat_id, chat_name, inviter_user_id, invitee_user_id, status)
  select p_chat_id, coalesce(nullif(btrim(p_chat_name), ''), 'Group'), v_uid, invitee_id, 'pending'
  from unnest(coalesce(p_invitee_user_ids, array[]::uuid[])) invitee_id
  where invitee_id is not null
    and invitee_id <> v_uid
  on conflict (chat_id, invitee_user_id)
  do update set
    chat_name = excluded.chat_name,
    inviter_user_id = excluded.inviter_user_id,
    status = 'pending',
    responded_at = null;

  return true;
end;
$$;

revoke all on function public.invite_native_group_members(uuid, text, uuid[]) from public, anon;
grant execute on function public.invite_native_group_members(uuid, text, uuid[]) to authenticated, service_role;

create or replace function public.cancel_native_group_invite(
  p_chat_id uuid,
  p_invite_id uuid
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

  if not public.is_native_group_admin(p_chat_id, v_uid) then
    raise exception 'group_admin_required';
  end if;

  update public.group_chat_invites
  set status = 'declined', responded_at = now()
  where id = p_invite_id
    and chat_id = p_chat_id
    and status = 'pending';

  return true;
end;
$$;

revoke all on function public.cancel_native_group_invite(uuid, uuid) from public, anon;
grant execute on function public.cancel_native_group_invite(uuid, uuid) to authenticated, service_role;

create or replace function public.create_native_group_chat(
  p_name text,
  p_description text default null,
  p_join_method text default 'request',
  p_visibility text default 'public',
  p_avatar_url text default null,
  p_location_label text default null,
  p_location_country text default null,
  p_pet_focus text[] default null,
  p_invite_user_ids uuid[] default array[]::uuid[]
)
returns table(id uuid, name text, room_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_chat public.chats%rowtype;
  v_room_code text;
  v_system_text text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'missing_group_name';
  end if;

  insert into public.chats (
    type, name, avatar_url, description, join_method, visibility,
    location_label, location_country, pet_focus, created_by
  )
  values (
    'group',
    btrim(p_name),
    nullif(btrim(coalesce(p_avatar_url, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    case when p_visibility = 'public' then coalesce(nullif(btrim(p_join_method), ''), 'request') else 'request' end,
    case when p_visibility in ('public', 'private') then p_visibility else 'public' end,
    nullif(btrim(coalesce(p_location_label, '')), ''),
    nullif(btrim(coalesce(p_location_country, '')), ''),
    p_pet_focus,
    v_uid
  )
  returning * into v_chat;

  insert into public.chat_room_members (chat_id, user_id, role)
  values (v_chat.id, v_uid, 'admin')
  on conflict do nothing;

  v_room_code := coalesce(v_chat.room_code, '');
  v_system_text := case
    when v_chat.visibility = 'private' then 'Room Code: ' || coalesce(nullif(v_room_code, ''), '--')
    when v_chat.join_method = 'request' then 'This is a public group. People can request to join and you approve them.'
    else 'This is a public group. Anyone can join instantly.'
  end;

  insert into public.chat_messages (chat_id, sender_id, content)
  values (v_chat.id, v_uid, jsonb_build_object('kind', 'system', 'text', v_system_text)::text);

  perform public.invite_native_group_members(v_chat.id, v_chat.name, p_invite_user_ids);

  return query select v_chat.id, v_chat.name, v_chat.room_code;
end;
$$;

revoke all on function public.create_native_group_chat(text, text, text, text, text, text, text, text[], uuid[]) from public, anon;
grant execute on function public.create_native_group_chat(text, text, text, text, text, text, text, text[], uuid[]) to authenticated, service_role;

create or replace function public.get_native_group_management_snapshot(p_chat_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  room_access as (
    select c.id
    from public.chats c
    join viewer v on v.user_id is not null
    where c.id = p_chat_id
      and c.type = 'group'
      and exists (
        select 1 from public.chat_room_members crm
        where crm.chat_id = c.id and crm.user_id = v.user_id
      )
    limit 1
  ),
  member_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', crm.user_id,
      'role', crm.role,
      'is_muted', coalesce(crm.is_muted, false),
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'is_verified', coalesce(p.is_verified, false) or p.verification_status = 'verified'
    ) order by lower(coalesce(p.display_name, ''))), '[]'::jsonb) as rows
    from public.chat_room_members crm
    join room_access ra on ra.id = crm.chat_id
    join public.profiles p on p.id = crm.user_id
  ),
  request_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', gjr.id,
      'user_id', gjr.user_id,
      'status', gjr.status,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'is_verified', coalesce(p.is_verified, false) or p.verification_status = 'verified'
    ) order by gjr.created_at), '[]'::jsonb) as rows
    from public.group_join_requests gjr
    join room_access ra on ra.id = gjr.chat_id
    join public.profiles p on p.id = gjr.user_id
    where gjr.status = 'pending'
  ),
  invite_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', gci.id,
      'invitee_user_id', gci.invitee_user_id,
      'status', gci.status,
      'display_name', p.display_name,
      'social_id', p.social_id,
      'avatar_url', p.avatar_url,
      'is_verified', coalesce(p.is_verified, false) or p.verification_status = 'verified'
    ) order by gci.created_at), '[]'::jsonb) as rows
    from public.group_chat_invites gci
    join room_access ra on ra.id = gci.chat_id
    join public.profiles p on p.id = gci.invitee_user_id
    where gci.status = 'pending'
  ),
  media_rows as (
    select coalesce(jsonb_agg(distinct media.object_path), '[]'::jsonb) as paths
    from room_access ra
    join public.chat_messages cm on cm.chat_id = ra.id
    cross join lateral public.chat_message_attachment_paths(cm.content) media
    where media.object_path is not null
  )
  select jsonb_build_object(
    'members', coalesce((select rows from member_rows), '[]'::jsonb),
    'join_requests', coalesce((select rows from request_rows), '[]'::jsonb),
    'pending_invites', coalesce((select rows from invite_rows), '[]'::jsonb),
    'media_paths', coalesce((select paths from media_rows), '[]'::jsonb),
    'media_urls', '[]'::jsonb
  )
  where exists (select 1 from room_access);
$$;

revoke all on function public.get_native_group_management_snapshot(uuid) from public, anon;
grant execute on function public.get_native_group_management_snapshot(uuid) to authenticated, service_role;

create or replace function public.get_native_matched_fallback_target(p_chat_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  )
  select jsonb_build_object(
    'target_user_id',
    case when m.user1_id = v.user_id then m.user2_id else m.user1_id end
  )
  from public.matches m
  join viewer v on v.user_id is not null
  where m.chat_id = p_chat_id
    and coalesce(m.is_active, true) = true
    and (m.user1_id = v.user_id or m.user2_id = v.user_id)
  limit 1;
$$;

revoke all on function public.get_native_matched_fallback_target(uuid) from public, anon;
grant execute on function public.get_native_matched_fallback_target(uuid) to authenticated, service_role;
