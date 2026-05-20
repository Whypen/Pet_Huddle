create or replace function public.submit_service_checkin(
  p_chat_id uuid,
  p_start_pin text,
  p_photo_url text,
  p_provider_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_photo_url text := nullif(btrim(coalesce(p_photo_url, '')), '');
  v_pin text := btrim(coalesce(p_start_pin, ''));
  v_service_type text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_provider_confirmed, false) is not true then raise exception 'provider_confirmation_required'; end if;
  if v_photo_url is null then raise exception 'checkin_photo_required'; end if;
  if v_pin !~ '^[0-9]{4}$' then raise exception 'invalid_start_pin'; end if;

  select * into v_sc
  from public.service_chats
  where chat_id = p_chat_id
  for update;

  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.provider_id <> v_uid then raise exception 'not_provider'; end if;
  if v_sc.status <> 'booked' then raise exception 'invalid_status'; end if;
  if coalesce(v_sc.care_status, 'awaiting_handoff') <> 'pin_shared' then
    raise exception 'start_pin_not_shared';
  end if;
  if v_sc.pin_locked_until is not null and v_sc.pin_locked_until > now() then
    raise exception 'start_pin_temporarily_locked';
  end if;
  if v_sc.start_pin_hash is null or extensions.crypt(v_pin, v_sc.start_pin_hash) <> v_sc.start_pin_hash then
    update public.service_chats
    set pin_attempt_count = coalesce(pin_attempt_count, 0) + 1,
        pin_locked_until = case when coalesce(pin_attempt_count, 0) + 1 >= 5 then now() + interval '15 minutes' else pin_locked_until end
    where id = v_sc.id;
    raise exception 'invalid_start_pin';
  end if;

  update public.service_chats
  set care_status = 'in_progress',
      status = 'in_progress',
      in_progress_at = coalesce(in_progress_at, now()),
      checkin_submitted_at = now(),
      checkin_photo_url = v_photo_url,
      pin_attempt_count = 0,
      pin_locked_until = null
  where id = v_sc.id;

  insert into public.service_care_events (service_chat_id, actor_id, event_type, media_urls, metadata)
  values (
    v_sc.id,
    v_uid,
    'check_in',
    jsonb_build_array(v_photo_url),
    jsonb_build_object('pin_validated', true, 'provider_confirmed', true)
  );

  insert into public.chat_messages (chat_id, sender_id, content)
  values (
    p_chat_id,
    v_uid,
    jsonb_build_object('kind', 'service_check_in', 'photoUrl', v_photo_url)::text
  );

  update public.chats set last_message_at = now() where id = p_chat_id;

  v_service_type := coalesce(nullif(trim(v_sc.request_card->>'serviceType'), ''), 'service');

  perform public.service_notify(
    v_sc.requester_id,
    'service_started',
    'Care started',
    'Care session started. All safety protocols are active for your booking.',
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id, 'serviceType', v_service_type)
  );

  perform public.service_notify(
    v_sc.provider_id,
    'service_started',
    'Care started',
    'Care session started! Share regular photos in this chat to document the session and give the owner peace of mind!',
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id, 'serviceType', v_service_type)
  );

  return jsonb_build_object('care_status', 'in_progress', 'checkin_submitted_at', now());
end;
$function$;

revoke all on function public.submit_service_checkin(uuid, text, text, boolean) from public, anon;
grant execute on function public.submit_service_checkin(uuid, text, text, boolean) to authenticated;
