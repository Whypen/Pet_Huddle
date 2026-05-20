-- Keep wave aliases in sync and expose a stable native send RPC.

alter table public.waves add column if not exists from_user_id uuid;
alter table public.waves add column if not exists to_user_id uuid;
alter table public.waves add column if not exists sender_id uuid;
alter table public.waves add column if not exists receiver_id uuid;
alter table public.waves add column if not exists status text not null default 'pending';
alter table public.waves add column if not exists wave_type text not null default 'standard';
alter table public.waves add column if not exists responded_at timestamptz;

update public.waves
set
  from_user_id = coalesce(from_user_id, sender_id),
  to_user_id = coalesce(to_user_id, receiver_id),
  sender_id = coalesce(sender_id, from_user_id),
  receiver_id = coalesce(receiver_id, to_user_id),
  status = coalesce(nullif(status, ''), 'pending'),
  wave_type = coalesce(nullif(wave_type, ''), 'standard');

create unique index if not exists waves_from_to_unique on public.waves(from_user_id, to_user_id);
create unique index if not exists waves_sender_receiver_unique on public.waves(sender_id, receiver_id);

create or replace function public.sync_wave_aliases()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.from_user_id := coalesce(new.from_user_id, new.sender_id);
  new.to_user_id := coalesce(new.to_user_id, new.receiver_id);
  new.sender_id := coalesce(new.sender_id, new.from_user_id);
  new.receiver_id := coalesce(new.receiver_id, new.to_user_id);
  new.status := coalesce(nullif(new.status, ''), 'pending');
  new.wave_type := coalesce(nullif(new.wave_type, ''), 'standard');
  return new;
end;
$$;

drop trigger if exists sync_wave_aliases_before_write on public.waves;
create trigger sync_wave_aliases_before_write
before insert or update on public.waves
for each row execute function public.sync_wave_aliases();

drop policy if exists "waves_select_involving_user" on public.waves;
create policy "waves_select_involving_user"
on public.waves
for select
using (
  auth.uid() = from_user_id
  or auth.uid() = to_user_id
  or auth.uid() = sender_id
  or auth.uid() = receiver_id
);

drop policy if exists "waves_insert_from_user" on public.waves;
create policy "waves_insert_from_user"
on public.waves
for insert
with check (auth.uid() = from_user_id or auth.uid() = sender_id);

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

  return query select (coalesce(v_was_active, false) is false);
end;
$$;

grant execute on function public.accept_mutual_wave(uuid) to authenticated;

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

  if exists (
    select 1 from public.matches m
    where m.user1_id = v_user1 and m.user2_id = v_user2 and m.is_active is true
  ) then
    return query select 'duplicate'::text, false, false;
    return;
  end if;

  if exists (
    select 1 from public.waves w
    where (w.from_user_id = v_actor_id and w.to_user_id = p_target_user_id)
       or (w.sender_id = v_actor_id and w.receiver_id = p_target_user_id)
  ) then
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
