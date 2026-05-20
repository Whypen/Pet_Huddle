begin;

create table if not exists public.care_money_flow_snapshots (
  id uuid primary key default gen_random_uuid(),
  service_chat_id uuid not null references public.service_chats(id) on delete cascade,
  payment_intent_id text,
  charge_id text,
  refunds jsonb not null default '[]'::jsonb,
  transfers jsonb not null default '[]'::jsonb,
  application_fee jsonb,
  dispute jsonb,
  balance_transactions jsonb not null default '[]'::jsonb,
  normalized_money_flow_status text not null,
  stripe_raw_redacted jsonb not null default '{}'::jsonb,
  synced_by_admin_id uuid references public.profiles(id),
  synced_at timestamptz not null default now(),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint care_money_flow_snapshots_status_check check (
    normalized_money_flow_status in (
      'paid_pending_care',
      'care_in_progress_hold',
      'completed_pending_payout',
      'payout_released',
      'disputed_hold',
      'refund_full_succeeded',
      'refund_partial_succeeded',
      'refund_pending',
      'stripe_failed',
      'manual_review_required'
    )
  )
);

create index if not exists care_money_flow_snapshots_service_chat_synced_idx
  on public.care_money_flow_snapshots (service_chat_id, synced_at desc);

create index if not exists care_money_flow_snapshots_payment_intent_idx
  on public.care_money_flow_snapshots (payment_intent_id)
  where payment_intent_id is not null;

alter table public.care_money_flow_snapshots enable row level security;

drop policy if exists care_money_flow_snapshots_admin_select on public.care_money_flow_snapshots;
create policy care_money_flow_snapshots_admin_select
  on public.care_money_flow_snapshots
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
    )
  );

drop policy if exists care_money_flow_snapshots_no_client_insert on public.care_money_flow_snapshots;
create policy care_money_flow_snapshots_no_client_insert
  on public.care_money_flow_snapshots
  for insert
  with check (false);

drop policy if exists care_money_flow_snapshots_no_client_update on public.care_money_flow_snapshots;
create policy care_money_flow_snapshots_no_client_update
  on public.care_money_flow_snapshots
  for update
  using (false)
  with check (false);

drop policy if exists care_money_flow_snapshots_no_client_delete on public.care_money_flow_snapshots;
create policy care_money_flow_snapshots_no_client_delete
  on public.care_money_flow_snapshots
  for delete
  using (false);

create or replace function public.admin_care_money_flow_status(
  p_booking_status text,
  p_care_status text,
  p_dispute_status text,
  p_payout_released_at timestamptz,
  p_snapshot_status text,
  p_snapshot_error text,
  p_owner_refunded numeric,
  p_total_paid numeric,
  p_carer_receives numeric
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(p_snapshot_error, '') is not null then 'stripe_failed'
    when p_snapshot_status = 'stripe_failed' then 'stripe_failed'
    when lower(coalesce(p_dispute_status, '')) in ('open', 'awaiting_evidence', 'under_review', 'decision_ready', 'resolved_hold')
      or lower(coalesce(p_booking_status, '')) = 'disputed'
      or lower(coalesce(p_care_status, '')) in ('under_dispute', 'handoff_issue_review')
      then 'disputed_hold'
    when p_snapshot_status in ('refund_pending', 'refund_full_succeeded', 'refund_partial_succeeded', 'payout_released') then p_snapshot_status
    when coalesce(p_owner_refunded, 0) > 0
      and coalesce(p_owner_refunded, 0) >= greatest(coalesce(p_total_paid, 0) - 0.01, 0)
      then 'refund_full_succeeded'
    when coalesce(p_owner_refunded, 0) > 0 then 'refund_partial_succeeded'
    when p_payout_released_at is not null or coalesce(p_carer_receives, 0) > 0
      and lower(coalesce(p_dispute_status, '')) = 'resolved_release_full'
      then 'payout_released'
    when lower(coalesce(p_booking_status, '')) = 'completed' then 'completed_pending_payout'
    when lower(coalesce(p_booking_status, '')) = 'in_progress' or lower(coalesce(p_care_status, '')) = 'in_progress' then 'care_in_progress_hold'
    when nullif(trim(coalesce(p_booking_status, '')), '') is not null then 'paid_pending_care'
    else 'manual_review_required'
  end;
$$;

create or replace function public.admin_get_care_transactions()
returns table (
  service_chat_id uuid,
  chat_id uuid,
  owner_id uuid,
  owner_name text,
  owner_social_id text,
  carer_id uuid,
  carer_name text,
  carer_social_id text,
  booking_status text,
  dispute_status text,
  normalized_money_flow_status text,
  total_paid numeric,
  service_rate numeric,
  owner_refunded numeric,
  carer_receives numeric,
  platform_fee_gross numeric,
  stripe_fee numeric,
  platform_net_retained numeric,
  currency text,
  payment_intent_id text,
  charge_id text,
  refund_ids text[],
  transfer_id text,
  transfer_reversal_id text,
  application_fee_id text,
  dispute_id uuid,
  connected_account_id text,
  stripe_connect_model text,
  db_updated_at timestamptz,
  stripe_synced_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_is_admin boolean := false;
begin
  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(v_is_admin, false) is not true then
    raise exception 'admin_required';
  end if;

  return query
  with latest_dispute as (
    select distinct on (sd.service_chat_id)
      sd.*
    from public.service_disputes sd
    order by sd.service_chat_id, sd.updated_at desc nulls last, sd.created_at desc nulls last
  ),
  latest_snapshot as (
    select distinct on (s.service_chat_id)
      s.*
    from public.care_money_flow_snapshots s
    order by s.service_chat_id, s.synced_at desc
  ),
  base as (
    select
      sc,
      owner.display_name as owner_display_name,
      owner.social_id as owner_social_id,
      carer.display_name as carer_display_name,
      carer.social_id as carer_social_id,
      ld.id as dispute_id,
      ld.status as dispute_status,
      ld.stripe_charge_id as dispute_charge_id,
      ld.stripe_refund_id as dispute_refund_id,
      ld.stripe_transfer_id as dispute_transfer_id,
      ld.stripe_connected_account_id as dispute_connected_account_id,
      ld.final_customer_refund_amount,
      ld.final_provider_receives_amount,
      ld.final_huddle_retained_amount,
      ld.decision_payload,
      ls.charge_id as snapshot_charge_id,
      ls.refunds,
      ls.transfers,
      ls.application_fee,
      ls.dispute as stripe_dispute,
      ls.balance_transactions,
      ls.normalized_money_flow_status as snapshot_status,
      ls.error_code as snapshot_error_code,
      ls.error_message as snapshot_error_message,
      ls.synced_at
    from public.service_chats sc
    join public.profiles owner on owner.id = sc.requester_id
    join public.profiles carer on carer.id = sc.provider_id
    left join latest_dispute ld on ld.service_chat_id = sc.id
    left join latest_snapshot ls on ls.service_chat_id = sc.id
    where sc.stripe_payment_intent_id is not null
      and lower(coalesce(sc.status, '')) <> 'pending'
  ),
  money as (
    select
      b.*,
      coalesce(
        nullif(b.decision_payload #>> '{money,currency}', ''),
        nullif(b.sc.quote_card #>> '{currency}', ''),
        nullif(b.sc.request_card #>> '{suggestedCurrency}', ''),
        'HKD'
      ) as money_currency,
      coalesce(
        nullif(b.decision_payload #>> '{money,total_paid_amount}', '')::numeric,
        nullif(b.sc.quote_card #>> '{finalPrice}', '')::numeric,
        nullif(b.sc.quote_card #>> '{totalPaid}', '')::numeric,
        nullif(b.sc.quote_card #>> '{amountTotal}', '')::numeric,
        0
      ) as total_paid_amount,
      coalesce(
        nullif(b.decision_payload #>> '{money,service_rate_amount}', '')::numeric,
        greatest(
          coalesce(nullif(b.sc.quote_card #>> '{finalPrice}', '')::numeric, 0)
          - coalesce(nullif(b.sc.quote_card #>> '{platformFeeAmount}', '')::numeric, 0),
          0
        )
      ) as service_rate_amount,
      coalesce(
        nullif(b.decision_payload #>> '{money,customer_refund_amount}', '')::numeric,
        b.final_customer_refund_amount,
        0
      ) as owner_refunded_amount,
      coalesce(
        nullif(b.decision_payload #>> '{money,provider_receives_amount}', '')::numeric,
        b.final_provider_receives_amount,
        0
      ) as carer_receives_amount,
      coalesce(
        nullif(b.decision_payload #>> '{money,platform_fee_amount}', '')::numeric,
        nullif(b.decision_payload #>> '{money,customer_platform_fee_amount}', '')::numeric,
        nullif(b.sc.quote_card #>> '{platformFeeAmount}', '')::numeric,
        nullif(b.sc.quote_card #>> '{platform_fee_amount}', '')::numeric,
        0
      ) as platform_fee_amount,
      coalesce(
        (
          select sum(coalesce((bt.value ->> 'fee')::numeric, 0) / 100.0)
          from jsonb_array_elements(coalesce(b.balance_transactions, '[]'::jsonb)) bt(value)
        ),
        0
      ) as stripe_fee_amount,
      coalesce(
        nullif(b.decision_payload #>> '{money,huddle_retained_amount}', '')::numeric,
        b.final_huddle_retained_amount,
        0
      ) as huddle_retained_amount
    from base b
  )
  select
    (m.sc).id as service_chat_id,
    (m.sc).chat_id as chat_id,
    (m.sc).requester_id as owner_id,
    coalesce(nullif(m.owner_display_name, ''), 'Owner') as owner_name,
    coalesce(nullif(m.owner_social_id, ''), '') as owner_social_id,
    (m.sc).provider_id as carer_id,
    coalesce(nullif(m.carer_display_name, ''), 'Carer') as carer_name,
    coalesce(nullif(m.carer_social_id, ''), '') as carer_social_id,
    (m.sc).status as booking_status,
    m.dispute_status,
    public.admin_care_money_flow_status(
      (m.sc).status,
      (m.sc).care_status,
      m.dispute_status,
      (m.sc).payout_released_at,
      m.snapshot_status,
      coalesce(m.snapshot_error_code, m.snapshot_error_message),
      m.owner_refunded_amount,
      m.total_paid_amount,
      m.carer_receives_amount
    ) as normalized_money_flow_status,
    m.total_paid_amount as total_paid,
    m.service_rate_amount as service_rate,
    m.owner_refunded_amount as owner_refunded,
    m.carer_receives_amount as carer_receives,
    m.platform_fee_amount as platform_fee_gross,
    m.stripe_fee_amount as stripe_fee,
    greatest(m.huddle_retained_amount - m.stripe_fee_amount, 0) as platform_net_retained,
    upper(m.money_currency) as currency,
    (m.sc).stripe_payment_intent_id as payment_intent_id,
    coalesce(m.snapshot_charge_id, m.dispute_charge_id, m.decision_payload #>> '{stripe_context,stripe_charge_id}') as charge_id,
    coalesce(
      (
        select array_agg(refund.value ->> 'id')
        from jsonb_array_elements(coalesce(m.refunds, '[]'::jsonb)) refund(value)
        where nullif(refund.value ->> 'id', '') is not null
      ),
      case when nullif(m.dispute_refund_id, '') is not null then array[m.dispute_refund_id] else array[]::text[] end
    ) as refund_ids,
    coalesce(
      (
        select transfer.value ->> 'id'
        from jsonb_array_elements(coalesce(m.transfers, '[]'::jsonb)) transfer(value)
        where nullif(transfer.value ->> 'id', '') is not null
        order by transfer.value ->> 'created' desc nulls last
        limit 1
      ),
      m.dispute_transfer_id,
      m.decision_payload #>> '{stripe_context,stripe_transfer_id}'
    ) as transfer_id,
    (
      select reversal.value ->> 'id'
      from jsonb_array_elements(coalesce(m.transfers, '[]'::jsonb)) transfer(value)
      cross join lateral jsonb_array_elements(coalesce(transfer.value -> 'reversals', '[]'::jsonb)) reversal(value)
      where nullif(reversal.value ->> 'id', '') is not null
      limit 1
    ) as transfer_reversal_id,
    coalesce(m.application_fee ->> 'id', m.decision_payload #>> '{stripe_context,application_fee_id}') as application_fee_id,
    m.dispute_id,
    coalesce(m.dispute_connected_account_id, m.decision_payload #>> '{stripe_context,stripe_connected_account_id}') as connected_account_id,
    case
      when coalesce(m.dispute_connected_account_id, m.decision_payload #>> '{stripe_context,stripe_connected_account_id}') is not null then 'destination_charge_or_separate_transfer'
      else 'platform_charge'
    end as stripe_connect_model,
    (m.sc).updated_at as db_updated_at,
    m.synced_at as stripe_synced_at
  from money m
  order by greatest(coalesce((m.sc).updated_at, '-infinity'::timestamptz), coalesce(m.synced_at, '-infinity'::timestamptz)) desc;
end;
$function$;

revoke all on function public.admin_get_care_transactions() from public, anon;
grant execute on function public.admin_get_care_transactions() to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter table public.care_money_flow_snapshots replica identity full;
    begin
      alter publication supabase_realtime add table public.care_money_flow_snapshots;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

commit;
