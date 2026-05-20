-- Pass 1 chat contract repair:
-- - Public group join/request/invite paths must validate the group inside their own RPCs,
--   not through the member-only dialogue snapshot.
-- - Star opens/creates a direct room and writes one Star intro message, but it is not a
--   mutual Wave match and must not upsert public.matches.

create or replace function public.send_star_chat_atomic(
  p_target_user_id uuid,
  p_target_name text default null,
  p_content text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_room_id uuid;
  v_content text := nullif(trim(coalesce(p_content, '')), '');
  v_user1 uuid;
  v_user2 uuid;
  v_member_count integer;
  v_target_available boolean := false;
  v_existing_star_intro boolean := false;
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_user_id is null then
    raise exception 'target_required';
  end if;

  if v_actor_id = p_target_user_id then
    raise exception 'cannot_chat_with_self';
  end if;

  if v_content is null then
    raise exception 'content_required';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = p_target_user_id
      and coalesce(p.non_social, false) = false
      and coalesce(p.account_status::text, 'active') = 'active'
  ) into v_target_available;

  if not v_target_available then
    raise exception 'target_unavailable';
  end if;

  if exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = v_actor_id and ub.blocked_id = p_target_user_id)
       or (ub.blocker_id = p_target_user_id and ub.blocked_id = v_actor_id)
  ) then
    raise exception 'blocked_relationship';
  end if;

  -- Target's prior unmatch is a hard boundary. Sender's own prior unmatch/pass
  -- can be reversed by intentionally sending a Star.
  if exists (
    select 1
    from public.user_unmatches uu
    where uu.actor_id = p_target_user_id
      and uu.target_id = v_actor_id
  ) then
    raise exception 'unmatched_relationship';
  end if;

  if v_actor_id < p_target_user_id then
    v_user1 := v_actor_id;
    v_user2 := p_target_user_id;
  else
    v_user1 := p_target_user_id;
    v_user2 := v_actor_id;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user1::text), hashtext(v_user2::text));

  select dcp.chat_id
  into v_room_id
  from public.direct_chat_pairs dcp
  where dcp.user_low = v_user1
    and dcp.user_high = v_user2
  limit 1;

  if v_room_id is not null then
    select exists (
      select 1
      from public.chat_messages cm
      where cm.chat_id = v_room_id
        and cm.sender_id = v_actor_id
        and cm.content like '%"kind":"star_intro"%'
        and cm.content like '%"sender_id":"' || v_actor_id::text || '"%'
        and cm.content like '%"recipient_id":"' || p_target_user_id::text || '"%'
    ) into v_existing_star_intro;

    if v_existing_star_intro then
      return v_room_id;
    end if;
  end if;

  if public.check_and_increment_quota('star') is not true then
    return null;
  end if;

  delete from public.user_unmatches uu
  where uu.actor_id = v_actor_id
    and uu.target_id = p_target_user_id;

  v_room_id := public.ensure_direct_chat_room_for_users(v_actor_id, p_target_user_id, p_target_name);

  select count(distinct crm.user_id)::int
  into v_member_count
  from public.chat_room_members crm
  where crm.chat_id = v_room_id;

  if coalesce(v_member_count, 0) <> 2 then
    raise exception 'direct_room_invalid';
  end if;

  if not exists (
    select 1 from public.chat_room_members crm
    where crm.chat_id = v_room_id and crm.user_id = v_actor_id
  ) or not exists (
    select 1 from public.chat_room_members crm
    where crm.chat_id = v_room_id and crm.user_id = p_target_user_id
  ) then
    raise exception 'direct_room_invalid';
  end if;

  insert into public.chat_messages (chat_id, sender_id, content)
  select v_room_id, v_actor_id, v_content
  where not exists (
    select 1
    from public.chat_messages cm
    where cm.chat_id = v_room_id
      and cm.sender_id = v_actor_id
      and cm.content like '%"kind":"star_intro"%'
      and cm.content like '%"sender_id":"' || v_actor_id::text || '"%'
      and cm.content like '%"recipient_id":"' || p_target_user_id::text || '"%'
  );

  return v_room_id;
end;
$$;
