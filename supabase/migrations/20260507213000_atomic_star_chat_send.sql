-- Atomically consume a Star and write the star intro message.
-- If room creation or message insert fails, the quota update rolls back with the transaction.

create or replace function public.send_star_chat_atomic(
  p_target_user_id uuid,
  p_target_name text default null,
  p_content text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_room_id uuid;
  v_content text := nullif(trim(coalesce(p_content, '')), '');
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_user_id is null then
    raise exception 'target_required';
  end if;

  if v_content is null then
    raise exception 'content_required';
  end if;

  if public.check_and_increment_quota('star') is not true then
    return null;
  end if;

  v_room_id := public.ensure_star_direct_chat_room(p_target_user_id, p_target_name);

  insert into public.chat_messages (chat_id, sender_id, content)
  values (v_room_id, v_actor_id, v_content);

  return v_room_id;
end;
$$;

revoke all on function public.send_star_chat_atomic(uuid, text, text) from anon;
grant execute on function public.send_star_chat_atomic(uuid, text, text) to authenticated;
grant execute on function public.send_star_chat_atomic(uuid, text, text) to service_role;
