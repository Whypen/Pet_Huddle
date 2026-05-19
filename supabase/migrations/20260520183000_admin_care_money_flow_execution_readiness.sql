begin;

alter table public.care_money_flow_admin_decisions
  drop constraint if exists care_money_flow_admin_decisions_status_check;

alter table public.care_money_flow_admin_decisions
  add constraint care_money_flow_admin_decisions_status_check check (
    status in (
      'draft',
      'submitted',
      'blocked',
      'ready_for_execution',
      'execution_locked',
      'execution_cancelled',
      'execution_superseded',
      'executed_reserved'
    )
  );

alter table public.care_money_flow_admin_decisions
  add column if not exists submitted_by_admin_id uuid references public.profiles(id),
  add column if not exists submitted_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by_admin_id uuid references public.profiles(id),
  add column if not exists cancelled_at timestamptz;

drop index if exists public.care_money_flow_admin_decisions_one_active_idx;
create unique index if not exists care_money_flow_admin_decisions_one_active_idx
  on public.care_money_flow_admin_decisions (service_chat_id)
  where status in ('draft', 'submitted', 'ready_for_execution', 'execution_locked');

create table if not exists public.care_money_flow_execution_locks (
  id uuid primary key default gen_random_uuid(),
  service_chat_id uuid not null references public.service_chats(id) on delete cascade,
  decision_id uuid not null references public.care_money_flow_admin_decisions(id) on delete restrict,
  payment_intent_id text,
  locked_by_admin_id uuid not null references public.profiles(id),
  locked_at timestamptz not null default now(),
  lock_status text not null default 'execution_locked',
  decision_type text not null,
  owner_refund_amount numeric(12,2) not null default 0,
  carer_payout_amount numeric(12,2) not null default 0,
  platform_retained_amount numeric(12,2) not null default 0,
  currency text not null default 'HKD',
  stripe_sync_snapshot_id uuid references public.care_money_flow_snapshots(id),
  validation_result jsonb not null default '{}'::jsonb,
  admin_note text not null,
  cancellation_reason text,
  cancelled_by_admin_id uuid references public.profiles(id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_money_flow_execution_locks_status_check check (
    lock_status in (
      'execution_locked',
      'execution_cancelled',
      'execution_superseded',
      'executed_reserved'
    )
  ),
  constraint care_money_flow_execution_locks_amounts_check check (
    owner_refund_amount >= 0
    and carer_payout_amount >= 0
    and platform_retained_amount >= 0
  )
);

create index if not exists care_money_flow_execution_locks_service_chat_idx
  on public.care_money_flow_execution_locks (service_chat_id, locked_at desc);

create index if not exists care_money_flow_execution_locks_decision_idx
  on public.care_money_flow_execution_locks (decision_id, locked_at desc);

create unique index if not exists care_money_flow_execution_locks_one_active_idx
  on public.care_money_flow_execution_locks (service_chat_id)
  where lock_status = 'execution_locked';

alter table public.care_money_flow_execution_locks enable row level security;

drop policy if exists care_money_flow_execution_locks_admin_select on public.care_money_flow_execution_locks;
create policy care_money_flow_execution_locks_admin_select
  on public.care_money_flow_execution_locks
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
    )
  );

drop policy if exists care_money_flow_execution_locks_no_client_insert on public.care_money_flow_execution_locks;
create policy care_money_flow_execution_locks_no_client_insert
  on public.care_money_flow_execution_locks
  for insert
  with check (false);

drop policy if exists care_money_flow_execution_locks_no_client_update on public.care_money_flow_execution_locks;
create policy care_money_flow_execution_locks_no_client_update
  on public.care_money_flow_execution_locks
  for update
  using (false)
  with check (false);

drop policy if exists care_money_flow_execution_locks_no_client_delete on public.care_money_flow_execution_locks;
create policy care_money_flow_execution_locks_no_client_delete
  on public.care_money_flow_execution_locks
  for delete
  using (false);

create or replace function public.touch_care_money_flow_execution_locks_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists care_money_flow_execution_locks_touch_updated_at on public.care_money_flow_execution_locks;
create trigger care_money_flow_execution_locks_touch_updated_at
before update on public.care_money_flow_execution_locks
for each row execute function public.touch_care_money_flow_execution_locks_updated_at();

create or replace function public.admin_submit_care_money_flow_decision(p_decision_id uuid)
returns public.care_money_flow_admin_decisions
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_decision public.care_money_flow_admin_decisions%rowtype;
  v_validation jsonb;
  v_updated public.care_money_flow_admin_decisions%rowtype;
begin
  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_admin_id;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'admin_required';
  end if;

  select *
  into v_decision
  from public.care_money_flow_admin_decisions d
  where d.id = p_decision_id
  for update;

  if not found then
    raise exception 'decision_not_found';
  end if;

  if v_decision.status not in ('draft', 'submitted', 'blocked', 'ready_for_execution') then
    raise exception 'decision_not_submittable';
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

  update public.care_money_flow_admin_decisions
  set
    status = case when coalesce((v_validation ->> 'ok')::boolean, false) then 'ready_for_execution' else 'blocked' end,
    dry_run_result = v_validation,
    submitted_by_admin_id = v_admin_id,
    submitted_at = now()
  where id = p_decision_id
  returning * into v_updated;

  return v_updated;
end;
$function$;

create or replace function public.admin_lock_care_money_flow_execution(
  p_decision_id uuid,
  p_admin_note text
)
returns public.care_money_flow_execution_locks
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_decision public.care_money_flow_admin_decisions%rowtype;
  v_snapshot public.care_money_flow_snapshots%rowtype;
  v_validation jsonb;
  v_lock public.care_money_flow_execution_locks%rowtype;
  v_duplicate_locked boolean := false;
begin
  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_admin_id;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'admin_required';
  end if;

  if nullif(trim(coalesce(p_admin_note, '')), '') is null then
    raise exception 'admin_note_required';
  end if;

  select *
  into v_decision
  from public.care_money_flow_admin_decisions d
  where d.id = p_decision_id
  for update;

  if not found then
    raise exception 'decision_not_found';
  end if;

  if v_decision.status <> 'ready_for_execution' then
    raise exception 'decision_not_ready_for_execution';
  end if;

  select *
  into v_snapshot
  from public.care_money_flow_snapshots s
  where s.service_chat_id = v_decision.service_chat_id
  order by s.synced_at desc
  limit 1;

  if not found then
    raise exception 'stripe_sync_required_before_lock';
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
    update public.care_money_flow_admin_decisions
    set status = 'blocked', dry_run_result = v_validation
    where id = p_decision_id;
    raise exception 'decision_validation_blocked';
  end if;

  select exists (
    select 1
    from public.care_money_flow_execution_locks l
    where l.service_chat_id = v_decision.service_chat_id
      and l.lock_status = 'execution_locked'
  )
  into v_duplicate_locked;

  if v_duplicate_locked then
    raise exception 'duplicate_active_locked_execution';
  end if;

  insert into public.care_money_flow_execution_locks (
    service_chat_id,
    decision_id,
    payment_intent_id,
    locked_by_admin_id,
    decision_type,
    owner_refund_amount,
    carer_payout_amount,
    platform_retained_amount,
    currency,
    stripe_sync_snapshot_id,
    validation_result,
    admin_note
  )
  values (
    v_decision.service_chat_id,
    v_decision.id,
    v_decision.payment_intent_id,
    v_admin_id,
    v_decision.decision_type,
    v_decision.proposed_owner_refund,
    v_decision.proposed_carer_payout,
    v_decision.proposed_platform_retained,
    v_decision.currency,
    v_snapshot.id,
    v_validation,
    trim(p_admin_note)
  )
  returning * into v_lock;

  update public.care_money_flow_admin_decisions
  set status = 'execution_locked', dry_run_result = v_validation
  where id = p_decision_id;

  return v_lock;
end;
$function$;

create or replace function public.admin_cancel_care_money_flow_decision(
  p_decision_id uuid,
  p_admin_note text
)
returns public.care_money_flow_admin_decisions
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_decision public.care_money_flow_admin_decisions%rowtype;
  v_updated public.care_money_flow_admin_decisions%rowtype;
begin
  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_admin_id;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'admin_required';
  end if;

  if nullif(trim(coalesce(p_admin_note, '')), '') is null then
    raise exception 'cancellation_note_required';
  end if;

  select *
  into v_decision
  from public.care_money_flow_admin_decisions d
  where d.id = p_decision_id
  for update;

  if not found then
    raise exception 'decision_not_found';
  end if;

  if v_decision.status in ('execution_cancelled', 'execution_superseded') then
    return v_decision;
  end if;

  update public.care_money_flow_execution_locks
  set
    lock_status = 'execution_cancelled',
    cancellation_reason = trim(p_admin_note),
    cancelled_by_admin_id = v_admin_id,
    cancelled_at = now()
  where decision_id = p_decision_id
    and lock_status = 'execution_locked';

  update public.care_money_flow_admin_decisions
  set
    status = 'execution_cancelled',
    cancellation_reason = trim(p_admin_note),
    cancelled_by_admin_id = v_admin_id,
    cancelled_at = now()
  where id = p_decision_id
  returning * into v_updated;

  return v_updated;
end;
$function$;

create or replace function public.admin_get_care_money_flow_execution_queue()
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
    coalesce(l.created_at, d.created_at) as created_at,
    coalesce(l.updated_at, d.updated_at) as updated_at
  from public.care_money_flow_admin_decisions d
  left join public.care_money_flow_execution_locks l on l.decision_id = d.id
  left join public.care_money_flow_snapshots s on s.id = l.stripe_sync_snapshot_id
  left join public.profiles dp on dp.id = d.admin_id
  left join public.profiles lp on lp.id = l.locked_by_admin_id
  where d.status in ('submitted', 'ready_for_execution', 'execution_locked', 'blocked')
     or l.lock_status = 'execution_locked'
  order by coalesce(l.locked_at, d.submitted_at, d.updated_at, d.created_at) desc;
end;
$function$;

revoke all on function public.admin_submit_care_money_flow_decision(uuid) from public, anon;
grant execute on function public.admin_submit_care_money_flow_decision(uuid) to authenticated, service_role;

revoke all on function public.admin_lock_care_money_flow_execution(uuid, text) from public, anon;
grant execute on function public.admin_lock_care_money_flow_execution(uuid, text) to authenticated, service_role;

revoke all on function public.admin_cancel_care_money_flow_decision(uuid, text) from public, anon;
grant execute on function public.admin_cancel_care_money_flow_decision(uuid, text) to authenticated, service_role;

revoke all on function public.admin_get_care_money_flow_execution_queue() from public, anon;
grant execute on function public.admin_get_care_money_flow_execution_queue() to authenticated, service_role;

do $$
begin
  begin
    alter table public.care_money_flow_execution_locks replica identity full;
    alter publication supabase_realtime add table public.care_money_flow_execution_locks;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

commit;
