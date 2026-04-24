create or replace function public.assert_active_direct_match(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user1 uuid;
  v_user2 uuid;
begin
  if p_actor_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_user_id is null then
    raise exception 'target_required';
  end if;

  if p_actor_user_id = p_target_user_id then
    raise exception 'cannot_chat_with_self';
  end if;

  if exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = p_actor_user_id and ub.blocked_id = p_target_user_id)
       or (ub.blocker_id = p_target_user_id and ub.blocked_id = p_actor_user_id)
  ) then
    raise exception 'blocked_relationship';
  end if;

  if exists (
    select 1
    from public.user_unmatches uu
    where (uu.actor_id = p_actor_user_id and uu.target_id = p_target_user_id)
       or (uu.actor_id = p_target_user_id and uu.target_id = p_actor_user_id)
  ) then
    raise exception 'unmatched_relationship';
  end if;

  if p_actor_user_id < p_target_user_id then
    v_user1 := p_actor_user_id;
    v_user2 := p_target_user_id;
  else
    v_user1 := p_target_user_id;
    v_user2 := p_actor_user_id;
  end if;

  if not exists (
    select 1
    from public.matches m
    where m.user1_id = v_user1
      and m.user2_id = v_user2
      and m.is_active is true
  ) then
    raise exception 'active_match_required';
  end if;
end;
$$;

revoke all on function public.assert_active_direct_match(uuid, uuid) from public;
grant execute on function public.assert_active_direct_match(uuid, uuid) to authenticated;
grant execute on function public.assert_active_direct_match(uuid, uuid) to service_role;

create or replace function public.ensure_direct_chat_room(
  p_target_user_id uuid,
  p_target_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  perform public.assert_active_direct_match(v_actor_id, p_target_user_id);
  return public.ensure_direct_chat_room_for_users(v_actor_id, p_target_user_id, p_target_name);
end;
$$;

grant execute on function public.ensure_direct_chat_room(uuid, text) to authenticated;

create or replace function public.send_match_first_message(
  p_target_user_id uuid,
  p_target_name text default null,
  p_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_room_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_body = '' then
    raise exception 'message_required';
  end if;

  perform public.assert_active_direct_match(v_actor_id, p_target_user_id);
  v_room_id := public.ensure_direct_chat_room_for_users(v_actor_id, p_target_user_id, p_target_name);

  insert into public.chat_messages (chat_id, sender_id, content)
  values (v_room_id, v_actor_id, v_body);

  return v_room_id;
end;
$$;

grant execute on function public.send_match_first_message(uuid, text, text) to authenticated;

drop function if exists public.get_chat_inbox_summaries(text, uuid[]);

create function public.get_chat_inbox_summaries(
  p_scope text default 'all',
  p_chat_ids uuid[] default null
)
returns table(
  chat_id uuid,
  room_type text,
  peer_user_id uuid,
  peer_name text,
  peer_avatar_url text,
  peer_is_verified boolean,
  peer_has_car boolean,
  peer_availability_label text,
  peer_social_id text,
  blocked_by_me boolean,
  blocked_by_them boolean,
  unmatched_by_them boolean,
  unmatched_by_me boolean,
  matched_at timestamptz,
  chat_name text,
  avatar_url text,
  member_count integer,
  pet_focus text[],
  location_label text,
  location_country text,
  visibility text,
  room_code text,
  join_method text,
  description text,
  created_at timestamptz,
  created_by uuid,
  last_message_id uuid,
  last_message_sender_id uuid,
  last_message_sender_name text,
  last_message_content text,
  last_message_at timestamptz,
  unread_count integer,
  last_message_read_by_other boolean,
  service_status text,
  service_requester_id uuid,
  service_provider_id uuid,
  service_request_card jsonb,
  shape_issue text
)
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  member_rooms as (
    select distinct crm.chat_id
    from public.chat_room_members crm
    join viewer v on v.user_id = crm.user_id
    where p_chat_ids is null or crm.chat_id = any(p_chat_ids)
  ),
  room_member_counts as (
    select crm.chat_id, count(distinct crm.user_id)::int as member_count
    from public.chat_room_members crm
    join member_rooms mr on mr.chat_id = crm.chat_id
    group by crm.chat_id
  ),
  scoped_rooms as (
    select
      c.id as chat_id,
      c.type as room_type,
      c.name as chat_name,
      c.avatar_url,
      c.pet_focus,
      c.location_label,
      c.location_country,
      c.visibility,
      c.room_code,
      c.join_method,
      c.description,
      c.created_at,
      c.created_by,
      mc.member_count,
      sc.chat_id as service_chat_id,
      sc.status as service_status,
      sc.requester_id as service_requester_id,
      sc.provider_id as service_provider_id,
      sc.request_card as service_request_card,
      case
        when c.type = 'direct' and sc.chat_id is not null then 'direct_has_service_row'
        when c.type = 'service' and sc.chat_id is null then 'service_missing_service_row'
        when c.type = 'group' and sc.chat_id is not null then 'group_has_service_row'
        when c.type = 'direct' and coalesce(mc.member_count, 0) <> 2 then 'direct_member_count_invalid'
        when c.type = 'service' and coalesce(mc.member_count, 0) <> 2 then 'service_member_count_invalid'
        else null
      end as shape_issue
    from public.chats c
    join member_rooms mr on mr.chat_id = c.id
    left join public.service_chats sc on sc.chat_id = c.id
    left join room_member_counts mc on mc.chat_id = c.id
    where case coalesce(p_scope, 'all')
      when 'friends' then c.type = 'direct' and sc.chat_id is null
      when 'groups' then c.type = 'group'
      when 'service' then (c.type = 'service' or sc.chat_id is not null) and sc.chat_id is not null and coalesce(mc.member_count, 0) = 2
      else true
    end
  ),
  last_messages as (
    select distinct on (cm.chat_id)
      cm.chat_id,
      cm.id as last_message_id,
      cm.sender_id as last_message_sender_id,
      cm.content as last_message_content,
      cm.created_at as last_message_at
    from public.chat_messages cm
    join scoped_rooms sr on sr.chat_id = cm.chat_id
    order by cm.chat_id, cm.created_at desc, cm.id desc
  ),
  unread_counts as (
    select
      cm.chat_id,
      count(*)::int as unread_count
    from public.chat_messages cm
    join scoped_rooms sr on sr.chat_id = cm.chat_id
    join viewer v on true
    left join public.message_reads mr
      on mr.message_id = cm.id
     and mr.user_id = v.user_id
    where cm.sender_id <> v.user_id
      and mr.message_id is null
    group by cm.chat_id
  )
  select
    sr.chat_id,
    sr.room_type,
    peer.peer_user_id,
    coalesce(peer.peer_name, sr.chat_name, 'Conversation') as peer_name,
    coalesce(peer.peer_avatar_url, sr.avatar_url) as peer_avatar_url,
    coalesce(peer.peer_is_verified, false) as peer_is_verified,
    coalesce(peer.peer_has_car, false) as peer_has_car,
    peer.peer_availability_label,
    peer.peer_social_id,
    coalesce(peer.blocked_by_me, false) as blocked_by_me,
    coalesce(peer.blocked_by_them, false) as blocked_by_them,
    coalesce(peer.unmatched_by_them, false) as unmatched_by_them,
    coalesce(peer.unmatched_by_me, false) as unmatched_by_me,
    peer.matched_at,
    sr.chat_name,
    sr.avatar_url,
    coalesce(sr.member_count, 0),
    sr.pet_focus,
    sr.location_label,
    sr.location_country,
    sr.visibility,
    sr.room_code,
    sr.join_method,
    sr.description,
    sr.created_at,
    sr.created_by,
    lm.last_message_id,
    lm.last_message_sender_id,
    coalesce(sender_profile.display_name, sender_public.display_name) as last_message_sender_name,
    lm.last_message_content,
    lm.last_message_at,
    coalesce(uc.unread_count, 0) as unread_count,
    exists (
      select 1
      from public.message_reads mr
      join viewer v on true
      where mr.message_id = lm.last_message_id
        and mr.user_id <> v.user_id
    ) as last_message_read_by_other,
    sr.service_status,
    sr.service_requester_id,
    sr.service_provider_id,
    sr.service_request_card,
    sr.shape_issue
  from scoped_rooms sr
  left join last_messages lm on lm.chat_id = sr.chat_id
  left join unread_counts uc on uc.chat_id = sr.chat_id
  left join public.profiles sender_profile on sender_profile.id = lm.last_message_sender_id
  left join public.profiles_public sender_public on sender_public.id = lm.last_message_sender_id
  left join lateral (
    with viewer_row as (
      select auth.uid() as viewer_user_id
    ),
    counterpart as (
      select crm.user_id
      from public.chat_room_members crm
      join viewer_row vr on true
      where crm.chat_id = sr.chat_id
        and crm.user_id <> vr.viewer_user_id
      order by crm.created_at asc nulls last, crm.user_id
      limit 1
    )
    select
      cp.user_id as peer_user_id,
      coalesce(p.display_name, pp.display_name, sr.chat_name, 'Conversation') as peer_name,
      coalesce(p.avatar_url, pp.avatar_url, sr.avatar_url) as peer_avatar_url,
      coalesce(p.is_verified, pp.is_verified, false) as peer_is_verified,
      coalesce(p.has_car, pp.has_car, false) as peer_has_car,
      case
        when coalesce(array_length(p.availability_status, 1), 0) > 0 then array_to_string(p.availability_status, ' • ')
        when coalesce(array_length(pp.availability_status, 1), 0) > 0 then array_to_string(pp.availability_status, ' • ')
        else coalesce(p.user_role, pp.user_role, 'Friend')
      end as peer_availability_label,
      p.social_id as peer_social_id,
      exists (
        select 1
        from public.user_blocks ub
        join viewer_row vr on true
        where ub.blocker_id = vr.viewer_user_id
          and ub.blocked_id = cp.user_id
      ) as blocked_by_me,
      exists (
        select 1
        from public.user_blocks ub
        join viewer_row vr on true
        where ub.blocker_id = cp.user_id
          and ub.blocked_id = vr.viewer_user_id
      ) as blocked_by_them,
      exists (
        select 1
        from public.user_unmatches uu
        join viewer_row vr on true
        where uu.actor_id = cp.user_id
          and uu.target_id = vr.viewer_user_id
      ) as unmatched_by_them,
      exists (
        select 1
        from public.user_unmatches uu
        join viewer_row vr on true
        where uu.actor_id = vr.viewer_user_id
          and uu.target_id = cp.user_id
      ) as unmatched_by_me,
      (
        select m.matched_at
        from public.matches m
        join viewer_row vr on true
        where (
          (m.user1_id = vr.viewer_user_id and m.user2_id = cp.user_id) or
          (m.user1_id = cp.user_id and m.user2_id = vr.viewer_user_id)
        )
        order by m.matched_at desc nulls last
        limit 1
      ) as matched_at
    from counterpart cp
    left join public.profiles p on p.id = cp.user_id
    left join public.profiles_public pp on pp.id = cp.user_id
  ) peer on sr.room_type in ('direct', 'service') or sr.service_chat_id is not null
  order by
    case sr.room_type
      when 'group' then 1
      when 'service' then 2
      else 0
    end,
    coalesce(lm.last_message_at, peer.matched_at, sr.created_at) desc nulls last,
    sr.created_at desc;
$$;

grant execute on function public.get_chat_inbox_summaries(text, uuid[]) to authenticated;
