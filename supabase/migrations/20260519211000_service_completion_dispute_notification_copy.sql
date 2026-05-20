create or replace function public.complete_service_if_both_confirmed(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sc public.service_chats%rowtype;
begin
  select * into v_sc
  from public.service_chats
  where chat_id = p_chat_id
  for update;

  if not found then
    raise exception 'service_chat_not_found';
  end if;

  if v_sc.care_status = 'in_progress'
     and public.service_chat_has_valid_checkin(v_sc.id)
     and v_sc.requester_mark_finished
     and v_sc.provider_mark_finished then
    update public.service_chats
    set care_status = 'completed',
        status = 'completed',
        completed_at = coalesce(completed_at, now()),
        payout_release_requested_at = coalesce(payout_release_requested_at, now()),
        payout_release_attempted_at = null,
        payout_release_lock_token = null,
        payout_release_locked_at = null
    where id = v_sc.id;

    insert into public.chat_messages (chat_id, sender_id, content)
    values (p_chat_id, v_sc.provider_id, '{"kind":"service_completed"}');

    update public.chats set last_message_at = now() where id = p_chat_id;

    perform public.service_notify(
      v_sc.requester_id,
      'service_completed',
      'Care completed',
      'Hope your pets had a great time! Please share your experience by leaving a review for your carer.',
      '/chats?tab=service&room=' || p_chat_id::text,
      jsonb_build_object('chatId', p_chat_id, 'serviceChatId', v_sc.id)
    );

    perform public.service_notify(
      v_sc.provider_id,
      'service_completed',
      'Care completed',
      'Great work! Please share your experience by leaving a review for the owner. Your payment will be processed 48 hours after their confirmation.',
      '/chats?tab=service&room=' || p_chat_id::text,
      jsonb_build_object('chatId', p_chat_id, 'serviceChatId', v_sc.id)
    );
  end if;
end;
$function$;

revoke all on function public.complete_service_if_both_confirmed(uuid) from public, anon;
grant execute on function public.complete_service_if_both_confirmed(uuid) to authenticated, service_role;

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
  v_dispute_reason boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_reason is null then raise exception 'issue_reason_required'; end if;
  if v_note is null then raise exception 'issue_note_required'; end if;
  if coalesce(p_acknowledged_review, false) is not true then raise exception 'issue_review_acknowledgement_required'; end if;

  select * into v_sc from public.service_chats where chat_id = p_chat_id for update;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid and v_sc.provider_id <> v_uid then raise exception 'not_participant'; end if;
  if coalesce(v_sc.care_status, 'awaiting_handoff') not in ('awaiting_handoff', 'pin_shared', 'in_progress', 'completed') then
    raise exception 'invalid_care_status';
  end if;

  v_dispute_reason := lower(v_reason) like any (array[
    '%safety%',
    '%injury%',
    '%illness%',
    '%payment%',
    '%refund%',
    '%did not arrive%',
    '%did not hand off%'
  ]);

  insert into public.service_care_events (service_chat_id, actor_id, event_type, note, media_urls, metadata)
  values (
    v_sc.id,
    v_uid,
    case when v_dispute_reason then 'dispute_evidence' else 'issue_report' end,
    v_note,
    to_jsonb(coalesce(p_evidence_urls, '{}'::text[])),
    jsonb_build_object(
      'reason',
      v_reason,
      'status',
      case when v_dispute_reason then 'under_review' else 'open' end,
      'unresolved',
      true,
      'under_review',
      v_dispute_reason
    )
  );

  if v_dispute_reason then
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
      jsonb_build_object('chatId', p_chat_id, 'serviceChatId', v_sc.id, 'raisedByCurrentUser', true)
    );

    perform public.service_notify(
      case when v_uid = v_sc.requester_id then v_sc.provider_id else v_sc.requester_id end,
      'service_disputed',
      'Issue flagged',
      'A concern has been flagged regarding this session. Our team is reviewing the details and will be in touch.',
      '/chats?tab=service&room=' || p_chat_id::text,
      jsonb_build_object('chatId', p_chat_id, 'serviceChatId', v_sc.id, 'raisedByCurrentUser', false)
    );
  else
    insert into public.chat_messages (chat_id, sender_id, content)
    values (p_chat_id, v_uid, jsonb_build_object('kind', 'service_issue_reported', 'reason', v_reason)::text);
  end if;

  update public.chats set last_message_at = now() where id = p_chat_id;

  return jsonb_build_object('ok', true, 'under_dispute', v_dispute_reason);
end;
$function$;

revoke all on function public.submit_service_issue_report(uuid, text, text, boolean, text[]) from public, anon;
grant execute on function public.submit_service_issue_report(uuid, text, text, boolean, text[]) to authenticated;
