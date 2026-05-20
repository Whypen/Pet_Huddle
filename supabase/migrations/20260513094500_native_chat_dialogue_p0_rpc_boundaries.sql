create or replace function public.get_native_group_manage_snapshot(p_chat_id uuid)
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
        select 1
        from public.chat_room_members crm
        where crm.chat_id = c.id
          and crm.user_id = v.user_id
      )
    limit 1
  ),
  member_ids as (
    select crm.user_id
    from public.chat_room_members crm
    join room_access ra on ra.id = crm.chat_id
    limit 100
  ),
  member_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'social_id', p.social_id,
      'avatar_url', p.avatar_url,
      'is_verified', coalesce(p.is_verified, false) or p.verification_status = 'verified'
    ) order by lower(coalesce(p.display_name, ''))), '[]'::jsonb) as members
    from member_ids mi
    join public.profiles p on p.id = mi.user_id
  ),
  matched_peer_ids as (
    select distinct case when m.user1_id = v.user_id then m.user2_id else m.user1_id end as user_id
    from public.matches m
    join viewer v on v.user_id is not null
    join room_access ra on true
    where coalesce(m.is_active, true) = true
      and (m.user1_id = v.user_id or m.user2_id = v.user_id)
  ),
  direct_peer_ids as (
    select distinct peer.user_id
    from viewer v
    join room_access ra on true
    join public.chat_room_members mine on mine.user_id = v.user_id
    join public.chats c on c.id = mine.chat_id and c.type = 'direct'
    join public.chat_room_members peer on peer.chat_id = c.id and peer.user_id <> v.user_id
  ),
  candidate_ids as (
    select user_id from matched_peer_ids
    union
    select user_id from direct_peer_ids
  ),
  filtered_candidates as (
    select ci.user_id
    from candidate_ids ci
    join viewer v on true
    where ci.user_id is not null
      and not exists (select 1 from member_ids mi where mi.user_id = ci.user_id)
      and not exists (
        select 1
        from public.user_blocks ub
        where (ub.blocker_id = v.user_id and ub.blocked_id = ci.user_id)
           or (ub.blocker_id = ci.user_id and ub.blocked_id = v.user_id)
      )
      and not exists (
        select 1
        from public.user_unmatches uu
        where (uu.actor_id = v.user_id and uu.target_id = ci.user_id)
           or (uu.actor_id = ci.user_id and uu.target_id = v.user_id)
      )
    limit 200
  ),
  friend_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'social_id', p.social_id,
      'avatar_url', p.avatar_url,
      'is_verified', coalesce(p.is_verified, false) or p.verification_status = 'verified'
    ) order by lower(coalesce(p.display_name, ''))), '[]'::jsonb) as friends
    from filtered_candidates fc
    join public.profiles p on p.id = fc.user_id
  )
  select jsonb_build_object(
    'members', coalesce((select members from member_rows), '[]'::jsonb),
    'friends', coalesce((select friends from friend_rows), '[]'::jsonb)
  )
  where exists (select 1 from room_access);
$$;

revoke all on function public.get_native_group_manage_snapshot(uuid) from public, anon;
grant execute on function public.get_native_group_manage_snapshot(uuid) to authenticated, service_role;

create or replace function public.update_native_chat_message_content(
  p_message_id uuid,
  p_content text
)
returns table (
  id uuid,
  chat_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  update public.chat_messages cm
  set content = p_content
  where cm.id = p_message_id
    and cm.sender_id = auth.uid()
    and exists (
      select 1
      from public.chat_room_members crm
      where crm.chat_id = cm.chat_id
        and crm.user_id = auth.uid()
    )
  returning cm.id, cm.chat_id, cm.sender_id, cm.content, cm.created_at;
$$;

revoke all on function public.update_native_chat_message_content(uuid, text) from public, anon;
grant execute on function public.update_native_chat_message_content(uuid, text) to authenticated, service_role;
