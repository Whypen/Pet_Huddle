create or replace function public.create_match_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat_id uuid;
begin
  if new.user1_id is null or new.user2_id is null or new.user1_id = new.user2_id then
    return new;
  end if;

  v_chat_id := public.ensure_direct_chat_room_for_users(new.user1_id, new.user2_id, null);

  delete from public.user_unmatches
  where (actor_id = new.user1_id and target_id = new.user2_id)
     or (actor_id = new.user2_id and target_id = new.user1_id);

  update public.matches
  set
    chat_id = v_chat_id,
    is_active = true,
    matched_at = coalesce(matched_at, now()),
    last_interaction_at = now()
  where id = new.id;

  return new;
end;
$$;

create or replace function public.check_for_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reverse_wave_exists boolean;
  user1 uuid;
  user2 uuid;
  v_chat_id uuid;
begin
  if new.status = 'accepted' then
    select exists(
      select 1
      from public.waves
      where sender_id = new.receiver_id
        and receiver_id = new.sender_id
        and status = 'accepted'
    ) into reverse_wave_exists;

    if reverse_wave_exists then
      if new.sender_id < new.receiver_id then
        user1 := new.sender_id;
        user2 := new.receiver_id;
      else
        user1 := new.receiver_id;
        user2 := new.sender_id;
      end if;

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
    end if;
  end if;

  return new;
end;
$$;

drop function if exists public.accept_mutual_wave(uuid);

create function public.accept_mutual_wave(p_target_user_id uuid)
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
  where sender_id = p_target_user_id
    and receiver_id = v_actor_id;

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

  return query select coalesce(v_was_active, false) is false;
end;
$$;

grant execute on function public.accept_mutual_wave(uuid) to authenticated;

drop function if exists public.unmatch_user_one_sided(uuid);

create function public.unmatch_user_one_sided(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  user1 uuid;
  user2 uuid;
  v_chat_id uuid;
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_other_user_id is null or p_other_user_id = v_actor_id then
    raise exception 'target_required';
  end if;

  if v_actor_id < p_other_user_id then
    user1 := v_actor_id;
    user2 := p_other_user_id;
  else
    user1 := p_other_user_id;
    user2 := v_actor_id;
  end if;

  select m.chat_id
  into v_chat_id
  from public.matches m
  where m.user1_id = user1
    and m.user2_id = user2
  limit 1;

  if v_chat_id is null then
    select dcp.chat_id
    into v_chat_id
    from public.direct_chat_pairs dcp
    where dcp.user_low = user1
      and dcp.user_high = user2
    limit 1;
  end if;

  insert into public.user_unmatches (actor_id, target_id, chat_id)
  values (v_actor_id, p_other_user_id, v_chat_id);

  update public.matches
  set
    is_active = false,
    last_interaction_at = now()
  where user1_id = user1
    and user2_id = user2;

  return v_chat_id;
end;
$$;

grant execute on function public.unmatch_user_one_sided(uuid) to authenticated;

do $$
declare
  row record;
  v_chat_id uuid;
begin
  for row in
    select id, user1_id, user2_id
    from public.matches
    where is_active is true
  loop
    v_chat_id := public.ensure_direct_chat_room_for_users(row.user1_id, row.user2_id, null);
    update public.matches
    set chat_id = v_chat_id
    where id = row.id
      and chat_id is distinct from v_chat_id;
  end loop;
end;
$$;
