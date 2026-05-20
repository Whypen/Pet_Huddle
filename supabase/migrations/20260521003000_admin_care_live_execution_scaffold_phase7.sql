begin;

alter table public.care_money_flow_execution_attempts
  add column if not exists stripe_refund_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_transfer_reversal_id text,
  add column if not exists stripe_application_fee_refund_id text,
  add column if not exists stripe_response_redacted jsonb not null default '{}'::jsonb,
  add column if not exists executed_by_admin_id uuid references public.profiles(id),
  add column if not exists executed_at timestamptz,
  add column if not exists execution_completed_at timestamptz,
  add column if not exists live_execution_enabled_at_request boolean not null default false;

alter table public.care_money_flow_execution_attempts
  drop constraint if exists care_money_flow_execution_attempts_mode_check;

alter table public.care_money_flow_execution_attempts
  add constraint care_money_flow_execution_attempts_mode_check check (
    execution_mode in ('dry_run', 'live_disabled', 'live')
  );

alter table public.care_money_flow_execution_attempts
  drop constraint if exists care_money_flow_execution_attempts_status_check;

alter table public.care_money_flow_execution_attempts
  add constraint care_money_flow_execution_attempts_status_check check (
    status in (
      'dry_run_passed',
      'dry_run_blocked',
      'live_disabled',
      'blocked',
      'failed',
      'execution_started',
      'execution_succeeded',
      'execution_partial',
      'execution_failed',
      'no_action_confirmed',
      'manual_review_required'
    )
  );

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
  approval_count integer,
  maker_approved boolean,
  checker_approved boolean,
  rejected_count integer,
  approved_for_future_live_execution boolean,
  approval_readiness jsonb,
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
    coalesce(ar.approval_count, 0)::integer as approval_count,
    coalesce(ar.maker_approved, false) as maker_approved,
    coalesce(ar.checker_approved, false) as checker_approved,
    coalesce(ar.rejected_count, 0)::integer as rejected_count,
    coalesce((readiness.result ->> 'approved_for_future_live_execution')::boolean, false) as approved_for_future_live_execution,
    readiness.result as approval_readiness,
    coalesce(l.created_at, d.created_at) as created_at,
    coalesce(ar.updated_at, a.updated_at, l.updated_at, d.updated_at) as updated_at
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
  left join lateral (
    select
      count(*) filter (where approval.approval_status = 'approved')::integer as approval_count,
      bool_or(approval.approval_status = 'approved' and approval.approval_role = 'maker') as maker_approved,
      bool_or(approval.approval_status = 'approved' and approval.approval_role in ('checker', 'finance_admin')) as checker_approved,
      count(*) filter (where approval.approval_status = 'rejected')::integer as rejected_count,
      max(approval.updated_at) as updated_at
    from public.care_money_flow_execution_approvals approval
    where approval.execution_lock_id = l.id
      and (a.id is null or approval.execution_attempt_id = a.id)
  ) ar on true
  left join lateral (
    select public.admin_care_money_flow_execution_readiness(l.id) as result
    where l.id is not null
  ) readiness on true
  left join public.profiles dp on dp.id = d.admin_id
  left join public.profiles lp on lp.id = l.locked_by_admin_id
  where d.status in ('submitted', 'ready_for_execution', 'execution_locked', 'blocked')
     or l.lock_status = 'execution_locked'
  order by coalesce(ar.updated_at, a.created_at, l.locked_at, d.submitted_at, d.updated_at, d.created_at) desc;
end;
$function$;

revoke all on function public.admin_get_care_money_flow_execution_queue() from public, anon;
grant execute on function public.admin_get_care_money_flow_execution_queue() to authenticated, service_role;

commit;
