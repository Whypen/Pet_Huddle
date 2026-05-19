begin;

create table if not exists public.care_money_flow_admin_decisions (
  id uuid primary key default gen_random_uuid(),
  service_chat_id uuid not null references public.service_chats(id) on delete cascade,
  payment_intent_id text,
  admin_id uuid not null references public.profiles(id),
  decision_type text not null,
  decision_reason text not null,
  admin_note text not null,
  proposed_owner_refund numeric(12,2) not null default 0,
  proposed_carer_payout numeric(12,2) not null default 0,
  proposed_platform_retained numeric(12,2) not null default 0,
  currency text not null default 'HKD',
  dry_run_result jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_money_flow_admin_decisions_type_check check (
    decision_type in (
      'no_action_monitor',
      'full_refund_owner',
      'partial_refund_owner',
      'release_payout_to_carer',
      'split_refund_and_partial_payout',
      'manual_review'
    )
  ),
  constraint care_money_flow_admin_decisions_status_check check (
    status in ('draft', 'submitted', 'blocked', 'ready_for_execution', 'cancelled')
  ),
  constraint care_money_flow_admin_decisions_amounts_check check (
    proposed_owner_refund >= 0
    and proposed_carer_payout >= 0
    and proposed_platform_retained >= 0
  )
);

create index if not exists care_money_flow_admin_decisions_service_chat_idx
  on public.care_money_flow_admin_decisions (service_chat_id, created_at desc);

create unique index if not exists care_money_flow_admin_decisions_one_active_idx
  on public.care_money_flow_admin_decisions (service_chat_id)
  where status in ('draft', 'submitted', 'ready_for_execution');

alter table public.care_money_flow_admin_decisions enable row level security;

drop policy if exists care_money_flow_admin_decisions_admin_select on public.care_money_flow_admin_decisions;
create policy care_money_flow_admin_decisions_admin_select
  on public.care_money_flow_admin_decisions
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
    )
  );

drop policy if exists care_money_flow_admin_decisions_no_client_insert on public.care_money_flow_admin_decisions;
create policy care_money_flow_admin_decisions_no_client_insert
  on public.care_money_flow_admin_decisions
  for insert
  with check (false);

drop policy if exists care_money_flow_admin_decisions_no_client_update on public.care_money_flow_admin_decisions;
create policy care_money_flow_admin_decisions_no_client_update
  on public.care_money_flow_admin_decisions
  for update
  using (false)
  with check (false);

drop policy if exists care_money_flow_admin_decisions_no_client_delete on public.care_money_flow_admin_decisions;
create policy care_money_flow_admin_decisions_no_client_delete
  on public.care_money_flow_admin_decisions
  for delete
  using (false);

create or replace function public.touch_care_money_flow_admin_decisions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists care_money_flow_admin_decisions_touch_updated_at on public.care_money_flow_admin_decisions;
create trigger care_money_flow_admin_decisions_touch_updated_at
before update on public.care_money_flow_admin_decisions
for each row execute function public.touch_care_money_flow_admin_decisions_updated_at();

create or replace function public.admin_validate_care_money_flow_decision(
  p_service_chat_id uuid,
  p_decision_type text,
  p_decision_reason text,
  p_admin_note text,
  p_proposed_owner_refund numeric,
  p_proposed_carer_payout numeric,
  p_proposed_platform_retained numeric,
  p_existing_decision_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_is_admin boolean := false;
  v_row record;
  v_has_row boolean := false;
  v_snapshot public.care_money_flow_snapshots%rowtype;
  v_refund numeric := greatest(coalesce(p_proposed_owner_refund, 0), 0);
  v_payout numeric := greatest(coalesce(p_proposed_carer_payout, 0), 0);
  v_retained numeric := greatest(coalesce(p_proposed_platform_retained, 0), 0);
  v_total numeric := 0;
  v_sum numeric := 0;
  v_active_stripe_dispute boolean := false;
  v_requires_sync boolean := false;
  v_duplicate_active boolean := false;
  v_errors text[] := array[]::text[];
  v_warnings text[] := array[]::text[];
  v_snapshot_status text := null;
  v_stripe_dispute_status text := null;
begin
  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(v_is_admin, false) is not true then
    raise exception 'admin_required';
  end if;

  select *
  into v_row
  from public.admin_get_care_transactions() t
  where t.service_chat_id = p_service_chat_id
  limit 1;
  v_has_row := found;

  if not v_has_row then
    return jsonb_build_object(
      'ok', false,
      'status', 'blocked',
      'errors', jsonb_build_array('confirmed_paid_care_session_required'),
      'warnings', jsonb_build_array(),
      'preview', jsonb_build_object()
    );
  end if;

  select *
  into v_snapshot
  from public.care_money_flow_snapshots s
  where s.service_chat_id = p_service_chat_id
  order by s.synced_at desc
  limit 1;

  v_total := coalesce(v_row.total_paid, 0);
  v_sum := round(v_refund + v_payout + v_retained, 2);
  v_snapshot_status := nullif(v_snapshot.normalized_money_flow_status, '');
  v_stripe_dispute_status := lower(coalesce(v_snapshot.dispute ->> 'status', ''));
  v_active_stripe_dispute := v_stripe_dispute_status in (
    'needs_response',
    'under_review',
    'warning_needs_response',
    'warning_under_review'
  );

  v_requires_sync :=
    v_snapshot.id is null
    or nullif(v_snapshot.error_code, '') is not null
    or nullif(v_snapshot.error_message, '') is not null
    or coalesce(v_snapshot.payment_intent_id, '') <> coalesce(v_row.payment_intent_id, '')
    or coalesce(v_snapshot.synced_at, '-infinity'::timestamptz) < coalesce(v_row.db_updated_at, '-infinity'::timestamptz);

  select exists (
    select 1
    from public.care_money_flow_admin_decisions d
    where d.service_chat_id = p_service_chat_id
      and d.status in ('draft', 'submitted', 'ready_for_execution')
      and (p_existing_decision_id is null or d.id <> p_existing_decision_id)
  )
  into v_duplicate_active;

  if p_decision_type not in (
    'no_action_monitor',
    'full_refund_owner',
    'partial_refund_owner',
    'release_payout_to_carer',
    'split_refund_and_partial_payout',
    'manual_review'
  ) then
    v_errors := array_append(v_errors, 'decision_type_invalid');
  end if;

  if nullif(trim(coalesce(p_decision_reason, '')), '') is null then
    v_errors := array_append(v_errors, 'decision_reason_required');
  end if;

  if nullif(trim(coalesce(p_admin_note, '')), '') is null then
    v_errors := array_append(v_errors, 'admin_note_required');
  end if;

  if v_refund > v_total or v_payout > v_total or v_retained > v_total or (v_refund + v_payout) > v_total then
    v_errors := array_append(v_errors, 'amount_exceeds_total_paid');
  end if;

  if abs(v_sum - round(v_total, 2)) > 0.01 then
    v_errors := array_append(v_errors, 'refund_payout_retained_must_balance_total_paid');
  end if;

  if v_active_stripe_dispute and p_decision_type <> 'manual_review' then
    v_errors := array_append(v_errors, 'active_stripe_dispute_blocks_money_decision');
  end if;

  if v_requires_sync then
    v_errors := array_append(v_errors, 'db_stripe_mismatch_requires_sync_first');
  end if;

  if v_duplicate_active then
    v_errors := array_append(v_errors, 'duplicate_active_decision_exists');
  end if;

  if v_snapshot.id is null then
    v_warnings := array_append(v_warnings, 'no_stripe_snapshot_found');
  elsif coalesce(v_snapshot.synced_at, '-infinity'::timestamptz) < coalesce(v_row.db_updated_at, '-infinity'::timestamptz) then
    v_warnings := array_append(v_warnings, 'db_updated_after_last_stripe_sync');
  end if;

  if v_snapshot_status is not null and v_snapshot_status <> v_row.normalized_money_flow_status then
    v_warnings := array_append(v_warnings, 'db_status_differs_from_latest_stripe_snapshot');
  end if;

  if v_active_stripe_dispute then
    v_warnings := array_append(v_warnings, 'active_stripe_dispute_detected');
  end if;

  return jsonb_build_object(
    'ok', cardinality(v_errors) = 0,
    'status', case when cardinality(v_errors) = 0 then 'ready_for_execution' else 'blocked' end,
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings),
    'preview', jsonb_build_object(
      'currency', coalesce(v_row.currency, 'HKD'),
      'total_paid', v_total,
      'owner_refund', v_refund,
      'carer_payout', v_payout,
      'platform_retained', v_retained,
      'balance_delta', round(v_sum - v_total, 2)
    ),
    'db_state', jsonb_build_object(
      'booking_status', v_row.booking_status,
      'dispute_status', v_row.dispute_status,
      'normalized_money_flow_status', v_row.normalized_money_flow_status,
      'db_updated_at', v_row.db_updated_at
    ),
    'stripe_state', jsonb_build_object(
      'snapshot_status', v_snapshot_status,
      'stripe_dispute_status', nullif(v_stripe_dispute_status, ''),
      'stripe_synced_at', v_snapshot.synced_at,
      'payment_intent_id', v_snapshot.payment_intent_id,
      'error_code', v_snapshot.error_code,
      'error_message', v_snapshot.error_message
    )
  );
end;
$function$;

create or replace function public.admin_create_care_money_flow_decision(
  p_service_chat_id uuid,
  p_decision_type text,
  p_decision_reason text,
  p_admin_note text,
  p_proposed_owner_refund numeric,
  p_proposed_carer_payout numeric,
  p_proposed_platform_retained numeric
)
returns public.care_money_flow_admin_decisions
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_is_admin boolean := false;
  v_admin_id uuid := auth.uid();
  v_row record;
  v_has_row boolean := false;
  v_validation jsonb;
  v_inserted public.care_money_flow_admin_decisions%rowtype;
begin
  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_admin_id;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'admin_required';
  end if;

  select *
  into v_row
  from public.admin_get_care_transactions() t
  where t.service_chat_id = p_service_chat_id
  limit 1;
  v_has_row := found;

  if not v_has_row then
    raise exception 'confirmed_paid_care_session_required';
  end if;

  v_validation := public.admin_validate_care_money_flow_decision(
    p_service_chat_id,
    p_decision_type,
    p_decision_reason,
    p_admin_note,
    p_proposed_owner_refund,
    p_proposed_carer_payout,
    p_proposed_platform_retained,
    null
  );

  insert into public.care_money_flow_admin_decisions (
    service_chat_id,
    payment_intent_id,
    admin_id,
    decision_type,
    decision_reason,
    admin_note,
    proposed_owner_refund,
    proposed_carer_payout,
    proposed_platform_retained,
    currency,
    dry_run_result,
    status
  )
  values (
    p_service_chat_id,
    v_row.payment_intent_id,
    v_admin_id,
    p_decision_type,
    trim(p_decision_reason),
    trim(p_admin_note),
    round(greatest(coalesce(p_proposed_owner_refund, 0), 0), 2),
    round(greatest(coalesce(p_proposed_carer_payout, 0), 0), 2),
    round(greatest(coalesce(p_proposed_platform_retained, 0), 0), 2),
    coalesce(v_row.currency, 'HKD'),
    v_validation,
    case when coalesce((v_validation ->> 'ok')::boolean, false) then 'draft' else 'blocked' end
  )
  returning * into v_inserted;

  return v_inserted;
end;
$function$;

create or replace function public.admin_get_care_money_flow_decisions(p_service_chat_id uuid)
returns table (
  id uuid,
  service_chat_id uuid,
  payment_intent_id text,
  admin_id uuid,
  admin_name text,
  decision_type text,
  decision_reason text,
  admin_note text,
  proposed_owner_refund numeric,
  proposed_carer_payout numeric,
  proposed_platform_retained numeric,
  currency text,
  dry_run_result jsonb,
  status text,
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
    d.id,
    d.service_chat_id,
    d.payment_intent_id,
    d.admin_id,
    coalesce(nullif(p.display_name, ''), p.email, d.admin_id::text) as admin_name,
    d.decision_type,
    d.decision_reason,
    d.admin_note,
    d.proposed_owner_refund,
    d.proposed_carer_payout,
    d.proposed_platform_retained,
    d.currency,
    d.dry_run_result,
    d.status,
    d.created_at,
    d.updated_at
  from public.care_money_flow_admin_decisions d
  left join public.profiles p on p.id = d.admin_id
  where d.service_chat_id = p_service_chat_id
  order by d.created_at desc;
end;
$function$;

revoke all on function public.admin_validate_care_money_flow_decision(uuid, text, text, text, numeric, numeric, numeric, uuid) from public, anon;
grant execute on function public.admin_validate_care_money_flow_decision(uuid, text, text, text, numeric, numeric, numeric, uuid) to authenticated, service_role;

revoke all on function public.admin_create_care_money_flow_decision(uuid, text, text, text, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_create_care_money_flow_decision(uuid, text, text, text, numeric, numeric, numeric) to authenticated, service_role;

revoke all on function public.admin_get_care_money_flow_decisions(uuid) from public, anon;
grant execute on function public.admin_get_care_money_flow_decisions(uuid) to authenticated, service_role;

do $$
begin
  begin
    alter table public.care_money_flow_admin_decisions replica identity full;
    alter publication supabase_realtime add table public.care_money_flow_admin_decisions;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

commit;
