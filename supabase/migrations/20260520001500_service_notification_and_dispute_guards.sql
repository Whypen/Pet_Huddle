create or replace function public.notify_service_booking_confirmed(p_chat_id uuid)
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
  select *
    into v_sc
  from public.service_chats
  where chat_id = p_chat_id
  limit 1;

  if not found then
    raise exception 'service_chat_not_found';
  end if;

  if coalesce(v_sc.status, '') not in ('booked', 'in_progress', 'completed') then
    raise exception 'service_not_booked';
  end if;

  v_href := '/chats?tab=service&room=' || p_chat_id::text;

  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(full_name), ''), 'your carer')
    into v_carer_name
  from public.profiles
  where id = v_sc.provider_id;

  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(full_name), ''), 'the pet owner')
    into v_owner_name
  from public.profiles
  where id = v_sc.requester_id;

  v_carer_name := coalesce(v_carer_name, 'your carer');
  v_owner_name := coalesce(v_owner_name, 'the pet owner');

  if v_sc.requester_id is not null then
    select id
      into v_owner_notification_id
    from public.notifications
    where user_id = v_sc.requester_id
      and coalesce(data->>'kind', metadata->>'kind') = 'service_booked'
      and coalesce(data->>'chatId', data->>'chat_id', metadata->>'chatId', metadata->>'chat_id') = p_chat_id::text
    order by created_at desc nulls last, id desc
    limit 1;

    if v_owner_notification_id is null then
      v_owner_notification_id := public.service_notify(
        v_sc.requester_id,
        'service_booked',
        'Booking confirmed',
        'You''re all set! Your booking with ' || v_carer_name || ' is confirmed.',
        v_href,
        jsonb_build_object('chatId', p_chat_id, 'serviceChatId', v_sc.id)
      );
    end if;
  end if;

  if v_sc.provider_id is not null then
    select id
      into v_carer_notification_id
    from public.notifications
    where user_id = v_sc.provider_id
      and coalesce(data->>'kind', metadata->>'kind') = 'service_booked'
      and coalesce(data->>'chatId', data->>'chat_id', metadata->>'chatId', metadata->>'chat_id') = p_chat_id::text
    order by created_at desc nulls last, id desc
    limit 1;

    if v_carer_notification_id is null then
      v_carer_notification_id := public.service_notify(
        v_sc.provider_id,
        'service_booked',
        'Booking confirmed',
        'New booking confirmed! You''re ready to care for ' || v_owner_name || '''s pets.',
        v_href,
        jsonb_build_object('chatId', p_chat_id, 'serviceChatId', v_sc.id)
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'ownerNotificationId', v_owner_notification_id,
    'carerNotificationId', v_carer_notification_id
  );
end;
$function$;

revoke all on function public.notify_service_booking_confirmed(uuid) from public, anon;
grant execute on function public.notify_service_booking_confirmed(uuid) to authenticated, service_role;

create or replace function public.notify_service_midcare_photo_reminder(p_chat_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_existing uuid;
  v_href text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
    into v_sc
  from public.service_chats
  where chat_id = p_chat_id
  limit 1;

  if not found then
    raise exception 'service_chat_not_found';
  end if;

  if v_sc.provider_id <> v_uid then
    raise exception 'not_service_provider';
  end if;

  if coalesce(v_sc.status, '') = 'disputed' or coalesce(v_sc.care_status, '') = 'under_dispute' then
    raise exception 'service_under_review';
  end if;

  if coalesce(v_sc.care_status, '') <> 'in_progress' and coalesce(v_sc.status, '') <> 'in_progress' then
    raise exception 'service_not_in_progress';
  end if;

  select id
    into v_existing
  from public.notifications
  where user_id = v_sc.provider_id
    and coalesce(data->>'kind', metadata->>'kind') = 'service_midcare_photo_reminder'
    and coalesce(data->>'chatId', data->>'chat_id', data->>'service_chat_id', metadata->>'chatId', metadata->>'chat_id', metadata->>'service_chat_id') = p_chat_id::text
  order by created_at desc nulls last, id desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  v_href := '/chats?tab=service&room=' || p_chat_id::text;

  return public.service_notify(
    v_sc.provider_id,
    'service_midcare_photo_reminder',
    'Send a quick update?',
    'Pet parents love a photo during care.',
    v_href,
    jsonb_build_object(
      'chatId', p_chat_id,
      'serviceChatId', v_sc.id,
      'care_status', v_sc.care_status
    )
  );
end;
$function$;

revoke all on function public.notify_service_midcare_photo_reminder(uuid) from public, anon;
grant execute on function public.notify_service_midcare_photo_reminder(uuid) to authenticated;

create or replace function public.submit_service_issue_report(
  p_chat_id uuid,
  p_reason text,
  p_note text,
  p_acknowledged_review boolean,
  p_evidence_urls text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_other_party_id uuid;
  v_dispute_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_reason is null then raise exception 'issue_reason_required'; end if;
  if v_note is null then raise exception 'issue_note_required'; end if;
  if coalesce(p_acknowledged_review, false) is not true then raise exception 'issue_review_acknowledgement_required'; end if;

  select * into v_sc from public.service_chats where chat_id = p_chat_id for update;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid and v_sc.provider_id <> v_uid then raise exception 'not_participant'; end if;
  if coalesce(v_sc.care_status, 'awaiting_handoff') not in ('awaiting_handoff', 'pin_shared', 'in_progress', 'completed', 'under_dispute') then
    raise exception 'invalid_care_status';
  end if;

  v_other_party_id := case when v_uid = v_sc.requester_id then v_sc.provider_id else v_sc.requester_id end;

  insert into public.service_care_events (service_chat_id, actor_id, event_type, note, media_urls, metadata)
  values (
    v_sc.id,
    v_uid,
    'dispute_evidence',
    v_note,
    to_jsonb(coalesce(p_evidence_urls, '{}'::text[])),
    jsonb_build_object(
      'reason',
      v_reason,
      'status',
      'under_review',
      'unresolved',
      true,
      'under_review',
      true
    )
  );

  if coalesce(v_sc.status, '') <> 'disputed' or coalesce(v_sc.care_status, '') <> 'under_dispute' then
    insert into public.service_disputes (
      service_chat_id,
      filed_by,
      category,
      description,
      evidence_urls,
      status
    )
    values (
      v_sc.id,
      v_uid,
      v_reason,
      v_note,
      coalesce(p_evidence_urls, '{}'::text[]),
      'open'
    )
    returning id into v_dispute_id;

    update public.service_chats
    set care_status = 'under_dispute',
        status = 'disputed',
        disputed_at = coalesce(disputed_at, now()),
        payout_release_requested_at = null,
        payout_release_lock_token = null,
        payout_release_locked_at = null
    where id = v_sc.id;

    insert into public.chat_messages (chat_id, sender_id, content)
    values (p_chat_id, v_uid, jsonb_build_object('kind', 'service_disputed', 'reason', v_reason)::text);

    perform public.service_notify(
      v_uid,
      'service_disputed',
      'Issue flagged',
      'We hear your concern and we are looking into this for you.',
      '/chats?tab=service&room=' || p_chat_id::text,
      jsonb_build_object('chatId', p_chat_id, 'serviceChatId', v_sc.id, 'serviceDisputeId', v_dispute_id, 'raisedByCurrentUser', true)
    );

    if v_other_party_id is not null then
      perform public.service_notify(
        v_other_party_id,
        'service_disputed',
        'Issue flagged',
        'A concern has been flagged regarding this session. Our team is reviewing the details and will be in touch.',
        '/chats?tab=service&room=' || p_chat_id::text,
        jsonb_build_object('chatId', p_chat_id, 'serviceChatId', v_sc.id, 'serviceDisputeId', v_dispute_id, 'raisedByCurrentUser', false)
      );
    end if;
  end if;

  update public.chats set last_message_at = now() where id = p_chat_id;

  return jsonb_build_object('ok', true, 'under_dispute', true, 'service_dispute_id', v_dispute_id);
end;
$function$;

revoke all on function public.submit_service_issue_report(uuid, text, text, boolean, text[]) from public, anon;
grant execute on function public.submit_service_issue_report(uuid, text, text, boolean, text[]) to authenticated;
