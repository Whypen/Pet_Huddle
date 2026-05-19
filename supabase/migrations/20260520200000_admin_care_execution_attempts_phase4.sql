begin;

create table if not exists public.care_money_flow_execution_attempts (
  id uuid primary key default gen_random_uuid(),
  service_chat_id uuid not null references public.service_chats(id) on delete cascade,
  decision_id uuid not null references public.care_money_flow_admin_decisions(id) on delete restrict,
  execution_lock_id uuid not null references public.care_money_flow_execution_locks(id) on delete restrict,
  payment_intent_id text,
  requested_by_admin_id uuid not null references public.profiles(id),
  execution_mode text not null,
  requested_action text not null,
  idempotency_key text not null unique,
  owner_refund_amount numeric(12,2) not null default 0,
  carer_payout_amount numeric(12,2) not null default 0,
  platform_retained_amount numeric(12,2) not null default 0,
  currency text not null default 'HKD',
  preflight_result jsonb not null default '{}'::jsonb,
  stripe_action_plan jsonb not null default '{}'::jsonb,
  status text not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_money_flow_execution_attempts_mode_check check (
    execution_mode in ('dry_run', 'live_disabled')
  ),
  constraint care_money_flow_execution_attempts_status_check check (
    status in (
      'dry_run_passed',
      'dry_run_blocked',
      'live_disabled',
      'blocked',
      'failed'
    )
  ),
  constraint care_money_flow_execution_attempts_amounts_check check (
    owner_refund_amount >= 0
    and carer_payout_amount >= 0
    and platform_retained_amount >= 0
  )
);

create index if not exists care_money_flow_execution_attempts_service_chat_idx
  on public.care_money_flow_execution_attempts (service_chat_id, created_at desc);

create index if not exists care_money_flow_execution_attempts_lock_idx
  on public.care_money_flow_execution_attempts (execution_lock_id, created_at desc);

create unique index if not exists care_money_flow_execution_attempts_one_active_action_idx
  on public.care_money_flow_execution_attempts (execution_lock_id, requested_action, execution_mode)
  where status in ('dry_run_passed', 'live_disabled');

alter table public.care_money_flow_execution_attempts enable row level security;

drop policy if exists care_money_flow_execution_attempts_admin_select on public.care_money_flow_execution_attempts;
create policy care_money_flow_execution_attempts_admin_select
  on public.care_money_flow_execution_attempts
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
    )
  );

drop policy if exists care_money_flow_execution_attempts_no_client_insert on public.care_money_flow_execution_attempts;
create policy care_money_flow_execution_attempts_no_client_insert
  on public.care_money_flow_execution_attempts
  for insert
  with check (false);

drop policy if exists care_money_flow_execution_attempts_no_client_update on public.care_money_flow_execution_attempts;
create policy care_money_flow_execution_attempts_no_client_update
  on public.care_money_flow_execution_attempts
  for update
  using (false)
  with check (false);

drop policy if exists care_money_flow_execution_attempts_no_client_delete on public.care_money_flow_execution_attempts;
create policy care_money_flow_execution_attempts_no_client_delete
  on public.care_money_flow_execution_attempts
  for delete
  using (false);

create or replace function public.touch_care_money_flow_execution_attempts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists care_money_flow_execution_attempts_touch_updated_at on public.care_money_flow_execution_attempts;
create trigger care_money_flow_execution_attempts_touch_updated_at
before update on public.care_money_flow_execution_attempts
for each row execute function public.touch_care_money_flow_execution_attempts_updated_at();

create or replace function public.admin_prepare_care_money_flow_execution(p_execution_lock_id uuid)
returns public.care_money_flow_execution_attempts
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_lock public.care_money_flow_execution_locks%rowtype;
  v_decision public.care_money_flow_admin_decisions%rowtype;
  v_snapshot public.care_money_flow_snapshots%rowtype;
  v_tx record;
  v_validation jsonb;
  v_existing public.care_money_flow_execution_attempts%rowtype;
  v_attempt public.care_money_flow_execution_attempts%rowtype;
  v_errors text[] := array[]::text[];
  v_warnings text[] := array[]::text[];
  v_total numeric := 0;
  v_sum numeric := 0;
  v_active_stripe_dispute boolean := false;
  v_requested_action text;
  v_manual_review_required boolean := false;
  v_manual_review_acknowledged boolean := false;
  v_preflight jsonb;
  v_plan jsonb;
begin
  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_admin_id;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'admin_required';
  end if;

  select *
  into v_lock
  from public.care_money_flow_execution_locks l
  where l.id = p_execution_lock_id
  for update;

  if not found then
    raise exception 'execution_lock_not_found';
  end if;

  select *
  into v_decision
  from public.care_money_flow_admin_decisions d
  where d.id = v_lock.decision_id
  for update;

  if not found then
    raise exception 'decision_not_found';
  end if;

  v_requested_action := v_decision.decision_type;

  select *
  into v_existing
  from public.care_money_flow_execution_attempts a
  where a.execution_lock_id = p_execution_lock_id
    and a.requested_action = v_requested_action
    and a.status in ('dry_run_passed', 'live_disabled')
  order by a.created_at desc
  limit 1;

  if found then
    return v_existing;
  end if;

  if v_lock.lock_status <> 'execution_locked' then
    v_errors := array_append(v_errors, 'execution_lock_not_active');
  end if;

  if v_decision.status <> 'execution_locked' then
    v_errors := array_append(v_errors, 'decision_not_execution_locked');
  end if;

  select *
  into v_snapshot
  from public.care_money_flow_snapshots s
  where s.service_chat_id = v_lock.service_chat_id
  order by s.synced_at desc
  limit 1;

  if not found then
    v_errors := array_append(v_errors, 'latest_stripe_sync_required');
  end if;

  select *
  into v_tx
  from public.admin_get_care_transactions() t
  where t.service_chat_id = v_lock.service_chat_id
  limit 1;

  if not found then
    v_errors := array_append(v_errors, 'confirmed_paid_care_session_required');
  end if;

  v_total := round(coalesce(v_tx.total_paid, 0), 2);
  v_sum := round(v_lock.owner_refund_amount + v_lock.carer_payout_amount + v_lock.platform_retained_amount, 2);

  if v_snapshot.id is not null and coalesce(v_snapshot.synced_at, '-infinity'::timestamptz) < coalesce(v_tx.db_updated_at, '-infinity'::timestamptz) then
    v_errors := array_append(v_errors, 'db_stripe_mismatch_requires_sync_first');
  end if;

  if v_snapshot.id is not null and coalesce(v_snapshot.payment_intent_id, '') <> coalesce(v_lock.payment_intent_id, '') then
    v_errors := array_append(v_errors, 'stripe_snapshot_payment_intent_mismatch');
  end if;

  if abs(v_sum - v_total) > 0.01 then
    v_errors := array_append(v_errors, 'refund_payout_retained_must_balance_total_paid');
  end if;

  if v_lock.owner_refund_amount > v_total or v_lock.carer_payout_amount > v_total or v_lock.platform_retained_amount > v_total or (v_lock.owner_refund_amount + v_lock.carer_payout_amount) > v_total then
    v_errors := array_append(v_errors, 'amount_exceeds_total_paid');
  end if;

  v_validation := public.admin_validate_care_money_flow_decision(
    v_decision.service_chat_id,
    v_decision.decision_type,
    v_decision.decision_reason,
    v_decision.admin_note,
    v_decision.proposed_owner_refund,
    v_decision.proposed_carer_payout,
    v_decision.proposed_platform_retained,
    v_decision.id
  );

  if coalesce((v_validation ->> 'ok')::boolean, false) is not true then
    v_errors := array_append(v_errors, 'decision_validation_blocked');
  end if;

  v_active_stripe_dispute := lower(coalesce(v_snapshot.dispute ->> 'status', '')) in (
    'needs_response',
    'under_review',
    'warning_needs_response',
    'warning_under_review'
  );

  if v_active_stripe_dispute and v_decision.decision_type <> 'manual_review' then
    v_errors := array_append(v_errors, 'active_stripe_dispute_blocks_execution');
  end if;

  v_manual_review_required := coalesce((v_validation ->> 'manual_review_required')::boolean, false);
  v_manual_review_acknowledged := nullif(trim(coalesce(v_lock.admin_note, '')), '') is not null;

  if v_decision.decision_type in ('release_payout_to_carer', 'split_refund_and_partial_payout')
    and coalesce(v_tx.actual_service_hours, null) is null
    and not v_manual_review_acknowledged
  then
    v_errors := array_append(v_errors, 'actual_service_hours_or_manual_review_acknowledgement_required');
  end if;

  if v_manual_review_required and v_manual_review_acknowledged then
    v_warnings := array_append(v_warnings, 'manual_review_acknowledged_by_execution_lock_note');
  end if;

  if v_snapshot.id is not null and v_snapshot.id <> v_lock.stripe_sync_snapshot_id then
    v_warnings := array_append(v_warnings, 'newer_stripe_snapshot_used_for_preflight');
  end if;

  v_preflight := jsonb_build_object(
    'ok', cardinality(v_errors) = 0,
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings),
    'checked_at', now(),
    'latest_stripe_sync_snapshot_id', v_snapshot.id,
    'latest_stripe_synced_at', v_snapshot.synced_at,
    'db_updated_at', v_tx.db_updated_at,
    'manual_review_required', v_manual_review_required,
    'manual_review_acknowledged', v_manual_review_acknowledged,
    'service_duration', jsonb_build_object(
      'booked_service_hours', v_tx.booked_service_hours,
      'actual_service_hours', v_tx.actual_service_hours,
      'service_duration_source', v_tx.service_duration_source
    )
  );

  v_plan := jsonb_build_object(
    'live_money_movement_enabled', false,
    'phase', 'phase_4_disabled_scaffold',
    'requested_action', v_requested_action,
    'payment_intent_id', v_lock.payment_intent_id,
    'currency', v_lock.currency,
    'amounts', jsonb_build_object(
      'owner_refund', v_lock.owner_refund_amount,
      'carer_payout', v_lock.carer_payout_amount,
      'platform_retained', v_lock.platform_retained_amount,
      'total_paid', v_total
    ),
    'stripe_steps', jsonb_build_array(
      jsonb_build_object('type', 'refund_owner', 'enabled', false, 'amount', v_lock.owner_refund_amount),
      jsonb_build_object('type', 'transfer_carer', 'enabled', false, 'amount', v_lock.carer_payout_amount),
      jsonb_build_object('type', 'retain_platform', 'enabled', false, 'amount', v_lock.platform_retained_amount)
    ),
    'note', 'Live money movement is disabled. This prepares the execution package only.'
  );

  insert into public.care_money_flow_execution_attempts (
    service_chat_id,
    decision_id,
    execution_lock_id,
    payment_intent_id,
    requested_by_admin_id,
    execution_mode,
    requested_action,
    idempotency_key,
    owner_refund_amount,
    carer_payout_amount,
    platform_retained_amount,
    currency,
    preflight_result,
    stripe_action_plan,
    status,
    error_code,
    error_message
  )
  values (
    v_lock.service_chat_id,
    v_lock.decision_id,
    v_lock.id,
    v_lock.payment_intent_id,
    v_admin_id,
    'dry_run',
    v_requested_action,
    'care-exec:' || v_lock.id::text || ':' || v_requested_action || ':' || gen_random_uuid()::text,
    v_lock.owner_refund_amount,
    v_lock.carer_payout_amount,
    v_lock.platform_retained_amount,
    v_lock.currency,
    v_preflight,
    v_plan,
    case when cardinality(v_errors) = 0 then 'dry_run_passed' else 'dry_run_blocked' end,
    case when cardinality(v_errors) = 0 then null else v_errors[1] end,
    case when cardinality(v_errors) = 0 then null else array_to_string(v_errors, ',') end
  )
  returning * into v_attempt;

  return v_attempt;
end;
$function$;

drop function if exists public.admin_get_care_money_flow_execution_queue();

create function public.admin_get_care_money_flow_execution_queue()
returns table (
  service_chat_id uuid,
  decision_id uuid,
  lock_id uuid,
  payment_intent_id text,
  decision_type text,
  decision_status text,
  lock_status text,
  owner_refund_amount numeric,
  carer_payout_amount numeric,
  platform_retained_amount numeric,
  currency text,
  stripe_sync_snapshot_id uuid,
  stripe_synced_at timestamptz,
  validation_result jsonb,
  decision_admin_id uuid,
  decision_admin_name text,
  locked_by_admin_id uuid,
  locked_by_admin_name text,
  locked_at timestamptz,
  latest_execution_attempt_id uuid,
  latest_execution_attempt_status text,
  latest_execution_mode text,
  latest_requested_action text,
  latest_preflight_result jsonb,
  latest_stripe_action_plan jsonb,
  latest_execution_attempt_created_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
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
  select
    d.service_chat_id,
    d.id as decision_id,
    l.id as lock_id,
    d.payment_intent_id,
    d.decision_type,
    d.status as decision_status,
    l.lock_status,
    coalesce(l.owner_refund_amount, d.proposed_owner_refund) as owner_refund_amount,
    coalesce(l.carer_payout_amount, d.proposed_carer_payout) as carer_payout_amount,
    coalesce(l.platform_retained_amount, d.proposed_platform_retained) as platform_retained_amount,
    coalesce(l.currency, d.currency) as currency,
    l.stripe_sync_snapshot_id,
    s.synced_at as stripe_synced_at,
    coalesce(l.validation_result, d.dry_run_result) as validation_result,
    d.admin_id as decision_admin_id,
    coalesce(nullif(dp.display_name, ''), dp.email, d.admin_id::text) as decision_admin_name,
    l.locked_by_admin_id,
    coalesce(nullif(lp.display_name, ''), lp.email, l.locked_by_admin_id::text) as locked_by_admin_name,
    l.locked_at,
    a.id as latest_execution_attempt_id,
    a.status as latest_execution_attempt_status,
    a.execution_mode as latest_execution_mode,
    a.requested_action as latest_requested_action,
    a.preflight_result as latest_preflight_result,
    a.stripe_action_plan as latest_stripe_action_plan,
    a.created_at as latest_execution_attempt_created_at,
    coalesce(l.created_at, d.created_at) as created_at,
    coalesce(a.updated_at, l.updated_at, d.updated_at) as updated_at
  from public.care_money_flow_admin_decisions d
  left join public.care_money_flow_execution_locks l on l.decision_id = d.id
  left join public.care_money_flow_snapshots s on s.id = l.stripe_sync_snapshot_id
  left join lateral (
    select attempt.*
    from public.care_money_flow_execution_attempts attempt
    where attempt.execution_lock_id = l.id
    order by attempt.created_at desc
    limit 1
  ) a on true
  left join public.profiles dp on dp.id = d.admin_id
  left join public.profiles lp on lp.id = l.locked_by_admin_id
  where d.status in ('submitted', 'ready_for_execution', 'execution_locked', 'blocked')
     or l.lock_status = 'execution_locked'
  order by coalesce(a.created_at, l.locked_at, d.submitted_at, d.updated_at, d.created_at) desc;
end;
$function$;

revoke all on function public.admin_prepare_care_money_flow_execution(uuid) from public, anon;
grant execute on function public.admin_prepare_care_money_flow_execution(uuid) to authenticated, service_role;

revoke all on function public.admin_get_care_money_flow_execution_queue() from public, anon;
grant execute on function public.admin_get_care_money_flow_execution_queue() to authenticated, service_role;

do $$
begin
  begin
    alter table public.care_money_flow_execution_attempts replica identity full;
    alter publication supabase_realtime add table public.care_money_flow_execution_attempts;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

commit;
