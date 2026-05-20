-- Bridge legacy web chat_participants direct memberships into the canonical
-- chat_room_members/direct_chat_pairs contract. Runtime native code still uses
-- chat_room_members only; this migration repairs DB state and RPC lookup.

insert into public.chat_room_members (chat_id, user_id, created_at, role, is_muted)
select
  cp.chat_id,
  cp.user_id,
  coalesce(cp.joined_at, now()),
  coalesce(cp.role, 'member'),
  coalesce(cp.is_muted, false)
from public.chat_participants cp
join public.chats c on c.id = cp.chat_id
where c.type in ('direct', 'group')
on conflict (chat_id, user_id) do update
set
  role = coalesce(public.chat_room_members.role, excluded.role),
  is_muted = public.chat_room_members.is_muted or excluded.is_muted;

insert into public.direct_chat_pairs (user_low, user_high, chat_id)
select
  ranked.user_low,
  ranked.user_high,
  ranked.chat_id
from (
  select distinct on (members.user_ids[1], members.user_ids[2])
    members.user_ids[1] as user_low,
    members.user_ids[2] as user_high,
    members.chat_id
  from (
  select
    c.id as chat_id,
    c.last_message_at,
    c.created_at,
    array_agg(distinct crm.user_id order by crm.user_id) as user_ids,
    count(distinct crm.user_id) as member_count
  from public.chats c
  join public.chat_room_members crm on crm.chat_id = c.id
  left join public.service_chats sc on sc.chat_id = c.id
  where c.type = 'direct'
    and sc.chat_id is null
  group by c.id, c.last_message_at, c.created_at
  ) members
  where members.member_count = 2
    and members.user_ids[1] < members.user_ids[2]
  order by members.user_ids[1], members.user_ids[2], coalesce(members.last_message_at, members.created_at) desc, members.created_at desc, members.chat_id desc
) ranked
on conflict (user_low, user_high)
do update set chat_id = excluded.chat_id;

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
  v_target_id uuid := p_target_user_id;
  v_user_low uuid;
  v_user_high uuid;
  v_chat_id uuid;
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_target_id is null then
    raise exception 'target_required';
  end if;

  if v_actor_id = v_target_id then
    raise exception 'cannot_chat_with_self';
  end if;

  if exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = v_actor_id and ub.blocked_id = v_target_id)
       or (ub.blocker_id = v_target_id and ub.blocked_id = v_actor_id)
  ) then
    raise exception 'blocked_relationship';
  end if;

  if exists (
    select 1
    from public.user_unmatches uu
    where (uu.actor_id = v_actor_id and uu.target_id = v_target_id)
       or (uu.actor_id = v_target_id and uu.target_id = v_actor_id)
  ) then
    raise exception 'unmatched_relationship';
  end if;

  if v_actor_id < v_target_id then
    v_user_low := v_actor_id;
    v_user_high := v_target_id;
  else
    v_user_low := v_target_id;
    v_user_high := v_actor_id;
  end if;

  select dcp.chat_id
  into v_chat_id
  from public.direct_chat_pairs dcp
  join public.chats c on c.id = dcp.chat_id
  left join public.service_chats sc on sc.chat_id = c.id
  where dcp.user_low = v_user_low
    and dcp.user_high = v_user_high
    and c.type = 'direct'
    and sc.chat_id is null
  limit 1;

  if v_chat_id is null then
    select c.id
    into v_chat_id
    from public.chats c
    join public.chat_room_members crm_actor
      on crm_actor.chat_id = c.id
     and crm_actor.user_id = v_actor_id
    join public.chat_room_members crm_target
      on crm_target.chat_id = c.id
     and crm_target.user_id = v_target_id
    left join public.service_chats sc
      on sc.chat_id = c.id
    where c.type = 'direct'
      and sc.chat_id is null
    order by coalesce(c.last_message_at, c.created_at) desc, c.created_at desc, c.id desc
    limit 1;
  end if;

  if v_chat_id is null then
    select c.id
    into v_chat_id
    from public.chats c
    join public.chat_participants cp_actor
      on cp_actor.chat_id = c.id
     and cp_actor.user_id = v_actor_id
    join public.chat_participants cp_target
      on cp_target.chat_id = c.id
     and cp_target.user_id = v_target_id
    left join public.service_chats sc
      on sc.chat_id = c.id
    where c.type = 'direct'
      and sc.chat_id is null
    order by coalesce(c.last_message_at, c.created_at) desc, c.created_at desc, c.id desc
    limit 1;
  end if;

  if v_chat_id is not null then
    insert into public.direct_chat_pairs (user_low, user_high, chat_id)
    values (v_user_low, v_user_high, v_chat_id)
    on conflict (user_low, user_high)
    do update set chat_id = excluded.chat_id;

    insert into public.chat_room_members (chat_id, user_id)
    values (v_chat_id, v_actor_id), (v_chat_id, v_target_id)
    on conflict do nothing;

    return v_chat_id;
  end if;

  perform public.assert_active_direct_match(v_actor_id, v_target_id);
  return public.ensure_direct_chat_room_for_users(v_actor_id, v_target_id, p_target_name);
end;
$$;

grant execute on function public.ensure_direct_chat_room(uuid, text) to authenticated;
