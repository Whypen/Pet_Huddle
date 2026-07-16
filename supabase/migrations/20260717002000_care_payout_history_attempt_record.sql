begin;

-- A payout must remain visible in Care History from the moment release is due,
-- including a pre-transfer failure. The immutable service row is the external
-- identity until Stripe assigns a transfer id.
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
  if not exists (select 1 from public.service_chats sc where sc.id = p_service_chat_id) then
    raise exception 'service_chat_not_found' using errcode = 'P0002';
  end if;
  if p_movement_kind = 'owner_refund' then
    if nullif(btrim(coalesce(p_stripe_refund_id, '')), '') is null then
      raise exception 'stripe_refund_id_required' using errcode = '22023';
    end if;
    v_external_key := 'refund:' || btrim(p_stripe_refund_id);
  else
    v_external_key := 'payout-service:' || p_service_chat_id::text;
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
    p_requested_at, p_processed_at,
    case when p_movement_kind = 'carer_payout' and nullif(btrim(coalesce(p_stripe_transfer_id, '')), '') is null then null else now() end,
    now()
  )
  on conflict (external_key) do update set
    service_chat_id = excluded.service_chat_id,
    movement_reason = coalesce(excluded.movement_reason, care_payment_movements.movement_reason),
    source_kind = coalesce(excluded.source_kind, care_payment_movements.source_kind),
    source_record_id = coalesce(excluded.source_record_id, care_payment_movements.source_record_id),
    amount_minor = coalesce(excluded.amount_minor, care_payment_movements.amount_minor),
    currency = coalesce(excluded.currency, care_payment_movements.currency),
    status = case
      when care_payment_movements.status = 'paid' then care_payment_movements.status
      else excluded.status
    end,
    stripe_payment_intent_id = coalesce(excluded.stripe_payment_intent_id, care_payment_movements.stripe_payment_intent_id),
    stripe_refund_id = coalesce(excluded.stripe_refund_id, care_payment_movements.stripe_refund_id),
    stripe_transfer_id = coalesce(excluded.stripe_transfer_id, care_payment_movements.stripe_transfer_id),
    requested_at = coalesce(excluded.requested_at, care_payment_movements.requested_at),
    processed_at = coalesce(excluded.processed_at, care_payment_movements.processed_at),
    next_sync_at = case
      when coalesce(excluded.stripe_transfer_id, care_payment_movements.stripe_transfer_id) is null then null
      else least(coalesce(care_payment_movements.next_sync_at, now()), now())
    end,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.upsert_care_payment_movement(uuid, text, text, text, text, bigint, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_care_payment_movement(uuid, text, text, text, text, bigint, text, text, text, text, text, timestamptz, timestamptz) to service_role;

create or replace function public.care_payout_failure_requires_user_action(p_failure_code text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $function$
  select lower(btrim(coalesce(p_failure_code, ''))) = any(array[
    'account_closed',
    'account_frozen',
    'bank_account_restricted',
    'bank_ownership_changed',
    'debit_not_authorized',
    'invalid_account_number',
    'incorrect_account_holder_address',
    'incorrect_account_holder_name',
    'incorrect_account_holder_tax_id',
    'no_account',
    'payout_account_unavailable'
  ]::text[]);
$function$;

create or replace function public.capture_service_chat_payment_movements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_movement_id uuid;
  v_failure_code text;
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
  if new.payout_release_requested_at is not null and nullif(btrim(coalesce(new.stripe_payment_intent_id, '')), '') is not null then
    v_failure_code := case
      when lower(coalesce(new.payout_release_failure_reason, '')) like '%no such destination%' then 'payout_account_unavailable'
      when nullif(btrim(coalesce(new.payout_release_failure_reason, '')), '') is not null then 'payout_processing_failed'
      else null
    end;
    v_movement_id := public.upsert_care_payment_movement(
      new.id, 'carer_payout',
      case when coalesce(new.status, '') = 'cancelled' then 'cancellation_payout' else 'care_completion' end,
      'service_chats', new.id::text,
      new.cancellation_provider_payout_cents,
      upper(nullif(new.booking_snapshot #>> '{price,currency}', '')),
      case when v_failure_code is not null then 'failed' else 'submitted' end,
      new.stripe_payment_intent_id, null, new.stripe_transfer_id,
      new.payout_release_requested_at, new.payout_released_at
    );
    if v_failure_code is not null then
      update public.care_payment_movements
      set failure_code = v_failure_code,
          failure_message_safe = case
            when v_failure_code = 'payout_account_unavailable' then 'The payout account is not available to receive this payment.'
            else 'The payout status needs attention.'
          end,
          last_synced_at = now(),
          next_sync_at = null,
          updated_at = now()
      where id = v_movement_id and status <> 'paid';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists capture_service_chat_payment_movements on public.service_chats;
create trigger capture_service_chat_payment_movements
after insert or update of stripe_refund_id, no_start_refund_id, stripe_transfer_id,
  payout_release_requested_at, payout_released_at, payout_release_failure_reason
on public.service_chats
for each row execute function public.capture_service_chat_payment_movements();

-- Normalize an already-created transfer row to the service-keyed identity before
-- the trigger/backfill below can encounter it.
update public.care_payment_movements m
set external_key = 'payout-service:' || m.service_chat_id::text,
    updated_at = now()
where m.movement_kind = 'carer_payout'
  and m.external_key <> 'payout-service:' || m.service_chat_id::text
  and not exists (
    select 1 from public.care_payment_movements existing
    where existing.external_key = 'payout-service:' || m.service_chat_id::text
      and existing.id <> m.id
  );

-- Backfill every paid Care session whose payout has entered release processing,
-- even when Stripe rejected the destination before creating a transfer. This
-- no-op column assignment deliberately fires the exact row trigger above.
update public.service_chats
set payout_release_requested_at = payout_release_requested_at
where payout_release_requested_at is not null
  and nullif(btrim(coalesce(stripe_payment_intent_id, '')), '') is not null;

commit;
