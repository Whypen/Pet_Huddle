create or replace function public.share_service_start_pin(p_chat_id uuid, p_requester_confirmed boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_pin text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_requester_confirmed, false) is not true then raise exception 'handoff_confirmation_required'; end if;

  select * into v_sc
  from public.service_chats
  where chat_id = p_chat_id
  for update;

  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.status <> 'booked' then raise exception 'invalid_status'; end if;
  if coalesce(v_sc.care_status, 'awaiting_handoff') not in ('awaiting_handoff', 'pin_shared') then
    raise exception 'invalid_care_status';
  end if;

  v_pin := lpad(floor(random() * 10000)::int::text, 4, '0');

  update public.service_chats
  set care_status = 'pin_shared',
      start_pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf')),
      pin_attempt_count = 0,
      pin_locked_until = null,
      pin_shared_at = now(),
      pin_shared_by = v_uid
  where id = v_sc.id;

  insert into public.service_care_events (service_chat_id, actor_id, event_type, metadata)
  values (
    v_sc.id,
    v_uid,
    'pin_shared',
    jsonb_build_object('pin_shared_at', now())
  );

  insert into public.chat_messages (chat_id, sender_id, content)
  values (
    p_chat_id,
    v_uid,
    jsonb_build_object('kind', 'service_pin_shared', 'pinSharedAt', now(), 'pin', v_pin)::text
  );

  update public.chats set last_message_at = now() where id = p_chat_id;

  perform public.service_notify(
    v_sc.provider_id,
    'service_pin_shared',
    'Start PIN received',
    'You''ve received the PIN to complete the check-in for your Care Session.',
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id, 'serviceChatId', v_sc.id)
  );

  return jsonb_build_object('pin', v_pin, 'pin_shared_at', now());
end;
$function$;

revoke all on function public.share_service_start_pin(uuid, boolean) from public, anon;
grant execute on function public.share_service_start_pin(uuid, boolean) to authenticated;
