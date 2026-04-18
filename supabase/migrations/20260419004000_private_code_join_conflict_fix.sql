create or replace function public.join_private_group_by_code(
  p_code text
)
returns table(
  chat_id uuid,
  chat_name text,
  room_code text,
  joined boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  v_chat public.chats%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_code !~ '^[A-Z0-9]{6}$' then
    return query select null::uuid, null::text, v_code, false, 'invalid_code'::text;
    return;
  end if;

  select c.*
    into v_chat
  from public.chats c
  where c.type = 'group'
    and c.visibility = 'private'
    and c.room_code = v_code
  limit 1;

  if not found then
    return query select null::uuid, null::text, v_code, false, 'invalid_code'::text;
    return;
  end if;

  insert into public.chat_room_members (chat_id, user_id)
  values (v_chat.id, auth.uid())
  on conflict do nothing;

  insert into public.chat_participants (chat_id, user_id, role)
  values (v_chat.id, auth.uid(), 'member')
  on conflict on constraint chat_participants_chat_id_user_id_key do nothing;

  return query select v_chat.id, v_chat.name, v_chat.room_code, true, null::text;
end;
$$;
