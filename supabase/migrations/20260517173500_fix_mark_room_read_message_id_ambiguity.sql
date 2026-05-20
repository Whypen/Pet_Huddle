create or replace function public.mark_room_read(
  p_chat_id uuid,
  p_visible_message_id uuid default null,
  p_visible_before timestamptz default null
)
returns table(
  id uuid,
  chat_id uuid,
  message_id uuid,
  user_id uuid,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.chat_room_members crm
    where crm.chat_id = p_chat_id
      and crm.user_id = v_uid
  ) then
    raise exception 'chat_membership_required';
  end if;

  return query
  insert into public.message_reads(chat_id, message_id, user_id, read_at)
  select cm.chat_id, cm.id, v_uid, now()
  from public.chat_messages cm
  where cm.chat_id = p_chat_id
    and cm.sender_id <> v_uid
    and (
      p_visible_message_id is null
      or cm.created_at <= coalesce(
        (select cutoff.created_at from public.chat_messages cutoff where cutoff.id = p_visible_message_id and cutoff.chat_id = p_chat_id),
        cm.created_at
      )
    )
    and (p_visible_before is null or cm.created_at <= p_visible_before)
  on conflict on constraint message_reads_message_id_user_id_key
  do update set read_at = excluded.read_at, chat_id = excluded.chat_id
  returning public.message_reads.id,
    public.message_reads.chat_id,
    public.message_reads.message_id,
    public.message_reads.user_id,
    public.message_reads.read_at;
end;
$$;

revoke all on function public.mark_room_read(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.mark_room_read(uuid, uuid, timestamptz) to authenticated;
