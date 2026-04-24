-- Read-only adapters for /admin/safety
-- No payout/refund/transfer mutation logic.

create or replace view public.view_admin_reports_queue as
with reports as (
  select
    ur.target_id as target_user_id,
    count(*)::bigint as report_count,
    count(distinct ur.reporter_id)::bigint as unique_reporters,
    coalesce(sum(ur.score), 0)::bigint as total_score,
    max(ur.created_at) as latest_report_at,
    bool_or(cardinality(coalesce(ur.attachment_urls, '{}'::text[])) > 0) as has_attachments,
    array_remove(array_agg(distinct cat.category), null) as category_tags
  from public.user_reports ur
  left join lateral unnest(ur.categories) as cat(category) on true
  group by ur.target_id
)
select
  r.target_user_id,
  r.report_count,
  r.unique_reporters,
  r.total_score,
  r.latest_report_at,
  r.has_attachments,
  coalesce(r.category_tags, '{}'::text[]) as category_tags,
  sr_latest.subject as latest_support_subject,
  sr_latest.message as latest_support_message,
  sr_latest.created_at as latest_support_created_at
from reports r
left join lateral (
  select sr.subject, sr.message, sr.created_at
  from public.support_requests sr
  where sr.user_id = r.target_user_id
    and lower(coalesce(sr.category, '')) = 'user_report'
  order by sr.created_at desc nulls last
  limit 1
) sr_latest on true
where exists (
  select 1
  from public.profiles p
  where p.id = auth.uid()
    and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
);

create or replace view public.view_admin_report_casefile as
select
  ur.id as report_id,
  ur.target_id as target_user_id,
  ur.reporter_id as reporter_user_id,
  ur.categories,
  ur.score,
  ur.details,
  ur.attachment_urls,
  ur.created_at as report_created_at,
  target_profile.display_name as target_display_name,
  reporter_profile.display_name as reporter_display_name,
  sr_latest.id as support_request_id,
  sr_latest.subject as support_subject,
  sr_latest.message as support_message,
  sr_latest.created_at as support_created_at
from public.user_reports ur
left join public.profiles target_profile on target_profile.id = ur.target_id
left join public.profiles reporter_profile on reporter_profile.id = ur.reporter_id
left join lateral (
  select sr.id, sr.subject, sr.message, sr.created_at
  from public.support_requests sr
  where sr.user_id = ur.target_id
    and lower(coalesce(sr.category, '')) = 'user_report'
  order by sr.created_at desc nulls last
  limit 1
) sr_latest on true
where exists (
  select 1
  from public.profiles p
  where p.id = auth.uid()
    and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
);

create or replace view public.view_admin_service_disputes_queue as
select
  sd.id as dispute_id,
  sd.service_chat_id,
  sd.status as dispute_status,
  sd.category as dispute_category,
  sd.created_at as dispute_created_at,
  sd.updated_at as dispute_updated_at,
  sd.filed_by,
  cardinality(coalesce(sd.evidence_urls, '{}'::text[]))::int as evidence_count,
  sc.requester_id,
  sc.provider_id,
  sc.status as chat_status,
  sc.request_opened_at,
  sc.stripe_payment_intent_id,
  sc.payout_release_requested_at,
  sc.payout_released_at,
  requester_profile.display_name as requester_display_name,
  provider_profile.display_name as provider_display_name
from public.service_disputes sd
join public.service_chats sc on sc.id = sd.service_chat_id
left join public.profiles requester_profile on requester_profile.id = sc.requester_id
left join public.profiles provider_profile on provider_profile.id = sc.provider_id
where exists (
  select 1
  from public.profiles p
  where p.id = auth.uid()
    and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
);

create or replace view public.view_admin_safety_audit_timeline as
select
  aal.id as audit_id,
  aal.created_at,
  aal.action,
  aal.actor_id,
  actor_profile.display_name as actor_display_name,
  aal.target_user_id,
  target_profile.display_name as target_display_name,
  aal.notes,
  aal.details
from public.admin_audit_logs aal
left join public.profiles actor_profile on actor_profile.id = aal.actor_id
left join public.profiles target_profile on target_profile.id = aal.target_user_id
where exists (
  select 1
  from public.profiles p
  where p.id = auth.uid()
    and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
);

revoke all on public.view_admin_reports_queue from public;
revoke all on public.view_admin_report_casefile from public;
revoke all on public.view_admin_service_disputes_queue from public;
revoke all on public.view_admin_safety_audit_timeline from public;

grant select on public.view_admin_reports_queue to authenticated;
grant select on public.view_admin_report_casefile to authenticated;
grant select on public.view_admin_service_disputes_queue to authenticated;
grant select on public.view_admin_safety_audit_timeline to authenticated;

grant select on public.view_admin_reports_queue to service_role;
grant select on public.view_admin_report_casefile to service_role;
grant select on public.view_admin_service_disputes_queue to service_role;
grant select on public.view_admin_safety_audit_timeline to service_role;
