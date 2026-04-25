-- ============================================================================
-- Backfill missing matches rows for legacy direct chat rooms.
--
-- Context: migration 20260425173000 introduced assert_active_direct_match,
-- which requires every direct chat to have a corresponding row in
-- public.matches with is_active = true. Direct chat rooms created before
-- that contract was hardened never had a matches row inserted, so opening
-- them now throws 'active_match_required'.
--
-- Audit on 2026-04-26 found 11 of 13 platform-wide 2-member direct rooms
-- lacked a matches row. This backfill creates the missing rows in canonical
-- (user1 < user2) order, copying chat_id and timestamps from the chat itself
-- so historical context (matched_at, last_interaction_at) is preserved.
--
-- Idempotent — uses ON CONFLICT DO NOTHING. Safe to re-run.
-- ============================================================================

insert into public.matches (
  user1_id,
  user2_id,
  chat_id,
  matched_at,
  last_interaction_at,
  is_active
)
select
  least(members[1], members[2])    as user1_id,
  greatest(members[1], members[2]) as user2_id,
  chat_id,
  chat_created_at                  as matched_at,
  coalesce(latest_message_at, chat_created_at) as last_interaction_at,
  true                             as is_active
from (
  select
    crm.chat_id,
    array_agg(distinct crm.user_id order by crm.user_id) as members,
    c.created_at as chat_created_at,
    (
      select max(cm.created_at)
      from public.chat_messages cm
      where cm.chat_id = crm.chat_id
    ) as latest_message_at
  from public.chat_room_members crm
  join public.chats c on c.id = crm.chat_id
  where c.type = 'direct'
  group by crm.chat_id, c.created_at
  having count(distinct crm.user_id) = 2
) two_member_direct_rooms
where not exists (
  select 1
  from public.matches m
  where m.user1_id = least(two_member_direct_rooms.members[1], two_member_direct_rooms.members[2])
    and m.user2_id = greatest(two_member_direct_rooms.members[1], two_member_direct_rooms.members[2])
)
on conflict (user1_id, user2_id) do nothing;

-- Sanity log: how many rows we just inserted (visible in migration output).
do $$
declare
  v_legacy_remaining int;
begin
  select count(*)
  into v_legacy_remaining
  from (
    select crm.chat_id, array_agg(distinct crm.user_id order by crm.user_id) as members
    from public.chat_room_members crm
    join public.chats c on c.id = crm.chat_id
    where c.type = 'direct'
    group by crm.chat_id
    having count(distinct crm.user_id) = 2
  ) dp
  where not exists (
    select 1 from public.matches m
    where m.user1_id = dp.members[1] and m.user2_id = dp.members[2] and m.is_active = true
  );
  raise notice 'backfill_legacy_direct_match_rows: % legacy direct rooms still missing an active match row after backfill', v_legacy_remaining;
end;
$$;
