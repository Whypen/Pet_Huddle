-- Wire mutual wave match creation into the notification pipeline.
-- The schema already supports notification kind/type `match`; this function was
-- creating the match and chat room but never enqueueing the matched alert.

create or replace function public.accept_mutual_wave(p_target_user_id uuid)
returns table(match_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  user1 uuid;
  user2 uuid;
  v_chat_id uuid;
  v_was_active boolean;
  v_accepted_count integer;
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_user_id is null or p_target_user_id = v_actor_id then
    raise exception 'target_required';
  end if;

  if exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = v_actor_id and ub.blocked_id = p_target_user_id)
       or (ub.blocker_id = p_target_user_id and ub.blocked_id = v_actor_id)
  ) then
    raise exception 'blocked_relationship';
  end if;

  update public.waves
  set status = 'accepted', responded_at = coalesce(responded_at, now())
  where (sender_id = p_target_user_id and receiver_id = v_actor_id)
     or (from_user_id = p_target_user_id and to_user_id = v_actor_id);

  get diagnostics v_accepted_count = row_count;
  if v_accepted_count = 0 then
    raise exception 'incoming_wave_required';
  end if;

  if v_actor_id < p_target_user_id then
    user1 := v_actor_id;
    user2 := p_target_user_id;
  else
    user1 := p_target_user_id;
    user2 := v_actor_id;
  end if;

  select coalesce(m.is_active, false)
  into v_was_active
  from public.matches m
  where m.user1_id = user1
    and m.user2_id = user2
  limit 1;

  v_chat_id := public.ensure_direct_chat_room_for_users(user1, user2, null);

  delete from public.user_unmatches
  where (actor_id = user1 and target_id = user2)
     or (actor_id = user2 and target_id = user1);

  insert into public.matches (
    user1_id,
    user2_id,
    chat_id,
    matched_at,
    last_interaction_at,
    is_active
  )
  values (
    user1,
    user2,
    v_chat_id,
    now(),
    now(),
    true
  )
  on conflict (user1_id, user2_id)
  do update set
    chat_id = excluded.chat_id,
    matched_at = case
      when public.matches.is_active is true then public.matches.matched_at
      else excluded.matched_at
    end,
    last_interaction_at = excluded.last_interaction_at,
    is_active = true;

  if coalesce(v_was_active, false) is false then
    if coalesce((select np.new_matches from public.notification_preferences np where np.user_id = user1), true) is true then
      perform public.enqueue_notification(
        user1,
        'chats',
        'match',
        'You have a pawfect match! ✨',
        '',
        '/chat-dialogue?room=' || v_chat_id::text || '&with=' || user2::text,
        jsonb_build_object(
          'type', 'match',
          'room_id', v_chat_id,
          'chat_id', v_chat_id,
          'matched_user_id', user2,
          'from_user_id', user2
        )
      );
    end if;

    if coalesce((select np.new_matches from public.notification_preferences np where np.user_id = user2), true) is true then
      perform public.enqueue_notification(
        user2,
        'chats',
        'match',
        'You have a pawfect match! ✨',
        '',
        '/chat-dialogue?room=' || v_chat_id::text || '&with=' || user1::text,
        jsonb_build_object(
          'type', 'match',
          'room_id', v_chat_id,
          'chat_id', v_chat_id,
          'matched_user_id', user1,
          'from_user_id', user1
        )
      );
    end if;
  end if;

  return query select (coalesce(v_was_active, false) is false);
end;
$$;

revoke all on function public.accept_mutual_wave(uuid) from public, anon;
grant execute on function public.accept_mutual_wave(uuid) to authenticated, service_role;
