create table if not exists public.direct_chat_pairs (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint direct_chat_pairs_pkey primary key (user_low, user_high),
  constraint direct_chat_pairs_chat_id_key unique (chat_id),
  constraint direct_chat_pairs_user_order_check check (user_low < user_high)
);

alter table public.direct_chat_pairs enable row level security;

drop policy if exists "direct_chat_pairs_select_own" on public.direct_chat_pairs;
create policy "direct_chat_pairs_select_own"
  on public.direct_chat_pairs
  for select
  using (auth.uid() = user_low or auth.uid() = user_high);

grant select on public.direct_chat_pairs to authenticated;
grant all on public.direct_chat_pairs to service_role;

with ranked_direct_chats as (
  select
    c.id as chat_id,
    (array_agg(distinct crm.user_id order by crm.user_id))[1] as user_low,
    (array_agg(distinct crm.user_id order by crm.user_id))[2] as user_high,
    row_number() over (
      partition by
        (array_agg(distinct crm.user_id order by crm.user_id))[1],
        (array_agg(distinct crm.user_id order by crm.user_id))[2]
      order by coalesce(c.last_message_at, c.created_at) desc, c.created_at desc, c.id desc
    ) as row_rank
  from public.chats c
  join public.chat_room_members crm
    on crm.chat_id = c.id
  left join public.service_chats sc
    on sc.chat_id = c.id
  where c.type = 'direct'
    and sc.chat_id is null
  group by c.id, c.created_at, c.last_message_at
  having count(distinct crm.user_id) = 2
),
duplicate_direct_chats as (
  select
    dup.chat_id as duplicate_chat_id,
    keep.chat_id as canonical_chat_id
  from ranked_direct_chats dup
  join ranked_direct_chats keep
    on keep.user_low = dup.user_low
   and keep.user_high = dup.user_high
   and keep.row_rank = 1
  where dup.row_rank > 1
),
moved_members as (
  insert into public.chat_room_members (chat_id, user_id, created_at)
  select
    d.canonical_chat_id,
    crm.user_id,
    min(crm.created_at)
  from duplicate_direct_chats d
  join public.chat_room_members crm
    on crm.chat_id = d.duplicate_chat_id
  group by d.canonical_chat_id, crm.user_id
  on conflict do nothing
  returning chat_id
),
moved_participants as (
  insert into public.chat_participants (chat_id, user_id, role, joined_at, is_muted)
  select
    d.canonical_chat_id,
    cp.user_id,
    coalesce(cp.role, 'member'),
    min(cp.joined_at),
    bool_or(coalesce(cp.is_muted, false))
  from duplicate_direct_chats d
  join public.chat_participants cp
    on cp.chat_id = d.duplicate_chat_id
  group by d.canonical_chat_id, cp.user_id, coalesce(cp.role, 'member')
  on conflict on constraint chat_participants_chat_id_user_id_key
  do update set
    is_muted = public.chat_participants.is_muted or excluded.is_muted,
    joined_at = least(public.chat_participants.joined_at, excluded.joined_at)
  returning chat_id
),
moved_messages as (
  update public.chat_messages cm
  set chat_id = d.canonical_chat_id
  from duplicate_direct_chats d
  where cm.chat_id = d.duplicate_chat_id
  returning cm.id
),
updated_matches as (
  update public.matches m
  set chat_id = d.canonical_chat_id
  from duplicate_direct_chats d
  where m.chat_id = d.duplicate_chat_id
  returning m.id
)
delete from public.chats c
using duplicate_direct_chats d
where c.id = d.duplicate_chat_id;

with canonical_direct_chats as (
  select
    c.id as chat_id,
    (array_agg(distinct crm.user_id order by crm.user_id))[1] as user_low,
    (array_agg(distinct crm.user_id order by crm.user_id))[2] as user_high
  from public.chats c
  join public.chat_room_members crm
    on crm.chat_id = c.id
  left join public.service_chats sc
    on sc.chat_id = c.id
  where c.type = 'direct'
    and sc.chat_id is null
  group by c.id
  having count(distinct crm.user_id) = 2
)
insert into public.direct_chat_pairs (user_low, user_high, chat_id)
select user_low, user_high, chat_id
from canonical_direct_chats
where user_low is not null
  and user_high is not null
on conflict (user_low, user_high)
do update set chat_id = excluded.chat_id;

create or replace function public.ensure_direct_chat_room_for_users(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_target_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := p_actor_user_id;
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

  if v_actor_id < v_target_id then
    v_user_low := v_actor_id;
    v_user_high := v_target_id;
  else
    v_user_low := v_target_id;
    v_user_high := v_actor_id;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_low::text), hashtext(v_user_high::text));

  select dcp.chat_id
  into v_chat_id
  from public.direct_chat_pairs dcp
  join public.chats c
    on c.id = dcp.chat_id
  left join public.service_chats sc
    on sc.chat_id = c.id
  where dcp.user_low = v_user_low
    and dcp.user_high = v_user_high
    and c.type = 'direct'
    and sc.chat_id is null
  limit 1;

  if v_chat_id is null then
    select c.id
    into v_chat_id
    from public.chats c
    join public.chat_room_members crm_low
      on crm_low.chat_id = c.id
     and crm_low.user_id = v_user_low
    join public.chat_room_members crm_high
      on crm_high.chat_id = c.id
     and crm_high.user_id = v_user_high
    left join public.service_chats sc
      on sc.chat_id = c.id
    where c.type = 'direct'
      and sc.chat_id is null
    order by coalesce(c.last_message_at, c.created_at) desc, c.created_at desc, c.id desc
    limit 1;
  end if;

  if v_chat_id is null then
    insert into public.chats (name, type, created_by)
    values (coalesce(nullif(trim(p_target_name), ''), 'Conversation'), 'direct', v_actor_id)
    returning id into v_chat_id;
  end if;

  insert into public.direct_chat_pairs (user_low, user_high, chat_id)
  values (v_user_low, v_user_high, v_chat_id)
  on conflict (user_low, user_high)
  do update set chat_id = excluded.chat_id;

  insert into public.chat_room_members (chat_id, user_id)
  values (v_chat_id, v_actor_id), (v_chat_id, v_target_id)
  on conflict do nothing;

  insert into public.chat_participants (chat_id, user_id, role)
  values (v_chat_id, v_actor_id, 'member'), (v_chat_id, v_target_id, 'member')
  on conflict on constraint chat_participants_chat_id_user_id_key do nothing;

  return v_chat_id;
end;
$$;

create or replace function public.ensure_direct_chat_room(
  p_target_user_id uuid,
  p_target_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.ensure_direct_chat_room_for_users(auth.uid(), p_target_user_id, p_target_name);
end;
$$;

grant execute on function public.ensure_direct_chat_room_for_users(uuid, uuid, text) to service_role;
grant execute on function public.ensure_direct_chat_room(uuid, text) to authenticated;
