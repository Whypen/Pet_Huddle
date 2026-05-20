begin;

create extension if not exists pgcrypto;

alter table public.service_chats
  add column if not exists care_status text,
  add column if not exists booking_snapshot jsonb,
  add column if not exists booking_snapshot_pending jsonb,
  add column if not exists start_pin_hash text,
  add column if not exists pin_attempt_count integer not null default 0,
  add column if not exists pin_locked_until timestamptz,
  add column if not exists pin_shared_at timestamptz,
  add column if not exists pin_shared_by uuid references public.profiles(id) on delete set null,
  add column if not exists checkin_submitted_at timestamptz,
  add column if not exists checkin_photo_url text,
  add column if not exists handoff_problem_reported_at timestamptz,
  add column if not exists requester_response_due_at timestamptz,
  add column if not exists no_start_charge_applied_at timestamptz,
  add column if not exists refund_issued_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_chats_care_status_check'
      and conrelid = 'public.service_chats'::regclass
  ) then
    alter table public.service_chats
      add constraint service_chats_care_status_check
      check (
        care_status is null or care_status = any (
          array[
            'awaiting_handoff'::text,
            'pin_shared'::text,
            'in_progress'::text,
            'handoff_issue_review'::text,
            'not_started_refunded'::text,
            'under_dispute'::text,
            'completed'::text
          ]
        )
      );
  end if;
end $$;

create table if not exists public.service_care_events (
  id uuid primary key default gen_random_uuid(),
  service_chat_id uuid not null references public.service_chats(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  note text,
  media_urls jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_care_events_event_type_check'
      and conrelid = 'public.service_care_events'::regclass
  ) then
    alter table public.service_care_events
      add constraint service_care_events_event_type_check
      check (
        event_type = any (
          array[
            'pin_shared'::text,
            'check_in'::text,
            'handoff_problem'::text,
            'requester_handoff_response'::text,
            'provider_completion'::text,
            'requester_completion'::text,
            'care_update'::text,
            'issue_report'::text,
            'no_start_charge_applied'::text,
            'refund_issued'::text,
            'dispute_evidence'::text
          ]
        )
      );
  end if;
end $$;

create index if not exists idx_service_care_events_chat_created
  on public.service_care_events(service_chat_id, created_at desc);

create index if not exists idx_service_care_events_type
  on public.service_care_events(service_chat_id, event_type, created_at desc);

alter table public.service_care_events enable row level security;

create or replace function public.service_care_event_blocks_payout(p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = public
as $function$
  select
    coalesce((p_metadata->>'unresolved')::boolean, false) is true
    and nullif(btrim(coalesce(p_metadata->>'resolved_at', '')), '') is null
    and nullif(btrim(coalesce(p_metadata->>'resolution', '')), '') is null
    and lower(nullif(btrim(coalesce(p_metadata->>'status', '')), '')) in ('open', 'under_review');
$function$;

drop policy if exists service_care_events_select_participants on public.service_care_events;
create policy service_care_events_select_participants
  on public.service_care_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.service_chats sc
      where sc.id = service_care_events.service_chat_id
        and (sc.requester_id = auth.uid() or sc.provider_id = auth.uid())
    )
  );

drop policy if exists service_care_events_insert_participants on public.service_care_events;
revoke insert, update, delete on public.service_care_events from authenticated, anon;

create or replace function public.service_chat_has_valid_checkin(p_service_chat_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.service_chats sc
    join public.service_care_events sce
      on sce.service_chat_id = sc.id
     and sce.event_type = 'check_in'
    where sc.id = p_service_chat_id
      and sce.actor_id = sc.provider_id
      and sc.checkin_submitted_at is not null
      and (
        nullif(btrim(coalesce(sc.checkin_photo_url, '')), '') is not null
        or jsonb_array_length(coalesce(sce.media_urls, '[]'::jsonb)) > 0
      )
      and coalesce((sce.metadata->>'pin_validated')::boolean, false) is true
  );
$function$;

create or replace function public.service_chat_scheduled_end_at(p_service_chat_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sc public.service_chats%rowtype;
  v_end_text text;
  v_dates text[];
  v_last_date text;
  v_end_time text;
begin
  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if not found then
    return null;
  end if;

  v_end_text := nullif(btrim(coalesce(v_sc.booking_snapshot->>'endAt', '')), '');
  if v_end_text is not null then
    begin
      return v_end_text::timestamptz;
    exception when others then
      null;
    end;
  end if;

  if v_sc.care_status is not null then
    return null;
  end if;

  select array_agg(value order by value)
  into v_dates
  from jsonb_array_elements_text(coalesce(v_sc.request_card->'requestedDates', '[]'::jsonb)) as value;

  v_last_date := coalesce(
    v_dates[array_length(v_dates, 1)],
    nullif(btrim(coalesce(v_sc.request_card->>'requestedDate', '')), '')
  );
  v_end_time := nullif(btrim(coalesce(v_sc.request_card->>'endTime', '')), '');

  if v_last_date is null or v_end_time is null then
    return null;
  end if;

  begin
    return (v_last_date || 'T' || v_end_time || ':00')::timestamp at time zone 'UTC';
  exception when others then
    return null;
  end;
end;
$function$;

create or replace function public.validate_service_booking_snapshot(p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'booking_snapshot_required';
  end if;
  if nullif(btrim(coalesce(p_snapshot->>'serviceType', '')), '') is null then
    raise exception 'booking_snapshot_service_type_required';
  end if;
  if nullif(btrim(coalesce(p_snapshot->>'petId', '')), '') is null then
    raise exception 'booking_snapshot_pet_required';
  end if;
  if nullif(btrim(coalesce(p_snapshot->>'startAt', '')), '') is null then
    raise exception 'booking_snapshot_start_required';
  end if;
  if nullif(btrim(coalesce(p_snapshot->>'endAt', '')), '') is null then
    raise exception 'booking_snapshot_end_required';
  end if;
  if nullif(btrim(coalesce(p_snapshot->>'handoffMethod', '')), '') is null then
    raise exception 'booking_snapshot_handoff_required';
  end if;
  if nullif(btrim(coalesce(p_snapshot->>'emergencyContact', '')), '') is null then
    raise exception 'booking_snapshot_emergency_contact_required';
  end if;
  if nullif(btrim(coalesce(p_snapshot->>'careInstructions', '')), '') is null then
    raise exception 'booking_snapshot_care_instructions_required';
  end if;
  if p_snapshot->'price' is null or jsonb_typeof(p_snapshot->'price') <> 'object' then
    raise exception 'booking_snapshot_price_required';
  end if;
end;
$function$;

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
    jsonb_build_object('kind', 'service_pin_shared', 'pinSharedAt', now())::text
  );

  update public.chats set last_message_at = now() where id = p_chat_id;

  return jsonb_build_object('pin', v_pin, 'pin_shared_at', now());
end;
$function$;

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
    'PIN-confirmed handoff and photo check-in added.',
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id, 'serviceType', v_service_type)
  );

  return jsonb_build_object('care_status', 'in_progress', 'checkin_submitted_at', now());
end;
$function$;

create or replace function public.submit_handoff_problem(
  p_chat_id uuid,
  p_reason text,
  p_note text,
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
  v_due_at timestamptz := now() + interval '24 hours';
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_reason is null then raise exception 'handoff_problem_reason_required'; end if;
  if v_note is null then raise exception 'handoff_problem_note_required'; end if;

  select * into v_sc from public.service_chats where chat_id = p_chat_id for update;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.provider_id <> v_uid then raise exception 'not_provider'; end if;
  if v_sc.status <> 'booked' then raise exception 'invalid_status'; end if;
  if coalesce(v_sc.care_status, 'awaiting_handoff') not in ('awaiting_handoff', 'pin_shared') then
    raise exception 'invalid_care_status';
  end if;

  update public.service_chats
  set care_status = 'handoff_issue_review',
      handoff_problem_reported_at = now(),
      requester_response_due_at = v_due_at
  where id = v_sc.id;

  insert into public.service_care_events (service_chat_id, actor_id, event_type, note, media_urls, metadata)
  values (
    v_sc.id,
    v_uid,
    'handoff_problem',
    v_note,
    to_jsonb(coalesce(p_evidence_urls, '{}'::text[])),
    jsonb_build_object('reason', v_reason, 'requester_response_due_at', v_due_at)
  );

  insert into public.chat_messages (chat_id, sender_id, content)
  values (p_chat_id, v_uid, jsonb_build_object('kind', 'service_handoff_problem_reported')::text);

  update public.chats set last_message_at = now() where id = p_chat_id;

  perform public.service_notify(
    v_sc.requester_id,
    'service_handoff_problem',
    'Handoff problem reported',
    'Provider reported a handoff problem. Please respond so Huddle can review what happened.',
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id, 'reason', v_reason)
  );

  return jsonb_build_object('care_status', 'handoff_issue_review', 'requester_response_due_at', v_due_at);
end;
$function$;

create or replace function public.submit_requester_handoff_response(
  p_chat_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_note is null then raise exception 'handoff_response_required'; end if;

  select * into v_sc from public.service_chats where chat_id = p_chat_id for update;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.care_status <> 'handoff_issue_review' then raise exception 'invalid_care_status'; end if;

  update public.service_chats
  set care_status = 'under_dispute',
      status = 'disputed',
      disputed_at = coalesce(disputed_at, now()),
      payout_release_requested_at = null,
      payout_release_lock_token = null,
      payout_release_locked_at = null
  where id = v_sc.id;

  insert into public.service_care_events (service_chat_id, actor_id, event_type, note)
  values (v_sc.id, v_uid, 'requester_handoff_response', v_note);

  return jsonb_build_object('care_status', 'under_dispute');
end;
$function$;

create or replace function public.submit_provider_completion(
  p_chat_id uuid,
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
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_confirmed_completed, false) is not true then raise exception 'completion_confirmation_required'; end if;
  if coalesce(p_no_unresolved_safety_concerns, false) is not true then raise exception 'safety_confirmation_required'; end if;
  if coalesce(p_understands_review, false) is not true then raise exception 'completion_review_confirmation_required'; end if;

  select * into v_sc from public.service_chats where chat_id = p_chat_id for update;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.provider_id <> v_uid then raise exception 'not_provider'; end if;
  if v_sc.care_status <> 'in_progress' or not public.service_chat_has_valid_checkin(v_sc.id) then raise exception 'checkin_required'; end if;

  if nullif(btrim(coalesce(p_photo_url, '')), '') is not null then
    v_media := jsonb_build_array(nullif(btrim(p_photo_url), ''));
  end if;

  update public.service_chats
  set provider_mark_finished = true
  where id = v_sc.id;

  insert into public.service_care_events (service_chat_id, actor_id, event_type, note, media_urls, metadata)
  values (
    v_sc.id,
    v_uid,
    'provider_completion',
    nullif(btrim(coalesce(p_note, '')), ''),
    v_media,
    jsonb_build_object(
      'confirmed_completed', true,
      'no_unresolved_safety_concerns', true,
      'understands_review', true
    )
  );

  perform public.complete_service_if_both_confirmed(p_chat_id);

  return jsonb_build_object('provider_mark_finished', true);
end;
$function$;

create or replace function public.submit_requester_completion(
  p_chat_id uuid,
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

  select * into v_sc from public.service_chats where chat_id = p_chat_id for update;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.care_status <> 'in_progress' or not public.service_chat_has_valid_checkin(v_sc.id) then raise exception 'checkin_required'; end if;

  update public.service_chats
  set requester_mark_finished = true
  where id = v_sc.id;

  insert into public.service_care_events (service_chat_id, actor_id, event_type, note, metadata)
  values (
    v_sc.id,
    v_uid,
    'requester_completion',
    nullif(btrim(coalesce(p_note, '')), ''),
    jsonb_build_object('confirmed_completed', true, 'understands_payout_review', true)
  );

  perform public.complete_service_if_both_confirmed(p_chat_id);

  return jsonb_build_object('requester_mark_finished', true);
end;
$function$;

drop function if exists public.submit_service_care_update(uuid, text, text);

create or replace function public.submit_service_care_update(
  p_chat_id uuid,
  p_photo_url text default null,
  p_note text default null,
  p_skipped boolean default false
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
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_media jsonb := '[]'::jsonb;
  v_skipped boolean := coalesce(p_skipped, false);
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_photo_url is null and v_note is null and v_skipped is not true then raise exception 'care_update_content_required'; end if;

  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.provider_id <> v_uid then raise exception 'not_provider'; end if;
  if v_sc.care_status <> 'in_progress' then raise exception 'invalid_care_status'; end if;

  if v_photo_url is not null then
    v_media := jsonb_build_array(v_photo_url);
  end if;

  insert into public.service_care_events (service_chat_id, actor_id, event_type, note, media_urls, metadata)
  values (v_sc.id, v_uid, 'care_update', v_note, v_media, jsonb_build_object('skipped', v_skipped));

  if v_skipped is not true then
    insert into public.chat_messages (chat_id, sender_id, content)
    values (p_chat_id, v_uid, jsonb_build_object('kind', 'service_care_update', 'photoUrl', v_photo_url, 'text', coalesce(v_note, ''))::text);

    update public.chats set last_message_at = now() where id = p_chat_id;
  end if;

  return jsonb_build_object('ok', true, 'skipped', v_skipped);
end;
$function$;

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
  end if;
end;
$function$;

create or replace function public.process_service_payout_releases()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  rec record;
  v_processed int := 0;
begin
  for rec in
    select sc.id, sc.chat_id, public.service_chat_scheduled_end_at(sc.id) as scheduled_end_at
    from public.service_chats sc
    where sc.status in ('in_progress', 'completed')
      and coalesce(sc.care_status, '') <> 'handoff_issue_review'
      and sc.refund_issued_at is null
      and sc.payout_released_at is null
      and sc.stripe_payment_intent_id is not null
      and public.service_chat_has_valid_checkin(sc.id)
      and not exists (
        select 1
        from public.service_disputes sd
        where sd.service_chat_id = sc.id
          and sd.status not in ('resolved_hold', 'resolved_release_full', 'resolved_partial_refund', 'resolved_refund_full')
      )
      and not exists (
        select 1
        from public.service_care_events sce
        where sce.service_chat_id = sc.id
          and sce.event_type in ('issue_report', 'dispute_evidence')
          and public.service_care_event_blocks_payout(sce.metadata)
      )
  loop
    if rec.scheduled_end_at is null or rec.scheduled_end_at + interval '48 hours' > now() then
      continue;
    end if;

    update public.service_chats
    set care_status = 'completed',
        status = 'completed',
        completed_at = coalesce(completed_at, now()),
        payout_release_requested_at = coalesce(payout_release_requested_at, now()),
        payout_release_attempted_at = null,
        payout_release_lock_token = null,
        payout_release_locked_at = null
    where id = rec.id
      and payout_released_at is null
      and refund_issued_at is null
      and coalesce(care_status, '') not in ('handoff_issue_review', 'under_dispute');

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$function$;

create or replace function public.refresh_service_chat_status(p_chat_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sc public.service_chats%rowtype;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then
    raise exception 'service_chat_not_found';
  end if;

  if v_sc.care_status is not null then
    return v_sc.status;
  end if;

  return v_sc.status;
end;
$function$;

create or replace function public.start_service_now(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sc public.service_chats%rowtype;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.care_status is not null then
    raise exception 'use_service_checkin_required';
  end if;
  raise exception 'legacy_start_disabled';
end;
$function$;

create or replace function public.start_service(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  raise exception 'use_service_checkin_required';
end;
$function$;

create or replace function public.mark_service_finished(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sc public.service_chats%rowtype;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.care_status is not null then
    raise exception 'use_service_completion_required';
  end if;
  raise exception 'legacy_completion_disabled';
end;
$function$;

revoke all on function public.validate_service_booking_snapshot(jsonb) from public, anon;
grant execute on function public.validate_service_booking_snapshot(jsonb) to authenticated, service_role;

revoke all on function public.share_service_start_pin(uuid, boolean) from public, anon;
grant execute on function public.share_service_start_pin(uuid, boolean) to authenticated;

revoke all on function public.submit_service_checkin(uuid, text, text, boolean) from public, anon;
grant execute on function public.submit_service_checkin(uuid, text, text, boolean) to authenticated;

revoke all on function public.start_service(uuid) from public, anon;
grant execute on function public.start_service(uuid) to authenticated;

revoke all on function public.start_service_now(uuid) from public, anon;
grant execute on function public.start_service_now(uuid) to authenticated;

revoke all on function public.submit_handoff_problem(uuid, text, text, text[]) from public, anon;
grant execute on function public.submit_handoff_problem(uuid, text, text, text[]) to authenticated;

revoke all on function public.submit_requester_handoff_response(uuid, text) from public, anon;
grant execute on function public.submit_requester_handoff_response(uuid, text) to authenticated;

revoke all on function public.submit_provider_completion(uuid, boolean, boolean, boolean, text, text) from public, anon;
grant execute on function public.submit_provider_completion(uuid, boolean, boolean, boolean, text, text) to authenticated;

revoke all on function public.submit_requester_completion(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.submit_requester_completion(uuid, boolean, boolean, text) to authenticated;

revoke all on function public.service_care_event_blocks_payout(jsonb) from public, anon;
grant execute on function public.service_care_event_blocks_payout(jsonb) to authenticated, service_role;

revoke all on function public.submit_service_care_update(uuid, text, text, boolean) from public, anon;
grant execute on function public.submit_service_care_update(uuid, text, text, boolean) to authenticated;

revoke all on function public.submit_service_issue_report(uuid, text, text, boolean, text[]) from public, anon;
grant execute on function public.submit_service_issue_report(uuid, text, text, boolean, text[]) to authenticated;

revoke all on function public.complete_service_if_both_confirmed(uuid) from public, anon;
grant execute on function public.complete_service_if_both_confirmed(uuid) to authenticated, service_role;

revoke all on function public.service_chat_has_valid_checkin(uuid) from public, anon;
grant execute on function public.service_chat_has_valid_checkin(uuid) to authenticated, service_role;

revoke all on function public.service_chat_scheduled_end_at(uuid) from public, anon;
grant execute on function public.service_chat_scheduled_end_at(uuid) to authenticated, service_role;

revoke all on function public.process_service_payout_releases() from public, anon;
grant execute on function public.process_service_payout_releases() to service_role;

commit;
