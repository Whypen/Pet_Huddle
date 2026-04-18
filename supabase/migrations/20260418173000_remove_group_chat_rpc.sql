create or replace function public.remove_group_chat(
  p_chat_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.chat_participants
    where chat_id = p_chat_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Not authorized';
  end if;

  delete from public.group_join_requests where chat_id = p_chat_id;
  delete from public.group_chat_invites where chat_id = p_chat_id;
  delete from public.message_reads
  where message_id in (
    select id
    from public.chat_messages
    where chat_id = p_chat_id
  );
  delete from public.chat_messages where chat_id = p_chat_id;
  delete from public.chat_room_members where chat_id = p_chat_id;
  delete from public.chat_participants where chat_id = p_chat_id;
  delete from public.chats where id = p_chat_id and type = 'group';
end;
$$;

grant execute on function public.remove_group_chat(uuid) to authenticated;
