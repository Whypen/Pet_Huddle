begin;

create table if not exists public.care_payment_movements (
  id uuid primary key default gen_random_uuid(),
  service_chat_id uuid not null references public.service_chats(id) on delete cascade,
  movement_kind text not null check (movement_kind in ('owner_refund', 'carer_payout')),
  movement_reason text not null,
  external_key text not null unique,
  source_kind text not null,
  source_record_id text,
  amount_minor bigint,
  currency text,
  status text not null default 'submitted' check (status in (
    'submitted', 'pending', 'in_transit', 'succeeded', 'paid',
    'failed', 'canceled', 'requires_review'
  )),
  stripe_payment_intent_id text,
  stripe_refund_id text,
  stripe_transfer_id text,
  stripe_connected_account_id text,
  stripe_destination_payment_id text,
  stripe_connected_balance_transaction_id text,
  stripe_payout_id text,
  requested_at timestamptz,
  stripe_created_at timestamptz,
  processed_at timestamptz,
  estimated_arrival_at timestamptz,
  paid_at timestamptz,
  refund_reference_value text,
  refund_reference_status text,
  refund_reference_type text,
  payout_trace_value text,
  payout_trace_status text,
  last_synced_at timestamptz,
  next_sync_at timestamptz not null default now(),
  sync_attempt_count integer not null default 0,
  failure_code text,
  failure_message_safe text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_minor is null or amount_minor >= 0),
  check (currency is null or currency ~ '^[A-Z]{3}$'),
  check (movement_kind = 'owner_refund' or stripe_refund_id is null),
  check (movement_kind = 'carer_payout' or (stripe_transfer_id is null and stripe_payout_id is null))
);

create unique index if not exists care_payment_movements_refund_id_uidx
  on public.care_payment_movements(stripe_refund_id)
  where stripe_refund_id is not null;
create unique index if not exists care_payment_movements_transfer_id_uidx
  on public.care_payment_movements(stripe_transfer_id)
  where stripe_transfer_id is not null;
create index if not exists care_payment_movements_service_idx
  on public.care_payment_movements(service_chat_id, created_at desc);
create index if not exists care_payment_movements_sync_idx
  on public.care_payment_movements(next_sync_at, created_at)
  where status not in ('failed', 'canceled')
     or refund_reference_status = 'pending'
     or payout_trace_status = 'pending';
create index if not exists care_payment_movements_payout_idx
  on public.care_payment_movements(stripe_connected_account_id, stripe_payout_id)
  where stripe_connected_account_id is not null;

alter table public.care_payment_movements enable row level security;
revoke all on table public.care_payment_movements from public, anon, authenticated;
grant all on table public.care_payment_movements to service_role;

create or replace function public.upsert_care_payment_movement(
  p_service_chat_id uuid,
  p_movement_kind text,
  p_movement_reason text,
  p_source_kind text,
  p_source_record_id text default null,
  p_amount_minor bigint default null,
  p_currency text default null,
  p_status text default 'submitted',
  p_stripe_payment_intent_id text default null,
  p_stripe_refund_id text default null,
  p_stripe_transfer_id text default null,
  p_requested_at timestamptz default null,
  p_processed_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_external_key text;
  v_id uuid;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_movement_kind not in ('owner_refund', 'carer_payout') then
    raise exception 'invalid_movement_kind' using errcode = '22023';
  end if;
  if p_movement_kind = 'owner_refund' then
    if nullif(btrim(coalesce(p_stripe_refund_id, '')), '') is null then
      raise exception 'stripe_refund_id_required' using errcode = '22023';
    end if;
    v_external_key := 'refund:' || btrim(p_stripe_refund_id);
  else
    if nullif(btrim(coalesce(p_stripe_transfer_id, '')), '') is null then
      raise exception 'stripe_transfer_id_required' using errcode = '22023';
    end if;
    v_external_key := 'transfer:' || btrim(p_stripe_transfer_id);
  end if;

  insert into public.care_payment_movements (
    service_chat_id, movement_kind, movement_reason, external_key,
    source_kind, source_record_id, amount_minor, currency, status,
    stripe_payment_intent_id, stripe_refund_id, stripe_transfer_id,
    requested_at, processed_at, next_sync_at, updated_at
  ) values (
    p_service_chat_id, p_movement_kind, nullif(btrim(coalesce(p_movement_reason, '')), ''), v_external_key,
    nullif(btrim(coalesce(p_source_kind, '')), ''), nullif(btrim(coalesce(p_source_record_id, '')), ''),
    p_amount_minor, upper(nullif(btrim(coalesce(p_currency, '')), '')), coalesce(p_status, 'submitted'),
    nullif(btrim(coalesce(p_stripe_payment_intent_id, '')), ''),
    nullif(btrim(coalesce(p_stripe_refund_id, '')), ''),
    nullif(btrim(coalesce(p_stripe_transfer_id, '')), ''),
    p_requested_at, p_processed_at, now(), now()
  )
  on conflict (external_key) do update set
    service_chat_id = excluded.service_chat_id,
    movement_reason = coalesce(excluded.movement_reason, care_payment_movements.movement_reason),
    source_kind = coalesce(excluded.source_kind, care_payment_movements.source_kind),
    source_record_id = coalesce(excluded.source_record_id, care_payment_movements.source_record_id),
    amount_minor = coalesce(excluded.amount_minor, care_payment_movements.amount_minor),
    currency = coalesce(excluded.currency, care_payment_movements.currency),
    stripe_payment_intent_id = coalesce(excluded.stripe_payment_intent_id, care_payment_movements.stripe_payment_intent_id),
    requested_at = coalesce(excluded.requested_at, care_payment_movements.requested_at),
    processed_at = coalesce(excluded.processed_at, care_payment_movements.processed_at),
    next_sync_at = least(care_payment_movements.next_sync_at, now()),
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.upsert_care_payment_movement(uuid, text, text, text, text, bigint, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_care_payment_movement(uuid, text, text, text, text, bigint, text, text, text, text, text, timestamptz, timestamptz) to service_role;

create or replace function public.capture_service_chat_payment_movements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if nullif(btrim(coalesce(new.stripe_refund_id, '')), '') is not null then
    perform public.upsert_care_payment_movement(
      new.id, 'owner_refund', coalesce(nullif(new.cancellation_status, ''), 'service_refund'),
      'service_chats', new.id::text, null, null, 'submitted', new.stripe_payment_intent_id,
      new.stripe_refund_id, null, new.refund_issued_at, new.refund_issued_at
    );
  end if;
  if nullif(btrim(coalesce(new.no_start_refund_id, '')), '') is not null then
    perform public.upsert_care_payment_movement(
      new.id, 'owner_refund', 'system_no_start', 'service_chats_no_start', new.id::text,
      new.no_start_refund_cents, null, 'submitted', new.stripe_payment_intent_id,
      new.no_start_refund_id, null, new.no_start_resolved_at, new.refund_issued_at
    );
  end if;
  if nullif(btrim(coalesce(new.stripe_transfer_id, '')), '') is not null then
    perform public.upsert_care_payment_movement(
      new.id, 'carer_payout',
      case when coalesce(new.status, '') = 'cancelled' then 'cancellation_payout' else 'care_completion' end,
      'service_chats', new.id::text,
      new.cancellation_provider_payout_cents,
      upper(nullif(new.booking_snapshot #>> '{price,currency}', '')), 'submitted', new.stripe_payment_intent_id,
      null, new.stripe_transfer_id, new.payout_release_requested_at, new.payout_released_at
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists capture_service_chat_payment_movements on public.service_chats;
create trigger capture_service_chat_payment_movements
after insert or update of stripe_refund_id, no_start_refund_id, stripe_transfer_id on public.service_chats
for each row execute function public.capture_service_chat_payment_movements();

create or replace function public.capture_related_care_payment_movements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_reason text := case tg_table_name
    when 'care_scope_versions' then 'scope_conflict'
    when 'service_disputes' then 'case_decision'
    else 'admin_money_execution'
  end;
  v_refund_id text := nullif(btrim(coalesce(to_jsonb(new)->>'stripe_refund_id', '')), '');
  v_transfer_id text := nullif(btrim(coalesce(to_jsonb(new)->>'stripe_transfer_id', '')), '');
  v_service_chat_id uuid := (to_jsonb(new)->>'service_chat_id')::uuid;
  v_amount_minor bigint;
  v_currency text;
begin
  if tg_table_name = 'care_money_flow_execution_attempts' then
    v_currency := upper(nullif(to_jsonb(new)->>'currency', ''));
  end if;
  if v_refund_id is not null then
    if tg_table_name = 'care_money_flow_execution_attempts' then
      v_amount_minor := round(coalesce((to_jsonb(new)->>'owner_refund_amount')::numeric, 0) * 100)::bigint;
    end if;
    perform public.upsert_care_payment_movement(
      v_service_chat_id, 'owner_refund', v_reason, tg_table_name, (to_jsonb(new)->>'id'),
      v_amount_minor, v_currency, 'submitted', null, v_refund_id, null,
      (to_jsonb(new)->>'created_at')::timestamptz, (to_jsonb(new)->>'updated_at')::timestamptz
    );
  end if;
  if v_transfer_id is not null then
    if tg_table_name = 'care_money_flow_execution_attempts' then
      v_amount_minor := round(coalesce((to_jsonb(new)->>'carer_payout_amount')::numeric, 0) * 100)::bigint;
    end if;
    perform public.upsert_care_payment_movement(
      v_service_chat_id, 'carer_payout', v_reason, tg_table_name, (to_jsonb(new)->>'id'),
      v_amount_minor, v_currency, 'submitted', null, null, v_transfer_id,
      (to_jsonb(new)->>'created_at')::timestamptz, (to_jsonb(new)->>'updated_at')::timestamptz
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists capture_scope_payment_movements on public.care_scope_versions;
create trigger capture_scope_payment_movements
after insert or update of stripe_refund_id on public.care_scope_versions
for each row execute function public.capture_related_care_payment_movements();
drop trigger if exists capture_dispute_payment_movements on public.service_disputes;
create trigger capture_dispute_payment_movements
after insert or update of stripe_refund_id, stripe_transfer_id on public.service_disputes
for each row execute function public.capture_related_care_payment_movements();
drop trigger if exists capture_execution_payment_movements on public.care_money_flow_execution_attempts;
create trigger capture_execution_payment_movements
after insert or update of stripe_refund_id, stripe_transfer_id on public.care_money_flow_execution_attempts
for each row execute function public.capture_related_care_payment_movements();

create or replace function public.get_service_care_payment_status_by_service_id(p_service_chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select case when sc.requester_id = v_uid then 'owner' when sc.provider_id = v_uid then 'carer' end
  into v_role from public.service_chats sc where sc.id = p_service_chat_id;
  if v_role is null then raise exception 'service_participant_required' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'movement_kind', m.movement_kind,
    'movement_reason', m.movement_reason,
    'amount_minor', m.amount_minor,
    'currency', m.currency,
    'status', m.status,
    'requested_at', m.requested_at,
    'processed_at', m.processed_at,
    'estimated_arrival_at', m.estimated_arrival_at,
    'paid_at', m.paid_at,
    'refund_reference', case when v_role = 'owner' then m.refund_reference_value else null end,
    'refund_reference_status', case when v_role = 'owner' then m.refund_reference_status else null end,
    'refund_reference_type', case when v_role = 'owner' then m.refund_reference_type else null end,
    'payout_trace_id', case when v_role = 'carer' then m.payout_trace_value else null end,
    'payout_trace_status', case when v_role = 'carer' then m.payout_trace_status else null end,
    'updated_at', m.updated_at
  ) order by m.created_at desc), '[]'::jsonb)
  into v_result
  from public.care_payment_movements m
  where m.service_chat_id = p_service_chat_id
    and ((v_role = 'owner' and m.movement_kind = 'owner_refund')
      or (v_role = 'carer' and m.movement_kind = 'carer_payout'));
  return jsonb_build_object('role', v_role, 'movements', v_result);
end;
$function$;

revoke all on function public.get_service_care_payment_status_by_service_id(uuid) from public, anon;
grant execute on function public.get_service_care_payment_status_by_service_id(uuid) to authenticated, service_role;

create or replace function public.get_my_service_care_payment_statuses(p_service_chat_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select coalesce(array_agg(distinct item), '{}'::uuid[])
  into v_ids
  from unnest(coalesce(p_service_chat_ids, '{}'::uuid[])) item;
  if cardinality(v_ids) > 20 then raise exception 'too_many_service_chats' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'service_chat_id', m.service_chat_id,
    'id', m.id,
    'movement_kind', m.movement_kind,
    'movement_reason', m.movement_reason,
    'amount_minor', m.amount_minor,
    'currency', m.currency,
    'status', m.status,
    'requested_at', m.requested_at,
    'processed_at', m.processed_at,
    'estimated_arrival_at', m.estimated_arrival_at,
    'paid_at', m.paid_at,
    'refund_reference', case when sc.requester_id = v_uid then m.refund_reference_value else null end,
    'refund_reference_status', case when sc.requester_id = v_uid then m.refund_reference_status else null end,
    'refund_reference_type', case when sc.requester_id = v_uid then m.refund_reference_type else null end,
    'payout_trace_id', case when sc.provider_id = v_uid then m.payout_trace_value else null end,
    'payout_trace_status', case when sc.provider_id = v_uid then m.payout_trace_status else null end,
    'updated_at', m.updated_at
  ) order by m.created_at desc), '[]'::jsonb)
  into v_result
  from public.care_payment_movements m
  join public.service_chats sc on sc.id = m.service_chat_id
  where m.service_chat_id = any(v_ids)
    and ((sc.requester_id = v_uid and m.movement_kind = 'owner_refund')
      or (sc.provider_id = v_uid and m.movement_kind = 'carer_payout'));
  return v_result;
end;
$function$;

revoke all on function public.get_my_service_care_payment_statuses(uuid[]) from public, anon;
grant execute on function public.get_my_service_care_payment_statuses(uuid[]) to authenticated, service_role;

create or replace function public.admin_get_service_care_payment_movements(p_service_chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = v_uid
      and (coalesce(p.is_admin, false) or lower(coalesce(p.user_role, '')) = 'admin')
  ) then raise exception 'admin_required'; end if;
  if not exists (select 1 from public.service_chats sc where sc.id = p_service_chat_id) then
    raise exception 'service_chat_not_found';
  end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), '[]'::jsonb)
  into v_result from public.care_payment_movements m where m.service_chat_id = p_service_chat_id;
  return v_result;
end;
$function$;

revoke all on function public.admin_get_service_care_payment_movements(uuid) from public, anon;
grant execute on function public.admin_get_service_care_payment_movements(uuid) to authenticated, service_role;

-- Backfill every currently recorded Care refund/transfer. The trigger owns all future writers.
insert into public.care_payment_movements (
  service_chat_id, movement_kind, movement_reason, external_key, source_kind,
  source_record_id, status, stripe_payment_intent_id, stripe_refund_id,
  requested_at, processed_at, next_sync_at
)
select sc.id, 'owner_refund', coalesce(nullif(sc.cancellation_status, ''), 'service_refund'),
  'refund:' || sc.stripe_refund_id, 'service_chats', sc.id::text, 'submitted',
  sc.stripe_payment_intent_id, sc.stripe_refund_id, sc.refund_issued_at, sc.refund_issued_at, now()
from public.service_chats sc where nullif(btrim(coalesce(sc.stripe_refund_id, '')), '') is not null
on conflict (external_key) do nothing;

insert into public.care_payment_movements (
  service_chat_id, movement_kind, movement_reason, external_key, source_kind,
  source_record_id, amount_minor, status, stripe_payment_intent_id, stripe_refund_id,
  requested_at, processed_at, next_sync_at
)
select sc.id, 'owner_refund', 'system_no_start', 'refund:' || sc.no_start_refund_id,
  'service_chats_no_start', sc.id::text, sc.no_start_refund_cents, 'submitted',
  sc.stripe_payment_intent_id, sc.no_start_refund_id, sc.no_start_resolved_at, sc.refund_issued_at, now()
from public.service_chats sc where nullif(btrim(coalesce(sc.no_start_refund_id, '')), '') is not null
on conflict (external_key) do nothing;

insert into public.care_payment_movements (
  service_chat_id, movement_kind, movement_reason, external_key, source_kind,
  source_record_id, amount_minor, currency, status, stripe_payment_intent_id,
  stripe_transfer_id, requested_at, processed_at, next_sync_at
)
select sc.id, 'carer_payout',
  case when coalesce(sc.status, '') = 'cancelled' then 'cancellation_payout' else 'care_completion' end,
  'transfer:' || sc.stripe_transfer_id, 'service_chats', sc.id::text,
  sc.cancellation_provider_payout_cents,
  upper(nullif(sc.booking_snapshot #>> '{price,currency}', '')), 'submitted',
  sc.stripe_payment_intent_id, sc.stripe_transfer_id,
  sc.payout_release_requested_at, sc.payout_released_at, now()
from public.service_chats sc where nullif(btrim(coalesce(sc.stripe_transfer_id, '')), '') is not null
on conflict (external_key) do nothing;

do $block$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname = 'sync-care-payment-movements-15min'
  loop perform cron.unschedule(v_jobid); end loop;
  perform cron.schedule(
    'sync-care-payment-movements-15min', '*/15 * * * *',
    $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_project_url') || '/functions/v1/sync-care-payment-movements',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('source', 'cron'), timeout_milliseconds := 30000
      );
    $cron$
  );
end;
$block$;

commit;
notify pgrst, 'reload schema';
