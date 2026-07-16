-- Read-only proof against the real Kurio / Hyphen records. Run as a transaction
-- and roll it back: it changes no Care, payment, or notification data.
begin;

create temp table care_payment_ui_live_harness (
  check_name text primary key,
  passed boolean not null,
  detail text not null
) on commit drop;

do $harness$
declare
  v_owner uuid := 'c4d5b498-4cd9-4f3a-b1d6-848cecab0c3c';
  v_carer uuid := 'ac72fbb2-c4a9-4066-9775-111dae2da5a1';
  v_refund_service uuid := '22859e0f-edf5-4f42-9069-a0bf867eb17a';
  v_active_service uuid := '89667cd4-d35b-4543-8108-32cebe0042bc';
  v_owner_packet jsonb;
  v_carer_packet jsonb;
  v_active_packet jsonb;
  v_admin_id uuid;
  v_admin_packet jsonb;
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_owner_packet := public.get_service_care_payment_status_by_service_id(v_refund_service);
  insert into care_payment_ui_live_harness values (
    'kurio_owner_refund_packet',
    v_owner_packet->>'role' = 'owner'
      and jsonb_array_length(v_owner_packet->'movements') = 1
      and v_owner_packet#>>'{movements,0,movement_kind}' = 'owner_refund'
      and v_owner_packet#>>'{movements,0,status}' = 'succeeded'
      and v_owner_packet#>>'{movements,0,refund_reference}' = '359572016467656'
      and v_owner_packet#>>'{movements,0,refund_reference_type}' = 'acquirer_reference_number',
    v_owner_packet::text
  );

  perform set_config('request.jwt.claim.sub', v_carer::text, true);
  v_carer_packet := public.get_service_care_payment_status_by_service_id(v_refund_service);
  insert into care_payment_ui_live_harness values (
    'hyphen_carer_payout_packet',
    v_carer_packet->>'role' = 'carer'
      and jsonb_array_length(v_carer_packet->'movements') = 1
      and v_carer_packet#>>'{movements,0,movement_kind}' = 'carer_payout'
      and v_carer_packet#>>'{movements,0,status}' = 'failed'
      and (v_carer_packet#>>'{movements,0,action_required}')::boolean
      and v_carer_packet#>>'{movements,0,refund_reference}' is null,
    v_carer_packet::text
  );

  v_active_packet := public.get_service_care_payment_status_by_service_id(v_active_service);
  insert into care_payment_ui_live_harness values (
    'active_service_has_no_false_release_evidence',
    jsonb_array_length(v_active_packet->'movements') = 0,
    v_active_packet::text
  );

  select id into v_admin_id from public.profiles
  where coalesce(is_admin, false) or lower(coalesce(user_role, '')) = 'admin'
  order by created_at asc limit 1;
  if v_admin_id is null then raise exception 'admin_profile_missing'; end if;
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_admin_packet := public.admin_get_service_care_payment_movements(v_refund_service);
  insert into care_payment_ui_live_harness values (
    'admin_case_has_complete_money_evidence',
    jsonb_array_length(v_admin_packet) = 2
      and v_admin_packet::text like '%"stripe_refund_id": "re_3TsWGZ5sB7E5x62e0ESGjOaD"%'
      and v_admin_packet::text like '%"refund_reference_value": "359572016467656"%'
      and v_admin_packet::text like '%"failure_code": "payout_account_unavailable"%',
    'rows=' || jsonb_array_length(v_admin_packet)
  );
end
$harness$;

insert into care_payment_ui_live_harness
select 'no_orphan_payment_movements', count(*) = 0, 'orphans=' || count(*)
from public.care_payment_movements m
left join public.service_chats sc on sc.id = m.service_chat_id
where sc.id is null;

insert into care_payment_ui_live_harness
select 'no_duplicate_payment_movement_keys', count(*) = 0,
  'duplicates=' || count(*)
from (
  select external_key from public.care_payment_movements
  group by external_key having count(*) > 1
) duplicates;

insert into care_payment_ui_live_harness
select 'refund_history_has_owner_movement', count(*) = 0,
  'missing=' || count(*)
from public.service_chats sc
where nullif(btrim(coalesce(sc.stripe_refund_id, '')), '') is not null
  and not exists (
    select 1 from public.care_payment_movements m
    where m.service_chat_id = sc.id and m.movement_kind = 'owner_refund'
  );

insert into care_payment_ui_live_harness
select 'payout_attempt_history_has_carer_movement', count(*) = 0,
  'missing=' || count(*)
from public.service_chats sc
where sc.payout_release_requested_at is not null
  and not exists (
    select 1 from public.care_payment_movements m
    where m.service_chat_id = sc.id and m.movement_kind = 'carer_payout'
  );

select * from care_payment_ui_live_harness order by check_name;
rollback;
