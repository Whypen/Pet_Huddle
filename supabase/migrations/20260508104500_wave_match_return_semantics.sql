-- Return mutual=true when a wave action observes an already-active match for
-- the pair. This lets clients show the match screen even if a trigger or prior
-- RPC activated the match before the final response was built.

create or replace function public.send_discovery_wave(p_target_user_id uuid)
returns table(status text, mutual boolean, match_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_user1 uuid;
  v_user2 uuid;
  v_mutual boolean := false;
  v_match_created boolean := false;
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
    return query select 'blocked'::text, false, false;
    return;
  end if;

  if v_actor_id < p_target_user_id then
    v_user1 := v_actor_id;
    v_user2 := p_target_user_id;
  else
    v_user1 := p_target_user_id;
    v_user2 := v_actor_id;
  end if;

  v_mutual := exists (
    select 1 from public.waves w
    where (w.from_user_id = p_target_user_id and w.to_user_id = v_actor_id)
       or (w.sender_id = p_target_user_id and w.receiver_id = v_actor_id)
  );

  if exists (
    select 1 from public.matches m
    where m.user1_id = v_user1 and m.user2_id = v_user2 and m.is_active is true
  ) then
    return query select 'duplicate'::text, v_mutual, false;
    return;
  end if;

  if exists (
    select 1 from public.waves w
    where (w.from_user_id = v_actor_id and w.to_user_id = p_target_user_id)
       or (w.sender_id = v_actor_id and w.receiver_id = p_target_user_id)
  ) then
    if v_mutual then
      select a.match_created into v_match_created
      from public.accept_mutual_wave(p_target_user_id) a
      limit 1;
    end if;
    return query select 'duplicate'::text, v_mutual, coalesce(v_match_created, false);
    return;
  end if;

  insert into public.waves (from_user_id, to_user_id, sender_id, receiver_id, status, wave_type)
  values (v_actor_id, p_target_user_id, v_actor_id, p_target_user_id, 'pending', 'standard')
  on conflict do nothing;

  v_mutual := exists (
    select 1 from public.waves w
    where (w.from_user_id = p_target_user_id and w.to_user_id = v_actor_id)
       or (w.sender_id = p_target_user_id and w.receiver_id = v_actor_id)
  );

  if v_mutual then
    select a.match_created into v_match_created
    from public.accept_mutual_wave(p_target_user_id) a
    limit 1;
  end if;

  return query select 'sent'::text, v_mutual, coalesce(v_match_created, false);
end;
$$;

revoke all on function public.send_discovery_wave(uuid) from anon;
grant execute on function public.send_discovery_wave(uuid) to authenticated;
