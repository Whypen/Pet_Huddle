begin;

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
    values (p_chat_id, v_uid, jsonb_build_object('kind', 'service_issue_reported', 'reason', v_reason)::text);
  else
    insert into public.chat_messages (chat_id, sender_id, content)
    values (p_chat_id, v_uid, jsonb_build_object('kind', 'service_issue_reported', 'reason', v_reason)::text);
  end if;

  update public.chats set last_message_at = now() where id = p_chat_id;

  return jsonb_build_object('ok', true, 'under_dispute', v_dispute_reason);
end;
$function$;

commit;
