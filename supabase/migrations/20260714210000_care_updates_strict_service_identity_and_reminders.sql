begin;

-- Care actions after a booking exists must address the immutable service_chats.id.
-- The shared chats.id is intentionally reusable and is only valid when creating a
-- brand-new booking through send_service_request.

create or replace function public.normalize_update_preference(p_value text)
returns text
language sql
immutable
set search_path = public
as $function$
  select case lower(btrim(coalesce(p_value, '')))
    when 'photo' then 'Photo updates'
    when 'photos please' then 'Photo updates'
    when 'photo updates' then 'Photo updates'
    when 'summary' then 'Daily summary'
    when 'daily update' then 'Daily summary'
    when 'daily summary' then 'Daily summary'
    when 'photo + summary' then 'Notes + photos'
    when 'photo and summary' then 'Notes + photos'
    when 'notes + photos' then 'Notes + photos'
    when 'every visit' then 'Notes + photos'
    when 'optional' then 'Update as needed'
    when 'no preference' then 'Update as needed'
    when 'update as needed' then 'Update as needed'
    else 'Update as needed'
  end;
$function$;

create or replace function public.service_care_update_qualifying_count(p_service_chat_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_sc public.service_chats%rowtype;
  v_kind text;
  v_count integer := 0;
begin
  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if not found then return 0; end if;
  if auth.uid() is not null and auth.uid() not in (v_sc.requester_id, v_sc.provider_id) then return 0; end if;
  v_kind := public.service_care_update_kind(coalesce(v_sc.request_card, '{}'::jsonb));

  select count(*)::integer into v_count
  from public.service_care_events e
  where e.service_chat_id = v_sc.id
    and e.event_type = 'care_update'
    and (
      case v_kind
        when 'photo' then jsonb_array_length(coalesce(e.media_urls, '[]'::jsonb)) > 0
          and jsonb_typeof(coalesce(e.media_urls, '[]'::jsonb)->0) = 'object'
          and coalesce(e.media_urls->0->>'bucket', '') = 'service_care_evidence'
          and nullif(btrim(coalesce(e.media_urls->0->>'path', '')), '') is not null
        when 'photo_note' then jsonb_array_length(coalesce(e.media_urls, '[]'::jsonb)) > 0
          and jsonb_typeof(coalesce(e.media_urls, '[]'::jsonb)->0) = 'object'
          and coalesce(e.media_urls->0->>'bucket', '') = 'service_care_evidence'
          and nullif(btrim(coalesce(e.media_urls->0->>'path', '')), '') is not null
          and nullif(btrim(coalesce(e.note, '')), '') is not null
        when 'summary' then nullif(btrim(coalesce(e.note, '')), '') is not null
        else true
      end
    );
  return coalesce(v_count, 0);
end;
$function$;

create or replace function public.service_care_update_due_count(
  p_service_chat_id uuid,
  p_at timestamptz default now()
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_sc public.service_chats%rowtype;
  v_kind text;
  v_total integer;
  v_due integer := 0;
  v_start_time text;
begin
  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if not found then return 0; end if;
  if auth.uid() is not null and auth.uid() not in (v_sc.requester_id, v_sc.provider_id) then return 0; end if;
  v_kind := public.service_care_update_kind(coalesce(v_sc.request_card, '{}'::jsonb));
  if v_kind = 'optional' then return 0; end if;
  v_total := public.service_care_update_required_count(coalesce(v_sc.request_card, '{}'::jsonb));
  v_start_time := nullif(btrim(coalesce(v_sc.request_card->>'startTime', '')), '');

  select count(*)::integer into v_due
  from (
    select distinct nullif(btrim(value), '') as care_date
    from jsonb_array_elements_text(coalesce(v_sc.request_card->'requestedDates', '[]'::jsonb)) value
  ) dates
  where dates.care_date is not null
    and public.service_wall_clock_to_timestamptz(dates.care_date, v_start_time, v_sc.request_card) <= p_at;

  if coalesce(v_due, 0) = 0
     and public.service_chat_snapshot_start_at(v_sc) is not null
     and public.service_chat_snapshot_start_at(v_sc) <= p_at then
    v_due := 1;
  end if;
  return least(v_total, greatest(coalesce(v_due, 0), 0));
end;
$function$;

create or replace function public.service_chat_care_update_requirement_met(p_service_chat_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_sc public.service_chats%rowtype;
  v_kind text;
begin
  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if not found then return false; end if;
  if auth.uid() is not null and auth.uid() not in (v_sc.requester_id, v_sc.provider_id) then return false; end if;
  v_kind := public.service_care_update_kind(coalesce(v_sc.request_card, '{}'::jsonb));
  if v_kind = 'optional' then return true; end if;
  return public.service_care_update_qualifying_count(v_sc.id) >= public.service_care_update_due_count(v_sc.id, now());
end;
$function$;

create or replace function public.service_chat_care_update_hard_completion_met(p_service_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  -- Update compliance is recorded and prompted, but it never blocks either
  -- participant from confirming completion or the 48-hour completion safety valve.
  select exists (select 1 from public.service_chats where id = p_service_chat_id);
$function$;

create or replace function public.get_service_care_update_status_by_service_id(p_service_chat_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_kind text;
  v_total integer;
  v_due integer;
  v_submitted integer;
  v_latest timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_uid not in (v_sc.requester_id, v_sc.provider_id) then raise exception 'not_service_participant'; end if;
  v_kind := public.service_care_update_kind(coalesce(v_sc.request_card, '{}'::jsonb));
  v_total := case when v_kind = 'optional' then 0 else public.service_care_update_required_count(coalesce(v_sc.request_card, '{}'::jsonb)) end;
  v_due := public.service_care_update_due_count(v_sc.id, now());
  v_submitted := public.service_care_update_qualifying_count(v_sc.id);
  select max(created_at) into v_latest from public.service_care_events where service_chat_id = v_sc.id and event_type = 'care_update';
  return jsonb_build_object(
    'ok', true, 'service_chat_id', v_sc.id, 'update_kind', v_kind,
    'required', v_kind <> 'optional', 'total_required_count', v_total,
    'due_count', v_due, 'required_count', v_due, 'submitted_count', v_submitted,
    'met', v_kind = 'optional' or v_submitted >= v_due,
    'latest_update_at', v_latest
  );
end;
$function$;

create or replace function public.submit_service_care_update_by_service_id(
  p_service_chat_id uuid,
  p_photo_url text default null,
  p_note text default null,
  p_pet_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.submit_service_care_update(p_service_chat_id, p_photo_url, p_note, p_pet_name);
end;
$function$;

create or replace function public.share_service_start_pin_by_service_id(p_service_chat_id uuid, p_requester_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.share_service_start_pin(p_service_chat_id, p_requester_confirmed);
end;
$function$;

create or replace function public.submit_service_checkin_by_service_id(
  p_service_chat_id uuid, p_start_pin text, p_photo_url text, p_provider_confirmed boolean,
  p_checkin_captured_at timestamptz default null, p_checkin_location_lat numeric default null,
  p_checkin_location_lng numeric default null, p_checkin_location_accuracy_m numeric default null,
  p_checkin_location_permission_denied boolean default false, p_checkin_note text default null
)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.submit_service_checkin(p_service_chat_id, p_start_pin, p_photo_url, p_provider_confirmed, p_checkin_captured_at, p_checkin_location_lat, p_checkin_location_lng, p_checkin_location_accuracy_m, p_checkin_location_permission_denied, p_checkin_note);
end;
$function$;

create or replace function public.verify_service_start_pin_by_service_id(p_service_chat_id uuid, p_start_pin text)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.verify_service_start_pin(p_service_chat_id, p_start_pin);
end;
$function$;

create or replace function public.submit_provider_completion_by_service_id(
  p_service_chat_id uuid, p_confirmed_completed boolean, p_no_unresolved_safety_concerns boolean,
  p_understands_review boolean, p_photo_url text default null, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
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
  update public.service_chats set provider_mark_finished = true where id = v_sc.id;
  insert into public.service_care_events(service_chat_id, actor_id, event_type, note, metadata)
  values (v_sc.id, v_uid, 'provider_completion', nullif(btrim(coalesce(p_note, '')), ''),
    jsonb_build_object('confirmed_completed', true, 'no_unresolved_safety_concerns', true,
      'understands_review', true, 'care_update_kind', v_update_kind, 'care_update_met', v_update_met));
  perform public.complete_service_if_both_confirmed(v_sc.chat_id);
  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if v_sc.care_status <> 'completed' and v_sc.requester_id is not null then
    perform public.service_notify(
      v_sc.requester_id, 'service_completion_requested', 'Care completion ready',
      'Your carer marked the session complete. Please confirm when your pet is safely back.',
      '/chats?tab=service&room=' || v_sc.chat_id::text,
      jsonb_build_object('chatId', v_sc.chat_id, 'serviceChatId', v_sc.id)
    );
  end if;
  return jsonb_build_object('ok', true, 'care_update_kind', v_update_kind, 'care_update_met', v_update_met);
end;
$function$;

create or replace function public.submit_requester_completion_by_service_id(
  p_service_chat_id uuid, p_confirmed_completed boolean, p_understands_payout_review boolean, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_sc public.service_chats%rowtype;
begin
  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  return public.submit_requester_completion(v_sc.chat_id, p_confirmed_completed, p_understands_payout_review, p_note);
end;
$function$;

create or replace function public.complete_service_if_both_confirmed_by_service_id(p_service_chat_id uuid)
returns void language plpgsql security definer set search_path = public as $function$
declare v_sc public.service_chats%rowtype;
begin
  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  perform public.complete_service_if_both_confirmed(v_sc.chat_id);
end;
$function$;

create or replace function public.withdraw_service_request_by_service_id(p_service_chat_id uuid)
returns void language plpgsql security definer set search_path = public as $function$
declare v_sc public.service_chats%rowtype;
begin
  select * into v_sc from public.service_chats where id = p_service_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  perform public.withdraw_service_request(v_sc.chat_id);
end;
$function$;

create or replace function public.submit_service_issue_report_by_service_id(
  p_service_chat_id uuid, p_reason text, p_note text, p_acknowledged_review boolean,
  p_evidence_urls text[] default '{}'::text[]
)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.submit_service_issue_report(p_service_chat_id, p_reason, p_note, p_acknowledged_review, p_evidence_urls);
end;
$function$;

create or replace function public.submit_handoff_problem_by_service_id(
  p_service_chat_id uuid, p_reason text, p_note text, p_evidence_urls text[] default '{}'::text[]
)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.submit_handoff_problem(p_service_chat_id, p_reason, p_note, p_evidence_urls);
end;
$function$;

create or replace function public.submit_service_no_start_report_by_service_id(
  p_service_chat_id uuid, p_reason text, p_note text default null, p_evidence_urls text[] default '{}'::text[]
)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.submit_service_no_start_report(p_service_chat_id, p_reason, p_note, p_evidence_urls);
end;
$function$;

create or replace function public.submit_requester_handoff_response_by_service_id(
  p_service_chat_id uuid, p_note text, p_evidence_urls text[] default '{}'::text[]
)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.submit_requester_handoff_response(p_service_chat_id, p_note, p_evidence_urls);
end;
$function$;

create or replace function public.process_service_care_update_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  rec record;
  v_kind text;
  v_due integer;
  v_sent integer;
  v_date text;
  v_start timestamptz;
  v_end timestamptz;
  v_key text;
  v_body text;
  v_count integer := 0;
begin
  for rec in select * from public.service_chats where status = 'in_progress' and care_status = 'in_progress' loop
    v_kind := public.service_care_update_kind(coalesce(rec.request_card, '{}'::jsonb));
    if v_kind = 'optional' then continue; end if;
    v_due := public.service_care_update_due_count(rec.id, now());
    v_sent := public.service_care_update_qualifying_count(rec.id);
    if v_due <= v_sent or v_due < 1 then continue; end if;

    select care_date into v_date from (
      select distinct nullif(btrim(value), '') care_date
      from jsonb_array_elements_text(coalesce(rec.request_card->'requestedDates', '[]'::jsonb)) value
      where nullif(btrim(value), '') is not null
      order by 1
    ) dates offset greatest(v_due - 1, 0) limit 1;
    v_date := coalesce(v_date, nullif(btrim(coalesce(rec.request_card->>'requestedDate', '')), ''));
    v_start := public.service_wall_clock_to_timestamptz(v_date, rec.request_card->>'startTime', rec.request_card);
    v_end := public.service_wall_clock_to_timestamptz(v_date, rec.request_card->>'endTime', rec.request_card);
    if v_end is not null and v_start is not null and v_end <= v_start then v_end := v_end + interval '1 day'; end if;
    if v_start is null then v_start := rec.in_progress_at; end if;
    if v_end is null then v_end := public.service_chat_snapshot_end_at(rec); end if;
    if v_start is null or v_end is null or now() < v_start + ((v_end - v_start) / 2) then continue; end if;

    v_key := 'care-update:' || rec.id::text || ':' || coalesce(v_date, v_due::text);
    if exists (select 1 from public.notifications n where n.user_id = rec.provider_id and n.metadata->>'dedupe_key' = v_key) then continue; end if;
    v_body := case v_kind
      when 'photo' then 'Please send today''s photo before care ends.'
      when 'summary' then 'Please send today''s summary before care ends.'
      else 'Please send today''s photo and summary before care ends.'
    end;
    perform public.service_notify(
      rec.provider_id, 'service_care_update_due', 'Care update due', v_body,
      '/chats?tab=service&room=' || rec.chat_id::text || '&service=' || rec.id::text,
      jsonb_build_object('chatId', rec.chat_id, 'serviceChatId', rec.id, 'careDate', v_date, 'updateKind', v_kind, 'dedupe_key', v_key)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

revoke all on function public.normalize_update_preference(text) from public, anon;
revoke all on function public.service_care_update_qualifying_count(uuid) from public, anon;
revoke all on function public.service_care_update_due_count(uuid, timestamptz) from public, anon;
revoke all on function public.service_chat_care_update_requirement_met(uuid) from public, anon;
revoke all on function public.service_chat_care_update_hard_completion_met(uuid) from public, anon;
grant execute on function public.normalize_update_preference(text) to authenticated, service_role;
grant execute on function public.service_care_update_qualifying_count(uuid) to authenticated, service_role;
grant execute on function public.service_care_update_due_count(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.service_chat_care_update_requirement_met(uuid) to authenticated, service_role;
grant execute on function public.service_chat_care_update_hard_completion_met(uuid) to authenticated, service_role;

revoke all on function public.get_service_care_update_status_by_service_id(uuid) from public, anon;
revoke all on function public.submit_service_care_update_by_service_id(uuid, text, text, text) from public, anon;
revoke all on function public.share_service_start_pin_by_service_id(uuid, boolean) from public, anon;
revoke all on function public.submit_service_checkin_by_service_id(uuid, text, text, boolean, timestamptz, numeric, numeric, numeric, boolean, text) from public, anon;
revoke all on function public.verify_service_start_pin_by_service_id(uuid, text) from public, anon;
revoke all on function public.submit_provider_completion_by_service_id(uuid, boolean, boolean, boolean, text, text) from public, anon;
revoke all on function public.submit_requester_completion_by_service_id(uuid, boolean, boolean, text) from public, anon;
revoke all on function public.complete_service_if_both_confirmed_by_service_id(uuid) from public, anon;
revoke all on function public.withdraw_service_request_by_service_id(uuid) from public, anon;
revoke all on function public.submit_service_issue_report_by_service_id(uuid, text, text, boolean, text[]) from public, anon;
revoke all on function public.submit_handoff_problem_by_service_id(uuid, text, text, text[]) from public, anon;
revoke all on function public.submit_service_no_start_report_by_service_id(uuid, text, text, text[]) from public, anon;
revoke all on function public.submit_requester_handoff_response_by_service_id(uuid, text, text[]) from public, anon;
grant execute on function public.get_service_care_update_status_by_service_id(uuid) to authenticated, service_role;
grant execute on function public.submit_service_care_update_by_service_id(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.share_service_start_pin_by_service_id(uuid, boolean) to authenticated, service_role;
grant execute on function public.submit_service_checkin_by_service_id(uuid, text, text, boolean, timestamptz, numeric, numeric, numeric, boolean, text) to authenticated, service_role;
grant execute on function public.verify_service_start_pin_by_service_id(uuid, text) to authenticated, service_role;
grant execute on function public.submit_provider_completion_by_service_id(uuid, boolean, boolean, boolean, text, text) to authenticated, service_role;
grant execute on function public.submit_requester_completion_by_service_id(uuid, boolean, boolean, text) to authenticated, service_role;
grant execute on function public.complete_service_if_both_confirmed_by_service_id(uuid) to authenticated, service_role;
grant execute on function public.withdraw_service_request_by_service_id(uuid) to authenticated, service_role;
grant execute on function public.submit_service_issue_report_by_service_id(uuid, text, text, boolean, text[]) to authenticated, service_role;
grant execute on function public.submit_handoff_problem_by_service_id(uuid, text, text, text[]) to authenticated, service_role;
grant execute on function public.submit_service_no_start_report_by_service_id(uuid, text, text, text[]) to authenticated, service_role;
grant execute on function public.submit_requester_handoff_response_by_service_id(uuid, text, text[]) to authenticated, service_role;
revoke all on function public.process_service_care_update_reminders() from public, anon, authenticated;
grant execute on function public.process_service_care_update_reminders() to service_role;

do $block$
begin
  if exists (select 1 from cron.job where jobname = 'service-care-update-reminders-5min') then
    perform cron.unschedule('service-care-update-reminders-5min');
  end if;
  perform cron.schedule('service-care-update-reminders-5min', '*/5 * * * *', 'select public.process_service_care_update_reminders();');
end
$block$;

notify pgrst, 'reload schema';

commit;
