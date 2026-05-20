-- Native service-chat internal-build fixtures.
-- Apply manually only to a non-production Supabase project.
-- This file is intentionally outside supabase/migrations.
--
-- Requires two existing non-production auth/profile users. Set these before running:
--   select set_config('huddle.fixture_requester_id', '<requester uuid>', false);
--   select set_config('huddle.fixture_provider_id', '<provider uuid>', false);

do $$
declare
  v_requester uuid := nullif(current_setting('huddle.fixture_requester_id', true), '')::uuid;
  v_provider uuid := nullif(current_setting('huddle.fixture_provider_id', true), '')::uuid;
  v_now timestamptz := now();
  v_chat_pending uuid := gen_random_uuid();
  v_chat_provider uuid := gen_random_uuid();
  v_chat_quote_ready uuid := gen_random_uuid();
  v_chat_paid_return uuid := gen_random_uuid();
  v_chat_completed uuid := gen_random_uuid();
  v_chat_dispute uuid := gen_random_uuid();
  v_chat_message uuid := gen_random_uuid();
  v_member_room_col text;
  v_message_room_col text;
begin
  if v_requester is null or v_provider is null or v_requester = v_provider then
    raise exception 'Set huddle.fixture_requester_id and huddle.fixture_provider_id to distinct non-production users.';
  end if;

  insert into public.chats (id, type, name, created_by, created_at, updated_at, last_message_at)
  values
    (v_chat_pending, 'service', 'Native fixture requester room', v_requester, v_now, v_now, v_now),
    (v_chat_provider, 'service', 'Native fixture provider room', v_requester, v_now, v_now, v_now),
    (v_chat_quote_ready, 'service', 'Native fixture quote ready room', v_requester, v_now, v_now, v_now),
    (v_chat_paid_return, 'service', 'Native fixture paid return room', v_requester, v_now, v_now, v_now),
    (v_chat_completed, 'service', 'Native fixture completed review room', v_requester, v_now - interval '3 day', v_now, v_now),
    (v_chat_dispute, 'service', 'Native fixture dispute room', v_requester, v_now - interval '2 day', v_now, v_now),
    (v_chat_message, 'service', 'Native fixture message attachment room', v_requester, v_now, v_now, v_now);

  select case
    when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_room_members' and column_name = 'chat_id') then 'chat_id'
    else 'room_id'
  end into v_member_room_col;

  execute format(
    'insert into public.chat_room_members (%I, user_id)
     select chat_id::%s, member_id
     from unnest($1::uuid[]) as chat_id
     cross join unnest($2::uuid[]) as member_id
     on conflict do nothing',
    v_member_room_col,
    case when v_member_room_col = 'chat_id' then 'uuid' else 'text' end
  )
  using array[v_chat_pending, v_chat_provider, v_chat_quote_ready, v_chat_paid_return, v_chat_completed, v_chat_dispute, v_chat_message], array[v_requester, v_provider];

  insert into public.service_chats (
    chat_id, requester_id, provider_id, status,
    request_card, quote_card,
    request_sent_at, quote_sent_at, booked_at, completed_at, disputed_at,
    requester_mark_finished, provider_mark_finished
  )
  values
    (v_chat_pending, v_requester, v_provider, 'pending', null, null, null, null, null, null, null, false, false),
    (v_chat_provider, v_requester, v_provider, 'pending',
      jsonb_build_object('serviceType','Pet Sitting','serviceTypes',jsonb_build_array('Pet Sitting'),'petName','Fixture Pet','petType','Dog','requestedDate',to_char(current_date + 2,'YYYY-MM-DD'),'requestedDates',jsonb_build_array(to_char(current_date + 2,'YYYY-MM-DD')),'startTime','09:00','endTime','17:00','locationArea','Fixture District','additionalNotes','Provider quote fixture'),
      null, v_now, null, null, null, null, false, false),
    (v_chat_quote_ready, v_requester, v_provider, 'pending',
      jsonb_build_object('serviceType','Dog Walking','serviceTypes',jsonb_build_array('Dog Walking'),'petName','Fixture Pet','petType','Dog','requestedDate',to_char(current_date + 3,'YYYY-MM-DD'),'requestedDates',jsonb_build_array(to_char(current_date + 3,'YYYY-MM-DD')),'startTime','10:00','endTime','11:00','locationArea','Fixture District'),
      jsonb_build_object('currency','HKD','finalPrice','100.00','rate','visit','note','Quote ready fixture'),
      v_now, v_now, null, null, null, false, false),
    (v_chat_paid_return, v_requester, v_provider, 'pending',
      jsonb_build_object('serviceType','Boarding','serviceTypes',jsonb_build_array('Boarding'),'petName','Fixture Pet','petType','Cat','requestedDate',to_char(current_date + 4,'YYYY-MM-DD'),'requestedDates',jsonb_build_array(to_char(current_date + 4,'YYYY-MM-DD')),'startTime','09:00','endTime','18:00','locationArea','Fixture District'),
      jsonb_build_object('currency','HKD','finalPrice','120.00','rate','night','note','Paid return fixture'),
      v_now, v_now, null, null, null, false, false),
    (v_chat_completed, v_requester, v_provider, 'completed',
      jsonb_build_object('serviceType','Pet Sitting','serviceTypes',jsonb_build_array('Pet Sitting'),'petName','Fixture Pet','petType','Dog','requestedDate',to_char(current_date - 2,'YYYY-MM-DD'),'requestedDates',jsonb_build_array(to_char(current_date - 2,'YYYY-MM-DD')),'startTime','09:00','endTime','17:00','locationArea','Fixture District'),
      jsonb_build_object('currency','HKD','finalPrice','90.00','rate','visit'),
      v_now - interval '4 day', v_now - interval '3 day', v_now - interval '2 day', v_now - interval '1 day', null, true, true),
    (v_chat_dispute, v_requester, v_provider, 'booked',
      jsonb_build_object('serviceType','Grooming','serviceTypes',jsonb_build_array('Grooming'),'petName','Fixture Pet','petType','Dog','requestedDate',to_char(current_date - 1,'YYYY-MM-DD'),'requestedDates',jsonb_build_array(to_char(current_date - 1,'YYYY-MM-DD')),'startTime','09:00','endTime','12:00','locationArea','Fixture District'),
      jsonb_build_object('currency','HKD','finalPrice','80.00','rate','fixed'),
      v_now - interval '3 day', v_now - interval '2 day', v_now - interval '1 day', null, null, false, false),
    (v_chat_message, v_requester, v_provider, 'pending',
      jsonb_build_object('serviceType','Dog Walking','serviceTypes',jsonb_build_array('Dog Walking'),'petName','Fixture Pet','petType','Dog','requestedDate',to_char(current_date + 1,'YYYY-MM-DD'),'requestedDates',jsonb_build_array(to_char(current_date + 1,'YYYY-MM-DD')),'startTime','08:00','endTime','09:00','locationArea','Fixture District'),
      null, v_now, null, null, null, null, false, false);

  select case
    when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_messages' and column_name = 'chat_id') then 'chat_id'
    else 'room_id'
  end into v_message_room_col;

  execute format(
    'insert into public.chat_messages (%I, sender_id, content, created_at)
     values ($1::%s, $2, $3, $4), ($1::%s, $5, $6, $7)',
    v_message_room_col,
    case when v_message_room_col = 'chat_id' then 'uuid' else 'text' end,
    case when v_message_room_col = 'chat_id' then 'uuid' else 'text' end
  )
  using
    case when v_message_room_col = 'chat_id' then v_chat_message::text else v_chat_message::text end,
    v_requester,
    jsonb_build_object('text','Fixture text with link https://huddle.pet/service','linkPreviewUrl','https://huddle.pet/service')::text,
    v_now,
    v_provider,
    jsonb_build_object('kind','service_request_sent')::text,
    v_now + interval '1 minute';

  raise notice 'Native service-chat fixtures: requester %, provider %, rooms %',
    v_requester, v_provider, array[v_chat_pending, v_chat_provider, v_chat_quote_ready, v_chat_paid_return, v_chat_completed, v_chat_dispute, v_chat_message];
end $$;
