create or replace function public.service_dispute_review_copy(
  p_viewer_role text,
  p_is_reporter boolean,
  p_outcome text,
  p_amount text default null
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $function$
declare
  v_role text := lower(trim(coalesce(p_viewer_role, '')));
  v_outcome text := lower(trim(coalesce(p_outcome, '')));
  v_amount text := nullif(trim(coalesce(p_amount, '')), '');
  v_opening text;
  v_body text;
  v_closing text;
  v_went_against_viewer boolean := false;
begin
  if v_role not in ('owner', 'carer') then
    raise exception 'invalid_viewer_role';
  end if;

  if v_outcome not in ('full_release_to_carer', 'partial_refund', 'full_refund_to_owner') then
    raise exception 'invalid_review_outcome';
  end if;

  v_opening := case
    when coalesce(p_is_reporter, false) then 'We’re sorry this booking didn’t go as planned.'
    else 'The review is complete.'
  end;

  if v_outcome = 'full_release_to_carer' then
    v_body := case
      when v_role = 'owner' then 'After review, the booking payment has been approved for release to the carer.'
      else 'After review, the booking payment has been approved for release to your connected payout account.'
    end;
    v_went_against_viewer := v_role = 'owner';
  elsif v_outcome = 'partial_refund' then
    v_body := case
      when v_role = 'owner' and v_amount is not null then 'A partial refund of ' || v_amount || ' has been issued to your original payment method.'
      when v_role = 'carer' and v_amount is not null then v_amount || ' has been approved for release to your connected payout account.'
      when v_role = 'owner' then 'A partial refund has been issued to your original payment method.'
      else 'A remaining payout has been approved for release to your connected payout account.'
    end;
  else
    v_body := case
      when v_role = 'owner' then 'A full refund has been issued to your original payment method.'
      else 'The booking payment will not be released for this booking.'
    end;
    v_went_against_viewer := v_role = 'carer';
  end if;

  v_closing := case
    when coalesce(p_is_reporter, false) then 'We appreciate your patience while we reviewed this.'
    when v_went_against_viewer then 'We understand this may be disappointing, and appreciate your cooperation.'
    else 'Thank you for your cooperation.'
  end;

  return jsonb_build_object(
    'dialogue_system_status', 'Review completed. This booking is now closed.',
    'push_body', 'Booking review updated. Tap to view the update from huddle.',
    'in_app_body', 'Your booking review is ready. Tap to view the update.',
    'team_huddle_message', v_opening || ' ' || v_body || ' ' || v_closing,
    'opening', v_opening,
    'outcome_body', v_body,
    'closing', v_closing,
    'outcome_went_against_viewer', v_went_against_viewer
  );
end;
$function$;

create or replace view public.service_dispute_review_copy_examples as
with roles(viewer_role) as (
  values ('owner'), ('carer')
),
reporters(is_reporter) as (
  values (true), (false)
),
outcomes(outcome) as (
  values ('full_release_to_carer'), ('partial_refund'), ('full_refund_to_owner')
)
select
  roles.viewer_role,
  reporters.is_reporter,
  outcomes.outcome,
  public.service_dispute_review_copy(
    roles.viewer_role,
    reporters.is_reporter,
    outcomes.outcome,
    'HKD 50.00'
  )->>'team_huddle_message' as team_huddle_message
from roles
cross join reporters
cross join outcomes;

create or replace function public.format_service_dispute_review_amount(
  p_amount numeric,
  p_currency text
)
returns text
language plpgsql
immutable
set search_path = public
as $function$
declare
  v_currency text := upper(trim(coalesce(p_currency, 'HKD')));
begin
  if p_amount is null then
    return null;
  end if;

  return v_currency || ' ' || to_char(p_amount, 'FM999999990.00');
end;
$function$;

create or replace function public.service_dispute_review_outcome_from_status(p_status text)
returns text
language plpgsql
immutable
set search_path = public
as $function$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if v_status = 'resolved_release_full' then
    return 'full_release_to_carer';
  elsif v_status = 'resolved_partial_refund' then
    return 'partial_refund';
  elsif v_status = 'resolved_refund_full' then
    return 'full_refund_to_owner';
  end if;

  return null;
end;
$function$;

create or replace function public.ensure_team_huddle_direct_message(
  p_case_id text,
  p_recipient_user_id uuid,
  p_recipient_role text,
  p_message_body text,
  p_idempotency_key text,
  p_notification_body text,
  p_push_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_team_huddle_user_id constant uuid := '8f55ab31-6b25-4d1a-98c7-3a6e8af2d941';
  v_chat_id uuid;
  v_message_id uuid;
  v_notification_id text;
  v_notification_href text;
begin
  if p_recipient_user_id is null then
    raise exception 'recipient_required';
  end if;

  select t.message_id
  into v_message_id
  from public.team_huddle_case_messages t
  where t.idempotency_key = p_idempotency_key
  limit 1;

  if v_message_id is not null then
    return v_message_id;
  end if;

  select c.id
  into v_chat_id
  from public.chats c
  where lower(coalesce(c.type, '')) = 'direct'
    and exists (select 1 from public.chat_room_members crm where crm.chat_id = c.id and crm.user_id = v_team_huddle_user_id)
    and exists (select 1 from public.chat_room_members crm where crm.chat_id = c.id and crm.user_id = p_recipient_user_id)
    and (select count(*) from public.chat_room_members crm where crm.chat_id = c.id) = 2
  order by c.updated_at desc nulls last, c.created_at desc nulls last
  limit 1;

  if v_chat_id is null then
    insert into public.chats (type, created_by, name, created_at, updated_at, last_message_at)
    values ('direct', v_team_huddle_user_id, null, now(), now(), now())
    returning id into v_chat_id;

    insert into public.chat_room_members (chat_id, user_id, created_at)
    values
      (v_chat_id, v_team_huddle_user_id, now()),
      (v_chat_id, p_recipient_user_id, now())
    on conflict do nothing;
  end if;

  insert into public.chat_messages (chat_id, sender_id, content, created_at)
  values (v_chat_id, v_team_huddle_user_id, p_message_body, now())
  returning id into v_message_id;

  update public.chats
  set last_message_at = now(),
      updated_at = now()
  where id = v_chat_id;

  v_notification_href := '/chat-dialogue?room=' || v_chat_id::text || '&with=' || v_team_huddle_user_id::text;

  select public.enqueue_notification(
    p_user_id := p_recipient_user_id,
    p_category := 'chats',
    p_kind := 'service_dispute_review_ready',
    p_title := 'Team Huddle',
    p_body := p_notification_body,
    p_href := v_notification_href,
    p_data := jsonb_build_object(
      'room_id', v_chat_id,
      'with_user_id', v_team_huddle_user_id,
      'team_huddle_idempotency_key', p_idempotency_key,
      'case_type', 'dispute',
      'case_id', p_case_id,
      'recipient_role', p_recipient_role,
      'pushBody', p_push_body
    )
  ) into v_notification_id;

  insert into public.team_huddle_case_messages (
    idempotency_key,
    case_type,
    case_id,
    recipient_user_id,
    recipient_role,
    sender_user_id,
    chat_id,
    message_id,
    notification_id,
    notification_href,
    message_body,
    created_by
  ) values (
    p_idempotency_key,
    'dispute',
    p_case_id,
    p_recipient_user_id,
    p_recipient_role,
    v_team_huddle_user_id,
    v_chat_id,
    v_message_id,
    v_notification_id,
    v_notification_href,
    p_message_body,
    v_team_huddle_user_id
  );

  return v_message_id;
end;
$function$;

create or replace function public.notify_service_dispute_review_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_chat public.service_chats%rowtype;
  v_outcome text;
  v_currency text;
  v_owner_amount text;
  v_carer_amount text;
  v_owner_copy jsonb;
  v_carer_copy jsonb;
begin
  v_outcome := public.service_dispute_review_outcome_from_status(new.status);
  if v_outcome is null then
    return new;
  end if;

  select * into v_chat
  from public.service_chats
  where id = new.service_chat_id;

  if not found then
    return new;
  end if;

  v_currency := coalesce(new.decision_payload->'money'->>'currency', 'HKD');
  v_owner_amount := public.format_service_dispute_review_amount(new.final_customer_refund_amount, v_currency);
  v_carer_amount := public.format_service_dispute_review_amount(new.final_provider_receives_amount, v_currency);

  if not exists (
    select 1
    from public.chat_messages cm
    where cm.chat_id = v_chat.chat_id
      and cm.content ~ '"kind"\s*:\s*"service_dispute_resolved"'
      and cm.content like '%' || new.id::text || '%'
  ) then
    insert into public.chat_messages (chat_id, sender_id, content, created_at)
    values (
      v_chat.chat_id,
      coalesce(new.decision_actor_id, new.executed_by, new.filed_by),
      jsonb_build_object(
        'kind', 'service_dispute_resolved',
        'dispute_id', new.id,
        'outcome', v_outcome,
        'reviewStatus', 'closed'
      )::text,
      now()
    );

    update public.chats
    set last_message_at = now(),
        updated_at = now()
    where id = v_chat.chat_id;
  end if;

  v_owner_copy := public.service_dispute_review_copy(
    'owner',
    new.filed_by = v_chat.requester_id,
    v_outcome,
    case when v_outcome = 'partial_refund' then v_owner_amount else null end
  );
  v_carer_copy := public.service_dispute_review_copy(
    'carer',
    new.filed_by = v_chat.provider_id,
    v_outcome,
    case when v_outcome = 'partial_refund' then v_carer_amount else null end
  );

  perform public.ensure_team_huddle_direct_message(
    new.id::text,
    v_chat.requester_id,
    'owner',
    v_owner_copy->>'team_huddle_message',
    'service-dispute-review:' || new.id::text || ':owner:' || coalesce(new.status, ''),
    v_owner_copy->>'in_app_body',
    v_owner_copy->>'push_body'
  );

  perform public.ensure_team_huddle_direct_message(
    new.id::text,
    v_chat.provider_id,
    'carer',
    v_carer_copy->>'team_huddle_message',
    'service-dispute-review:' || new.id::text || ':carer:' || coalesce(new.status, ''),
    v_carer_copy->>'in_app_body',
    v_carer_copy->>'push_body'
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_service_dispute_review_ready on public.service_disputes;

create trigger trg_notify_service_dispute_review_ready
after insert or update of status, final_customer_refund_amount, final_provider_receives_amount, decision_payload, updated_at
on public.service_disputes
for each row
execute function public.notify_service_dispute_review_ready();

update public.service_disputes
set updated_at = updated_at
where status like 'resolved%';
