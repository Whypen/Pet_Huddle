do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_disputes'
      and column_name = 'filed_by'
  ) then
    raise exception 'service_disputes_filed_by_missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_reviews'
      and column_name = 'service_dispute_id'
  ) then
    raise exception 'service_reviews_service_dispute_id_missing';
  end if;
end $$;

create or replace function public.submit_service_review_v2(
  p_chat_id uuid,
  p_rating integer,
  p_tags text[],
  p_review_text text,
  p_media_urls text[] default '{}'::text[],
  p_safety_incident_reported boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_reviewer_role text;
  v_reviewee_id uuid;
  v_review_id uuid;
  v_dispute_id uuid;
  v_media_urls text[] := coalesce(p_media_urls, '{}'::text[]);
  v_review_text text := nullif(btrim(coalesce(p_review_text, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_sc
  from public.service_chats
  where chat_id = p_chat_id
  for update;

  if v_sc.id is null then
    raise exception 'service_chat_not_found';
  end if;

  if v_sc.status not in ('completed', 'disputed') then
    raise exception 'service_not_completed';
  end if;

  if v_sc.requester_id = v_uid then
    v_reviewer_role := 'requester';
    v_reviewee_id := v_sc.provider_id;
  elsif v_sc.provider_id = v_uid then
    v_reviewer_role := 'provider';
    v_reviewee_id := v_sc.requester_id;
  else
    raise exception 'not_service_participant';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  if coalesce(p_safety_incident_reported, false) and v_review_text is null then
    raise exception 'safety_review_text_required';
  end if;

  if coalesce(p_safety_incident_reported, false) and exists (
    select 1
    from public.service_disputes sd
    where sd.service_chat_id = v_sc.id
      and sd.filed_by = v_uid
  ) then
    raise exception 'service_dispute_already_reported_by_user';
  end if;

  insert into public.service_reviews (
    service_chat_id,
    reviewer_id,
    provider_id,
    rating,
    tags,
    review_text,
    reviewer_role,
    reviewee_id,
    media_urls,
    eligible_for_provider_rating,
    safety_incident_reported
  )
  values (
    v_sc.id,
    v_uid,
    v_sc.provider_id,
    p_rating,
    coalesce(p_tags, '{}'::text[]),
    v_review_text,
    v_reviewer_role,
    v_reviewee_id,
    v_media_urls,
    v_reviewer_role = 'requester',
    coalesce(p_safety_incident_reported, false)
  )
  returning id into v_review_id;

  if coalesce(p_safety_incident_reported, false) then
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
      'Safety incident from review',
      v_review_text,
      v_media_urls,
      'open'
    )
    returning id into v_dispute_id;

    update public.service_reviews
    set service_dispute_id = v_dispute_id
    where id = v_review_id;

    update public.service_chats
    set status = 'disputed',
        care_status = 'under_dispute',
        disputed_at = coalesce(disputed_at, now()),
        payout_release_requested_at = null,
        payout_release_lock_token = null,
        payout_release_locked_at = null,
        updated_at = now()
    where id = v_sc.id
      and payout_released_at is null;
  end if;

  return jsonb_build_object(
    'review_id', v_review_id,
    'reviewer_role', v_reviewer_role,
    'safety_dispute_id', v_dispute_id
  );
end;
$$;

revoke all on function public.submit_service_review_v2(uuid, integer, text[], text, text[], boolean) from public, anon;
grant execute on function public.submit_service_review_v2(uuid, integer, text[], text, text[], boolean) to authenticated;

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
  v_was_under_dispute boolean := false;
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

  if exists (
    select 1
    from public.service_disputes sd
    where sd.service_chat_id = v_sc.id
      and sd.filed_by = v_uid
  ) then
    raise exception 'service_dispute_already_reported_by_user';
  end if;

  v_other_party_id := case when v_uid = v_sc.requester_id then v_sc.provider_id else v_sc.requester_id end;
  v_was_under_dispute := coalesce(v_sc.status, '') = 'disputed' or coalesce(v_sc.care_status, '') = 'under_dispute';

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
      payout_release_locked_at = null,
      updated_at = now()
  where id = v_sc.id;

  if not v_was_under_dispute then
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
