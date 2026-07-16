begin;

create or replace function public.finalize_service_care_agreement_for_payment_by_service_id(
  p_service_chat_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_scope_version_id uuid,
  p_scope_hash text,
  p_booking_snapshot jsonb,
  p_payment_status text default 'succeeded'
)
returns public.service_care_agreements
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then
    raise exception 'service_chat_not_found';
  end if;
  return public.finalize_service_care_agreement_for_payment(
    p_service_chat_id,
    p_checkout_session_id,
    p_payment_intent_id,
    p_scope_version_id,
    p_scope_hash,
    p_booking_snapshot,
    p_payment_status
  );
end;
$function$;

create or replace function public.confirm_voluntary_service_booking_by_service_id(
  p_service_chat_id uuid,
  p_requester_id uuid,
  p_booking_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then
    raise exception 'service_chat_not_found';
  end if;
  return public.confirm_voluntary_service_booking(p_service_chat_id, p_requester_id, p_booking_snapshot);
end;
$function$;

create or replace function public.notify_service_booking_confirmed_by_service_id(p_service_chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sc public.service_chats%rowtype;
  v_carer_name text;
  v_owner_name text;
  v_href text;
  v_owner_notification_id uuid;
  v_carer_notification_id uuid;
begin
  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if coalesce(v_sc.status, '') not in ('booked', 'in_progress', 'completed') then raise exception 'service_not_booked'; end if;

  v_href := '/chats?tab=service&room=' || v_sc.chat_id::text;
  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(full_name), ''), 'your carer')
  into v_carer_name from public.profiles where id = v_sc.provider_id;
  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(full_name), ''), 'the pet owner')
  into v_owner_name from public.profiles where id = v_sc.requester_id;
  v_carer_name := coalesce(v_carer_name, 'your carer');
  v_owner_name := coalesce(v_owner_name, 'the pet owner');

  if v_sc.requester_id is not null then
    select id into v_owner_notification_id
    from public.notifications
    where user_id = v_sc.requester_id
      and coalesce(data->>'kind', metadata->>'kind') = 'service_booked'
      and coalesce(data->>'serviceChatId', data->>'service_chat_id', metadata->>'serviceChatId', metadata->>'service_chat_id') = v_sc.id::text
    order by created_at desc nulls last, id desc
    limit 1;
    if v_owner_notification_id is null then
      v_owner_notification_id := public.service_notify(
        v_sc.requester_id,
        'service_booked',
        'Booking confirmed',
        'You''re all set! Your booking with ' || v_carer_name || ' is confirmed.',
        v_href,
        jsonb_build_object('chatId', v_sc.chat_id, 'serviceChatId', v_sc.id)
      );
    end if;
  end if;

  if v_sc.provider_id is not null then
    select id into v_carer_notification_id
    from public.notifications
    where user_id = v_sc.provider_id
      and coalesce(data->>'kind', metadata->>'kind') = 'service_booked'
      and coalesce(data->>'serviceChatId', data->>'service_chat_id', metadata->>'serviceChatId', metadata->>'service_chat_id') = v_sc.id::text
    order by created_at desc nulls last, id desc
    limit 1;
    if v_carer_notification_id is null then
      v_carer_notification_id := public.service_notify(
        v_sc.provider_id,
        'service_booked',
        'Booking confirmed',
        'New booking confirmed! You''re ready to care for ' || v_owner_name || '''s pets.',
        v_href,
        jsonb_build_object('chatId', v_sc.chat_id, 'serviceChatId', v_sc.id)
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'serviceChatId', v_sc.id,
    'ownerNotificationId', v_owner_notification_id,
    'carerNotificationId', v_carer_notification_id
  );
end;
$function$;

revoke all on function public.finalize_service_care_agreement_for_payment_by_service_id(uuid, text, text, uuid, text, jsonb, text) from public, anon;
revoke all on function public.confirm_voluntary_service_booking_by_service_id(uuid, uuid, jsonb) from public, anon;
revoke all on function public.notify_service_booking_confirmed_by_service_id(uuid) from public, anon;

grant execute on function public.finalize_service_care_agreement_for_payment_by_service_id(uuid, text, text, uuid, text, jsonb, text) to authenticated, service_role;
grant execute on function public.confirm_voluntary_service_booking_by_service_id(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.notify_service_booking_confirmed_by_service_id(uuid) to authenticated, service_role;

commit;
