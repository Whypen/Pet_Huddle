create or replace function public.get_native_chat_dialogue_snapshot(
  p_chat_id uuid,
  p_before_created_at timestamptz default null,
  p_limit int default 50
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  authorized as (
    select crm.chat_id
    from public.chat_room_members crm
    join viewer v on v.user_id = crm.user_id
    where crm.chat_id = p_chat_id
      and crm.deleted_at is null
      and crm.left_at is null
    limit 1
  ),
  room_row as (
    select
      c.id,
      c.type,
      c.name,
      c.avatar_url,
      c.created_by,
      c.created_at,
      c.updated_at,
      c.last_message_at,
      c.visibility,
      c.join_method,
      c.room_code,
      c.location_label,
      c.location_country,
      c.pet_focus,
      c.description
    from public.chats c
    join authorized a on a.chat_id = c.id
    where c.deleted_at is null
    limit 1
  ),
  member_rows as (
    select
      crm.chat_id,
      crm.user_id,
      crm.created_at,
      crm.role
    from public.chat_room_members crm
    join authorized a on a.chat_id = crm.chat_id
    where crm.deleted_at is null
      and crm.left_at is null
    order by crm.created_at asc nulls last, crm.user_id
    limit 100
  ),
  visible_messages as (
    select
      cm.id,
      cm.chat_id,
      cm.sender_id,
      cm.content,
      cm.created_at,
      null::timestamptz as updated_at
    from public.chat_messages cm
    join authorized a on a.chat_id = cm.chat_id
    where p_before_created_at is null
      or cm.created_at < p_before_created_at
    order by cm.created_at desc, cm.id desc
    limit greatest(0, least(coalesce(p_limit, 50), 100))
  ),
  ordered_messages as (
    select *
    from visible_messages
    order by created_at asc, id asc
  ),
  read_rows as (
    select distinct
      mr.message_id
    from public.message_reads mr
    join visible_messages vm on vm.id = mr.message_id
    join viewer v on true
    where vm.sender_id = v.user_id
      and mr.user_id <> v.user_id
  )
  select jsonb_build_object(
    'room', (select to_jsonb(r) from room_row r),
    'members', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at asc nulls last, m.user_id) from member_rows m), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at asc, m.id asc) from ordered_messages m), '[]'::jsonb),
    'read_message_ids', coalesce((select jsonb_agg(rr.message_id order by rr.message_id) from read_rows rr), '[]'::jsonb)
  )
  where exists (select 1 from room_row);
$$;

revoke all on function public.get_native_chat_dialogue_snapshot(uuid, timestamptz, int) from public, anon;
grant execute on function public.get_native_chat_dialogue_snapshot(uuid, timestamptz, int) to authenticated;
grant execute on function public.get_native_chat_dialogue_snapshot(uuid, timestamptz, int) to service_role;
