begin;

-- Completion is an exact-booking transition. Care-update preferences remain
-- visible compliance evidence and reminders, but never block either party from
-- confirming, mutual completion, forced completion, or payout.
create or replace function public.complete_service_if_both_confirmed_by_service_id(p_service_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_sc
  from public.service_chats
  where id = p_service_chat_id
  for update;

  if not found then raise exception 'service_chat_not_found'; end if;
  if v_uid not in (v_sc.requester_id, v_sc.provider_id) then raise exception 'not_participant'; end if;

  if v_sc.care_status = 'in_progress'
     and public.service_chat_has_valid_checkin(v_sc.id)
     and coalesce(v_sc.requester_mark_finished, false)
     and coalesce(v_sc.provider_mark_finished, false) then
    update public.service_chats
    set care_status = 'completed',
        status = 'completed',
        completed_at = coalesce(completed_at, now()),
        payout_release_requested_at = coalesce(payout_release_requested_at, now()),
        payout_release_attempted_at = null,
        payout_release_lock_token = null,
        payout_release_locked_at = null
    where id = v_sc.id;

    insert into public.chat_messages(chat_id, sender_id, content)
    values (v_sc.chat_id, v_sc.provider_id, '{"kind":"service_completed"}');

    update public.chats set last_message_at = now() where id = v_sc.chat_id;

    perform public.service_notify(
      v_sc.requester_id,
      'service_completed',
      'Care completed',
      'Hope your pets had a great time! Please share your experience by leaving a review for your carer.',
      '/chats?tab=service&room=' || v_sc.chat_id::text,
      jsonb_build_object('chatId', v_sc.chat_id, 'serviceChatId', v_sc.id)
    );

    perform public.service_notify(
      v_sc.provider_id,
      'service_completed',
      'Care completed',
      'Great work! Please share your experience by leaving a review for the owner. Your payout is on its way -- payments are released after both sides confirm completion.',
      '/chats?tab=service&room=' || v_sc.chat_id::text,
      jsonb_build_object('chatId', v_sc.chat_id, 'serviceChatId', v_sc.id)
    );
  end if;
end;
$function$;

create or replace function public.submit_provider_completion_by_service_id(
  p_service_chat_id uuid,
  p_confirmed_completed boolean,
  p_no_unresolved_safety_concerns boolean,
  p_understands_review boolean,
  p_photo_url text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_media jsonb := '[]'::jsonb;
  v_update_kind text;
  v_update_met boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_confirmed_completed, false) is not true then raise exception 'completion_confirmation_required'; end if;
  if coalesce(p_no_unresolved_safety_concerns, false) is not true then raise exception 'safety_confirmation_required'; end if;
  if coalesce(p_understands_review, false) is not true then raise exception 'completion_review_confirmation_required'; end if;

  select * into v_sc from public.service_chats where id = p_service_chat_id for update;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.provider_id <> v_uid then raise exception 'not_provider'; end if;
  if v_sc.care_status <> 'in_progress' or not public.service_chat_has_valid_checkin(v_sc.id) then raise exception 'checkin_required'; end if;

  v_update_kind := public.service_care_update_kind(coalesce(v_sc.request_card, '{}'::jsonb));
  v_update_met := public.service_chat_care_update_requirement_met(v_sc.id);
  if nullif(btrim(coalesce(p_photo_url, '')), '') is not null then
    v_media := jsonb_build_array(nullif(btrim(p_photo_url), ''));
  end if;

  update public.service_chats set provider_mark_finished = true where id = v_sc.id;

  insert into public.service_care_events(service_chat_id, actor_id, event_type, note, media_urls, metadata)
  values (
    v_sc.id,
    v_uid,
    'provider_completion',
    nullif(btrim(coalesce(p_note, '')), ''),
    v_media,
    jsonb_build_object(
      'confirmed_completed', true,
      'no_unresolved_safety_concerns', true,
      'understands_review', true,
      'care_update_kind', v_update_kind,
      'care_update_met', v_update_met
    )
  );

  perform public.complete_service_if_both_confirmed_by_service_id(v_sc.id);

  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if v_sc.care_status <> 'completed'
     and coalesce(v_sc.requester_mark_finished, false) is not true
     and v_sc.requester_id is not null then
    perform public.service_notify(
      v_sc.requester_id,
      'service_completion_requested',
      'Care completion ready',
      'Your carer marked the session complete. Please confirm when your pet is safely back.',
      '/chats?tab=service&room=' || v_sc.chat_id::text,
      jsonb_build_object('chatId', v_sc.chat_id, 'serviceChatId', v_sc.id)
    );
  end if;

  return jsonb_build_object('ok', true, 'care_update_kind', v_update_kind, 'care_update_met', v_update_met);
end;
$function$;

create or replace function public.submit_requester_completion_by_service_id(
  p_service_chat_id uuid,
  p_confirmed_completed boolean,
  p_understands_payout_review boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_confirmed_completed, false) is not true then raise exception 'completion_confirmation_required'; end if;
  if coalesce(p_understands_payout_review, false) is not true then raise exception 'payout_review_confirmation_required'; end if;

  select * into v_sc from public.service_chats where id = p_service_chat_id for update;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.care_status <> 'in_progress' or not public.service_chat_has_valid_checkin(v_sc.id) then raise exception 'checkin_required'; end if;

  update public.service_chats set requester_mark_finished = true where id = v_sc.id;

  insert into public.service_care_events(service_chat_id, actor_id, event_type, note, metadata)
  values (
    v_sc.id,
    v_uid,
    'requester_completion',
    nullif(btrim(coalesce(p_note, '')), ''),
    jsonb_build_object('confirmed_completed', true, 'understands_payout_review', true)
  );

  perform public.complete_service_if_both_confirmed_by_service_id(v_sc.id);

  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if v_sc.care_status <> 'completed'
     and coalesce(v_sc.provider_mark_finished, false) is not true
     and v_sc.provider_id is not null then
    perform public.service_notify(
      v_sc.provider_id,
      'service_completion_pending',
      'Confirm to get paid',
      'The owner confirmed care is complete. Confirm your side to release your payout.',
      '/chats?tab=service&room=' || v_sc.chat_id::text,
      jsonb_build_object('chatId', v_sc.chat_id, 'serviceChatId', v_sc.id)
    );
  end if;

  return jsonb_build_object('requester_mark_finished', true);
end;
$function$;

create or replace function public.withdraw_service_request_by_service_id(p_service_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_current public.care_scope_versions%rowtype;
  v_requester_name text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_sc from public.service_chats where id = p_service_chat_id for update;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.status <> 'pending' then raise exception 'invalid_status'; end if;

  perform public.expire_stale_care_scope_payment_lock(v_sc.id);
  select * into v_current
  from public.care_scope_versions
  where service_chat_id = v_sc.id and is_active
  for update;
  if found and v_current.payment_status in ('creating', 'pending') then
    raise exception 'care_scope_payment_pending';
  end if;

  select coalesce(nullif(trim(display_name), ''), 'Someone')
  into v_requester_name
  from public.profiles
  where id = v_uid;

  update public.service_chats
  set request_card = null,
      quote_card = null,
      request_sent_at = null,
      quote_sent_at = null,
      booking_snapshot_pending = null,
      requester_mark_finished = false,
      provider_mark_finished = false,
      updated_at = now()
  where id = v_sc.id;

  update public.care_scope_versions
  set is_active = false,
      payment_scope_conflict_reason = coalesce(payment_scope_conflict_reason, 'service_request_withdrawn')
  where service_chat_id = v_sc.id and is_active;

  insert into public.chat_messages(chat_id, sender_id, content)
  values (
    v_sc.chat_id,
    v_uid,
    json_build_object('kind', 'service_request_withdrawn', 'text', 'You withdrew the request.')::text
  );

  update public.chats set last_message_at = now() where id = v_sc.chat_id;

  perform public.service_notify(
    v_sc.provider_id,
    'service_request_withdrawn',
    'Request withdrawn',
    v_requester_name || ' cancelled this request.',
    '/chats?tab=service&room=' || v_sc.chat_id::text,
    jsonb_build_object('chatId', v_sc.chat_id, 'serviceChatId', v_sc.id, 'requesterId', v_uid)
  );
end;
$function$;

revoke all on function public.complete_service_if_both_confirmed_by_service_id(uuid) from public, anon;
revoke all on function public.submit_provider_completion_by_service_id(uuid, boolean, boolean, boolean, text, text) from public, anon;
revoke all on function public.submit_requester_completion_by_service_id(uuid, boolean, boolean, text) from public, anon;
revoke all on function public.withdraw_service_request_by_service_id(uuid) from public, anon;

grant execute on function public.complete_service_if_both_confirmed_by_service_id(uuid) to authenticated, service_role;
grant execute on function public.submit_provider_completion_by_service_id(uuid, boolean, boolean, boolean, text, text) to authenticated, service_role;
grant execute on function public.submit_requester_completion_by_service_id(uuid, boolean, boolean, text) to authenticated, service_role;
grant execute on function public.withdraw_service_request_by_service_id(uuid) to authenticated, service_role;

commit;
