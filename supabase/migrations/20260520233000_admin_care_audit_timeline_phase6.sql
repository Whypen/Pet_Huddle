begin;

create or replace function public.admin_get_care_money_flow_audit_timeline(p_service_chat_id uuid)
returns table (
  event_id uuid,
  service_chat_id uuid,
  event_type text,
  event_status text,
  admin_id uuid,
  admin_name text,
  occurred_at timestamptz,
  short_note text,
  source_table text
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
  select *
  from (
    select
      s.id as event_id,
      s.service_chat_id,
      'stripe_snapshot'::text as event_type,
      coalesce(nullif(s.normalized_money_flow_status, ''), coalesce(s.error_code, 'synced')) as event_status,
      s.synced_by_admin_id as admin_id,
      coalesce(nullif(sp.display_name, ''), sp.email, s.synced_by_admin_id::text) as admin_name,
      s.synced_at as occurred_at,
      left(nullif(coalesce(s.error_message, s.error_code, s.normalized_money_flow_status), ''), 240) as short_note,
      'care_money_flow_snapshots'::text as source_table
    from public.care_money_flow_snapshots s
    left join public.profiles sp on sp.id = s.synced_by_admin_id
    where s.service_chat_id = p_service_chat_id

    union all

    select
      d.id as event_id,
      d.service_chat_id,
      'admin_decision'::text as event_type,
      d.status as event_status,
      d.admin_id,
      coalesce(nullif(dp.display_name, ''), dp.email, d.admin_id::text) as admin_name,
      coalesce(d.submitted_at, d.updated_at, d.created_at) as occurred_at,
      left(nullif(coalesce(d.cancellation_reason, d.admin_note, d.decision_reason), ''), 240) as short_note,
      'care_money_flow_admin_decisions'::text as source_table
    from public.care_money_flow_admin_decisions d
    left join public.profiles dp on dp.id = d.admin_id
    where d.service_chat_id = p_service_chat_id

    union all

    select
      l.id as event_id,
      l.service_chat_id,
      'execution_lock'::text as event_type,
      l.lock_status as event_status,
      coalesce(l.cancelled_by_admin_id, l.locked_by_admin_id) as admin_id,
      coalesce(nullif(lp.display_name, ''), lp.email, coalesce(l.cancelled_by_admin_id, l.locked_by_admin_id)::text) as admin_name,
      coalesce(l.cancelled_at, l.locked_at, l.updated_at, l.created_at) as occurred_at,
      left(nullif(coalesce(l.cancellation_reason, l.admin_note, l.decision_type), ''), 240) as short_note,
      'care_money_flow_execution_locks'::text as source_table
    from public.care_money_flow_execution_locks l
    left join public.profiles lp on lp.id = coalesce(l.cancelled_by_admin_id, l.locked_by_admin_id)
    where l.service_chat_id = p_service_chat_id

    union all

    select
      a.id as event_id,
      a.service_chat_id,
      'execution_attempt'::text as event_type,
      a.status as event_status,
      a.requested_by_admin_id as admin_id,
      coalesce(nullif(ap.display_name, ''), ap.email, a.requested_by_admin_id::text) as admin_name,
      coalesce(a.updated_at, a.created_at) as occurred_at,
      left(nullif(coalesce(a.error_message, a.error_code, a.requested_action), ''), 240) as short_note,
      'care_money_flow_execution_attempts'::text as source_table
    from public.care_money_flow_execution_attempts a
    left join public.profiles ap on ap.id = a.requested_by_admin_id
    where a.service_chat_id = p_service_chat_id

    union all

    select
      e.id as event_id,
      e.service_chat_id,
      'execution_approval'::text as event_type,
      e.approval_status as event_status,
      e.approver_admin_id as admin_id,
      coalesce(nullif(ep.display_name, ''), ep.email, e.approver_admin_id::text) as admin_name,
      coalesce(e.approved_at, e.rejected_at, e.revoked_at, e.updated_at, e.created_at) as occurred_at,
      left(nullif(coalesce(e.approval_note, e.approval_role), ''), 240) as short_note,
      'care_money_flow_execution_approvals'::text as source_table
    from public.care_money_flow_execution_approvals e
    left join public.profiles ep on ep.id = e.approver_admin_id
    where e.service_chat_id = p_service_chat_id
  ) timeline
  order by timeline.occurred_at desc nulls last, timeline.source_table asc
  limit 200;
end;
$function$;

revoke all on function public.admin_get_care_money_flow_audit_timeline(uuid) from public, anon;
grant execute on function public.admin_get_care_money_flow_audit_timeline(uuid) to authenticated, service_role;

commit;
