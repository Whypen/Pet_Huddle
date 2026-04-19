create or replace function public.send_match_first_message(
  p_target_user_id uuid,
  p_target_name text default null,
  p_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_room_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_user_id is null then
    raise exception 'target_required';
  end if;

  if v_body = '' then
    raise exception 'message_required';
  end if;

  v_room_id := public.ensure_direct_chat_room(p_target_user_id, p_target_name);

  insert into public.chat_messages (chat_id, sender_id, content)
  values (v_room_id, v_actor_id, v_body);

  return v_room_id;
end;
$$;

grant execute on function public.send_match_first_message(uuid, text, text) to authenticated;
