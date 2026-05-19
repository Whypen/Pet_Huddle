begin;

create table if not exists public.care_money_flow_execution_approvals (
  id uuid primary key default gen_random_uuid(),
  service_chat_id uuid not null references public.service_chats(id) on delete cascade,
  decision_id uuid not null references public.care_money_flow_admin_decisions(id) on delete restrict,
  execution_lock_id uuid not null references public.care_money_flow_execution_locks(id) on delete restrict,
  execution_attempt_id uuid not null references public.care_money_flow_execution_attempts(id) on delete restrict,
  approver_admin_id uuid not null references public.profiles(id),
  approval_role text not null,
  approval_status text not null,
  approval_note text,
  approved_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_money_flow_execution_approvals_role_check check (
    approval_role in ('maker', 'checker', 'finance_admin')
  ),
  constraint care_money_flow_execution_approvals_status_check check (
    approval_status in ('approved', 'rejected', 'revoked')
  ),
  constraint care_money_flow_execution_approvals_rejection_note_check check (
    approval_status <> 'rejected' or nullif(trim(coalesce(approval_note, '')), '') is not null
  )
);

create index if not exists care_money_flow_execution_approvals_lock_idx
  on public.care_money_flow_execution_approvals (execution_lock_id, created_at desc);

create index if not exists care_money_flow_execution_approvals_attempt_idx
  on public.care_money_flow_execution_approvals (execution_attempt_id, created_at desc);

create unique index if not exists care_money_flow_execution_approvals_one_active_role_idx
  on public.care_money_flow_execution_approvals (execution_attempt_id, approver_admin_id, approval_role)
  where approval_status = 'approved';

alter table public.care_money_flow_execution_approvals enable row level security;

drop policy if exists care_money_flow_execution_approvals_admin_select on public.care_money_flow_execution_approvals;
create policy care_money_flow_execution_approvals_admin_select
  on public.care_money_flow_execution_approvals
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
    )
  );

drop policy if exists care_money_flow_execution_approvals_no_client_insert on public.care_money_flow_execution_approvals;
create policy care_money_flow_execution_approvals_no_client_insert
  on public.care_money_flow_execution_approvals
  for insert
  with check (false);

drop policy if exists care_money_flow_execution_approvals_no_client_update on public.care_money_flow_execution_approvals;
create policy care_money_flow_execution_approvals_no_client_update
  on public.care_money_flow_execution_approvals
  for update
  using (false)
  with check (false);

drop policy if exists care_money_flow_execution_approvals_no_client_delete on public.care_money_flow_execution_approvals;
create policy care_money_flow_execution_approvals_no_client_delete
  on public.care_money_flow_execution_approvals
  for delete
  using (false);

create or replace function public.touch_care_money_flow_execution_approvals_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists care_money_flow_execution_approvals_touch_updated_at on public.care_money_flow_execution_approvals;
create trigger care_money_flow_execution_approvals_touch_updated_at
before update on public.care_money_flow_execution_approvals
for each row execute function public.touch_care_money_flow_execution_approvals_updated_at();

create or replace function public.admin_care_money_flow_execution_readiness(p_execution_lock_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_lock public.care_money_flow_execution_locks%rowtype;
  v_decision public.care_money_flow_admin_decisions%rowtype;
  v_attempt public.care_money_flow_execution_attempts%rowtype;
  v_snapshot public.care_money_flow_snapshots%rowtype;
  v_tx record;
  v_errors text[] := array[]::text[];
  v_warnings text[] := array[]::text[];
  v_approval_count integer := 0;
  v_maker_count integer := 0;
  v_checker_count integer := 0;
  v_distinct_approvers integer := 0;
  v_rejected_count integer := 0;
  v_total numeric := 0;
  v_sum numeric := 0;
  v_active_stripe_dispute boolean := false;
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
  where l.id = p_execution_lock_id;

  if not found then
    return jsonb_build_object('ok', false, 'approved_for_future_live_execution', false, 'errors', jsonb_build_array('execution_lock_not_found'));
  end if;

  select *
  into v_decision
  from public.care_money_flow_admin_decisions d
  where d.id = v_lock.decision_id;

  select *
  into v_attempt
  from public.care_money_flow_execution_attempts a
  where a.execution_lock_id = v_lock.id
    and a.status in ('dry_run_passed', 'live_disabled')
  order by a.created_at desc
  limit 1;

  select *
  into v_snapshot
  from public.care_money_flow_snapshots s
  where s.service_chat_id = v_lock.service_chat_id
  order by s.synced_at desc
  limit 1;

  select *
  into v_tx
  from public.admin_get_care_transactions() t
  where t.service_chat_id = v_lock.service_chat_id
  limit 1;

  select
    count(*) filter (where approval_status = 'approved'),
    count(*) filter (where approval_status = 'approved' and approval_role = 'maker'),
    count(*) filter (where approval_status = 'approved' and approval_role in ('checker', 'finance_admin')),
    count(distinct approver_admin_id) filter (where approval_status = 'approved'),
    count(*) filter (where approval_status = 'rejected')
  into v_approval_count, v_maker_count, v_checker_count, v_distinct_approvers, v_rejected_count
  from public.care_money_flow_execution_approvals a
  where a.execution_lock_id = v_lock.id
    and (v_attempt.id is null or a.execution_attempt_id = v_attempt.id);

  if v_lock.lock_status <> 'execution_locked' then
    v_errors := array_append(v_errors, 'execution_lock_not_active');
  end if;

  if v_decision.id is null or v_decision.status <> 'execution_locked' then
    v_errors := array_append(v_errors, 'decision_not_execution_locked');
  end if;

  if v_attempt.id is null then
    v_errors := array_append(v_errors, 'execution_dry_run_required');
  elsif coalesce((v_attempt.preflight_result ->> 'ok')::boolean, false) is not true then
    v_errors := array_append(v_errors, 'latest_attempt_preflight_not_ok');
  end if;

  if v_snapshot.id is null then
    v_errors := array_append(v_errors, 'latest_stripe_sync_required');
  elsif v_tx.service_chat_id is not null and coalesce(v_snapshot.synced_at, '-infinity'::timestamptz) < coalesce(v_tx.db_updated_at, '-infinity'::timestamptz) then
    v_errors := array_append(v_errors, 'latest_stripe_sync_stale');
  end if;

  if v_approval_count < 2 then
    v_errors := array_append(v_errors, 'two_admin_approvals_required');
  end if;

  if v_maker_count < 1 then
    v_errors := array_append(v_errors, 'maker_approval_required');
  end if;

  if v_checker_count < 1 then
    v_errors := array_append(v_errors, 'checker_or_finance_approval_required');
  end if;

  if v_distinct_approvers < 2 then
    v_errors := array_append(v_errors, 'maker_checker_must_be_different_admins');
  end if;

  if v_rejected_count > 0 then
    v_errors := array_append(v_errors, 'execution_package_rejected');
  end if;

  v_total := round(coalesce(v_tx.total_paid, 0), 2);
  v_sum := round(coalesce(v_lock.owner_refund_amount, 0) + coalesce(v_lock.carer_payout_amount, 0) + coalesce(v_lock.platform_retained_amount, 0), 2);
  if abs(v_sum - v_total) > 0.01 then
    v_errors := array_append(v_errors, 'amounts_do_not_balance_total_paid');
  end if;

  v_active_stripe_dispute := lower(coalesce(v_snapshot.dispute ->> 'status', '')) in (
    'needs_response',
    'under_review',
    'warning_needs_response',
    'warning_under_review'
  );

  if v_active_stripe_dispute and coalesce(v_decision.decision_type, '') <> 'manual_review' then
    v_errors := array_append(v_errors, 'active_stripe_dispute_blocks_future_live_execution');
  end if;

  if v_attempt.status = 'live_disabled' then
    v_warnings := array_append(v_warnings, 'live_execution_disabled');
  end if;

  return jsonb_build_object(
    'ok', cardinality(v_errors) = 0,
    'approved_for_future_live_execution', cardinality(v_errors) = 0,
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings),
    'approval_count', v_approval_count,
    'maker_approved', v_maker_count > 0,
    'checker_approved', v_checker_count > 0,
    'distinct_approver_count', v_distinct_approvers,
    'rejected_count', v_rejected_count,
    'latest_execution_attempt_id', v_attempt.id,
    'latest_attempt_status', v_attempt.status,
    'latest_stripe_sync_snapshot_id', v_snapshot.id,
    'latest_stripe_synced_at', v_snapshot.synced_at,
    'checked_at', now(),
    'live_money_movement_enabled', false
  );
end;
$function$;

create or replace function public.admin_approve_care_money_flow_execution(
  p_execution_attempt_id uuid,
  p_approval_role text,
  p_note text default null
)
returns public.care_money_flow_execution_approvals
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_attempt public.care_money_flow_execution_attempts%rowtype;
  v_lock public.care_money_flow_execution_locks%rowtype;
  v_existing public.care_money_flow_execution_approvals%rowtype;
  v_inserted public.care_money_flow_execution_approvals%rowtype;
  v_role text := lower(trim(coalesce(p_approval_role, '')));
begin
  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_admin_id;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'admin_required';
  end if;

  if v_role not in ('maker', 'checker', 'finance_admin') then
    raise exception 'approval_role_invalid';
  end if;

  select *
  into v_attempt
  from public.care_money_flow_execution_attempts a
  where a.id = p_execution_attempt_id;

  if not found then
    raise exception 'execution_attempt_not_found';
  end if;

  if v_attempt.status not in ('dry_run_passed', 'live_disabled') then
    raise exception 'execution_attempt_not_ready_for_approval';
  end if;

  select *
  into v_lock
  from public.care_money_flow_execution_locks l
  where l.id = v_attempt.execution_lock_id;

  if not found or v_lock.lock_status <> 'execution_locked' then
    raise exception 'execution_lock_not_active';
  end if;

  select *
  into v_existing
  from public.care_money_flow_execution_approvals a
  where a.execution_attempt_id = v_attempt.id
    and a.approver_admin_id = v_admin_id
    and a.approval_status = 'approved'
    and (
      (v_role = 'maker' and a.approval_role in ('checker', 'finance_admin'))
      or (v_role in ('checker', 'finance_admin') and a.approval_role = 'maker')
    )
  limit 1;

  if found then
    raise exception 'same_admin_cannot_be_maker_and_checker';
  end if;

  select *
  into v_existing
  from public.care_money_flow_execution_approvals a
  where a.execution_attempt_id = v_attempt.id
    and a.approver_admin_id = v_admin_id
    and a.approval_role = v_role
    and a.approval_status = 'approved'
  order by a.created_at desc
  limit 1;

  if found then
    return v_existing;
  end if;

  insert into public.care_money_flow_execution_approvals (
    service_chat_id,
    decision_id,
    execution_lock_id,
    execution_attempt_id,
    approver_admin_id,
    approval_role,
    approval_status,
    approval_note,
    approved_at
  )
  values (
    v_attempt.service_chat_id,
    v_attempt.decision_id,
    v_attempt.execution_lock_id,
    v_attempt.id,
    v_admin_id,
    v_role,
    'approved',
    nullif(trim(coalesce(p_note, '')), ''),
    now()
  )
  returning * into v_inserted;

  return v_inserted;
end;
$function$;

create or replace function public.admin_reject_care_money_flow_execution(
  p_execution_attempt_id uuid,
  p_note text
)
returns public.care_money_flow_execution_approvals
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_attempt public.care_money_flow_execution_attempts%rowtype;
  v_lock public.care_money_flow_execution_locks%rowtype;
  v_inserted public.care_money_flow_execution_approvals%rowtype;
  v_note text := trim(coalesce(p_note, ''));
begin
  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_admin_id;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'admin_required';
  end if;

  if v_note = '' then
    raise exception 'rejection_note_required';
  end if;

  select *
  into v_attempt
  from public.care_money_flow_execution_attempts a
  where a.id = p_execution_attempt_id;

  if not found then
    raise exception 'execution_attempt_not_found';
  end if;

  if v_attempt.status not in ('dry_run_passed', 'live_disabled') then
    raise exception 'execution_attempt_not_ready_for_rejection';
  end if;

  select *
  into v_lock
  from public.care_money_flow_execution_locks l
  where l.id = v_attempt.execution_lock_id;

  if not found or v_lock.lock_status <> 'execution_locked' then
    raise exception 'execution_lock_not_active';
  end if;

  insert into public.care_money_flow_execution_approvals (
    service_chat_id,
    decision_id,
    execution_lock_id,
    execution_attempt_id,
    approver_admin_id,
    approval_role,
    approval_status,
    approval_note,
    rejected_at
  )
  values (
    v_attempt.service_chat_id,
    v_attempt.decision_id,
    v_attempt.execution_lock_id,
    v_attempt.id,
    v_admin_id,
    'checker',
    'rejected',
    v_note,
    now()
  )
  returning * into v_inserted;

  return v_inserted;
end;
$function$;

create or replace function public.admin_get_care_money_flow_execution_approvals(p_execution_lock_id uuid)
returns table (
  id uuid,
  service_chat_id uuid,
  decision_id uuid,
  execution_lock_id uuid,
  execution_attempt_id uuid,
  approver_admin_id uuid,
  approver_admin_name text,
  approval_role text,
  approval_status text,
  approval_note text,
  approved_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz,
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
    a.id,
    a.service_chat_id,
    a.decision_id,
    a.execution_lock_id,
    a.execution_attempt_id,
    a.approver_admin_id,
    coalesce(nullif(p.display_name, ''), p.email, a.approver_admin_id::text) as approver_admin_name,
    a.approval_role,
    a.approval_status,
    a.approval_note,
    a.approved_at,
    a.rejected_at,
    a.revoked_at,
    a.created_at,
    a.updated_at
  from public.care_money_flow_execution_approvals a
  left join public.profiles p on p.id = a.approver_admin_id
  where a.execution_lock_id = p_execution_lock_id
  order by a.created_at desc;
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
      count(*) filter (where approval_status = 'approved')::integer as approval_count,
      bool_or(approval_status = 'approved' and approval_role = 'maker') as maker_approved,
      bool_or(approval_status = 'approved' and approval_role in ('checker', 'finance_admin')) as checker_approved,
      count(*) filter (where approval_status = 'rejected')::integer as rejected_count,
      max(updated_at) as updated_at
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

revoke all on function public.admin_care_money_flow_execution_readiness(uuid) from public, anon;
grant execute on function public.admin_care_money_flow_execution_readiness(uuid) to authenticated, service_role;

revoke all on function public.admin_approve_care_money_flow_execution(uuid, text, text) from public, anon;
grant execute on function public.admin_approve_care_money_flow_execution(uuid, text, text) to authenticated, service_role;

revoke all on function public.admin_reject_care_money_flow_execution(uuid, text) from public, anon;
grant execute on function public.admin_reject_care_money_flow_execution(uuid, text) to authenticated, service_role;

revoke all on function public.admin_get_care_money_flow_execution_approvals(uuid) from public, anon;
grant execute on function public.admin_get_care_money_flow_execution_approvals(uuid) to authenticated, service_role;

revoke all on function public.admin_get_care_money_flow_execution_queue() from public, anon;
grant execute on function public.admin_get_care_money_flow_execution_queue() to authenticated, service_role;

do $$
begin
  begin
    alter table public.care_money_flow_execution_approvals replica identity full;
    alter publication supabase_realtime add table public.care_money_flow_execution_approvals;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

commit;
