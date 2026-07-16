begin;

create temp table payment_movement_harness(
  check_name text primary key,
  passed boolean,
  detail text
) on commit drop;

insert into payment_movement_harness
select 'migration_table', to_regclass('public.care_payment_movements') is not null,
  coalesce(to_regclass('public.care_payment_movements')::text, 'missing');
insert into payment_movement_harness
select 'participant_rpc', to_regprocedure('public.get_my_service_care_payment_statuses(uuid[])') is not null,
  coalesce(to_regprocedure('public.get_my_service_care_payment_statuses(uuid[])')::text, 'missing');
insert into payment_movement_harness
select 'admin_rpc', to_regprocedure('public.admin_get_service_care_payment_movements(uuid)') is not null,
  coalesce(to_regprocedure('public.admin_get_service_care_payment_movements(uuid)')::text, 'missing');
insert into payment_movement_harness
select 'sync_cron', exists(
  select 1 from cron.job
  where jobname = 'sync-care-payment-movements-hourly' and active and schedule = '7 * * * *'
), coalesce((
  select schedule || '; active=' || active::text
  from cron.job where jobname = 'sync-care-payment-movements-hourly'
), 'missing');
insert into payment_movement_harness
select 'terminal_sync_stops', is_nullable = 'YES', 'next_sync_at nullable=' || is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'care_payment_movements' and column_name = 'next_sync_at';
insert into payment_movement_harness
select 'admin_refresh_rpc', to_regprocedure('public.admin_request_care_payment_movement_refresh(uuid)') is not null,
  coalesce(to_regprocedure('public.admin_request_care_payment_movement_refresh(uuid)')::text, 'missing');
insert into payment_movement_harness
select 'notification_concurrency_guard',
  to_regprocedure('public.service_notify_once_serialized(uuid,text,text,text,text,jsonb)') is not null,
  coalesce(to_regprocedure('public.service_notify_once_serialized(uuid,text,text,text,text,jsonb)')::text, 'missing');

do $harness$
declare
  v_sc public.service_chats%rowtype;
  v_owner jsonb;
  v_carer jsonb;
  v_admin jsonb;
  v_refund_movement_id uuid;
  v_payout_movement_id uuid;
begin
  select * into v_sc
  from public.service_chats
  where requester_id is not null and provider_id is not null
  order by created_at desc limit 1 for update;
  if not found then raise exception 'no_service_chat_for_harness'; end if;

  update public.service_chats
  set stripe_refund_id = 're_harness_exact_refund',
      stripe_transfer_id = 'tr_harness_exact_transfer',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, 'pi_harness_exact_payment'),
      refund_issued_at = now(),
      payout_release_requested_at = now(),
      payout_released_at = now()
  where id = v_sc.id;

  insert into payment_movement_harness
  select 'trigger_exact_service_link',
    count(*) = 2 and count(distinct service_chat_id) = 1 and bool_and(service_chat_id = v_sc.id),
    'rows=' || count(*) || '; service=' || string_agg(distinct service_chat_id::text, ',')
  from public.care_payment_movements
  where external_key in ('refund:re_harness_exact_refund', 'payout-service:' || v_sc.id::text);

  select id into v_refund_movement_id from public.care_payment_movements where external_key = 'refund:re_harness_exact_refund';
  select id into v_payout_movement_id from public.care_payment_movements where external_key = 'payout-service:' || v_sc.id::text;

  update public.care_payment_movements
  set status = 'succeeded', estimated_arrival_at = now() + interval '10 days', last_synced_at = now()
  where id = v_refund_movement_id;
  update public.care_payment_movements
  set status = 'succeeded', estimated_arrival_at = now() + interval '10 days', last_synced_at = now()
  where id = v_refund_movement_id;
  insert into payment_movement_harness
  select 'refund_notification_single_fire', count(*) = 1, 'notifications=' || count(*)
  from public.notifications
  where coalesce(data->>'movementId', metadata->>'movementId') = v_refund_movement_id::text
    and coalesce(data->>'kind', metadata->>'kind') = 'care_refund_on_the_way';
  insert into payment_movement_harness
  select 'notification_service_id_route',
    count(*) = 1
      and bool_and(coalesce(data->>'href', metadata->>'href') = '/service-chat?service=' || v_sc.id::text || '&historyService=' || v_sc.id::text)
      and bool_and(coalesce(data->>'serviceChatId', metadata->>'serviceChatId') = v_sc.id::text)
      and bool_and(not (coalesce(data, '{}'::jsonb) ? 'chatId') and not (coalesce(metadata, '{}'::jsonb) ? 'chatId')),
    'href=' || coalesce(max(coalesce(data->>'href', metadata->>'href')), 'missing')
  from public.notifications
  where coalesce(data->>'movementId', metadata->>'movementId') = v_refund_movement_id::text
    and coalesce(data->>'kind', metadata->>'kind') = 'care_refund_on_the_way';

  update public.care_payment_movements
  set status = 'failed', failure_code = 'invalid_account_number', last_synced_at = now()
  where id = v_payout_movement_id;
  insert into payment_movement_harness
  select 'payout_setup_notification', count(*) = 1, 'notifications=' || count(*)
  from public.notifications
  where coalesce(data->>'movementId', metadata->>'movementId') = v_payout_movement_id::text
    and coalesce(data->>'kind', metadata->>'kind') = 'care_payment_setup_needed';

  perform set_config('request.jwt.claim.sub', v_sc.requester_id::text, true);
  v_owner := public.get_service_care_payment_status_by_service_id(v_sc.id);
  insert into payment_movement_harness values (
    'owner_role_filter',
    jsonb_array_length(v_owner->'movements') = 1
      and v_owner#>>'{movements,0,movement_kind}' = 'owner_refund'
      and v_owner#>>'{movements,0,last_synced_at}' is not null,
    v_owner::text
  );

  perform set_config('request.jwt.claim.sub', v_sc.provider_id::text, true);
  v_carer := public.get_service_care_payment_status_by_service_id(v_sc.id);
  insert into payment_movement_harness values (
    'carer_role_filter',
    jsonb_array_length(v_carer->'movements') = 1
      and v_carer#>>'{movements,0,movement_kind}' = 'carer_payout'
      and (v_carer#>>'{movements,0,action_required}')::boolean,
    v_carer::text
  );
  insert into payment_movement_harness values (
    'batch_role_filter',
    jsonb_array_length(public.get_my_service_care_payment_statuses(array[v_sc.id])) = 1,
    public.get_my_service_care_payment_statuses(array[v_sc.id])::text
  );

  perform set_config('request.jwt.claim.sub', (
    select id::text from public.profiles
    where coalesce(is_admin, false) or lower(coalesce(user_role, '')) = 'admin'
    limit 1
  ), true);
  v_admin := public.admin_get_service_care_payment_movements(v_sc.id);
  insert into payment_movement_harness values (
    'admin_complete_packet',
    jsonb_array_length(v_admin) = 2
      and v_admin::text like '%stripe_refund_id%'
      and v_admin::text like '%stripe_transfer_id%',
    'rows=' || jsonb_array_length(v_admin)
  );
end
$harness$;

select * from payment_movement_harness order by check_name;
rollback;
