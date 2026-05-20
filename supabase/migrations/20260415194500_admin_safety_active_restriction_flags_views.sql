begin;

create or replace view public.view_admin_reports_queue as
with reports as (
  select
    ur.target_id as target_user_id,
    count(*) as report_count,
    count(distinct ur.reporter_id) as unique_reporters,
    coalesce(sum(ur.score), 0) as total_score,
    max(ur.created_at) as latest_report_at,
    bool_or(cardinality(coalesce(ur.attachment_urls, '{}'::text[])) > 0) as has_attachments,
    array_remove(array_agg(distinct cat.category), null) as category_tags,
    max(ur.source_origin) filter (
      where ur.created_at = (
        select max(ur2.created_at)
        from public.user_reports ur2
        where ur2.target_id = ur.target_id
      )
    ) as latest_report_source
  from public.user_reports ur
  left join lateral unnest(ur.categories) cat(category) on true
  group by ur.target_id
),
active_restrictions as (
  select
    umr.user_id,
    jsonb_object_agg(umr.restriction_key, true) as restriction_flags
  from public.user_moderation_restrictions umr
  where umr.disabled_at is null
    and umr.enabled_at <= now()
    and (umr.expires_at is null or umr.expires_at > now())
  group by umr.user_id
)
select
  r.target_user_id,
  tp.display_name as target_display_name,
  tp.social_id as target_social_id,
  r.report_count,
  r.unique_reporters,
  r.total_score,
  r.latest_report_at,
  r.has_attachments,
  coalesce(r.category_tags, '{}'::text[]) as category_tags,
  coalesce(r.latest_report_source, 'unknown') as latest_report_source,
  sr_latest.subject as latest_support_subject,
  sr_latest.message as latest_support_message,
  sr_latest.created_at as latest_support_created_at,
  coalesce(um.moderation_state, 'active') as moderation_state,
  coalesce(um.automation_paused, false) as automation_paused,
  coalesce(ar.restriction_flags, '{}'::jsonb) as restriction_flags,
  coalesce(um.case_status, 'open') as case_status,
  latest_audit.action_source as latest_action_source,
  latest_audit.action as latest_action,
  latest_audit.created_at as latest_action_at,
  latest_audit.actor_id as latest_action_by_id,
  latest_audit.actor_display_name as latest_action_by_display_name
from reports r
left join public.profiles tp on tp.id = r.target_user_id
left join public.user_moderation um on um.user_id = r.target_user_id
left join active_restrictions ar on ar.user_id = r.target_user_id
left join lateral (
  select sr.subject, sr.message, sr.created_at
  from public.support_requests sr
  where sr.user_id = r.target_user_id
    and lower(coalesce(sr.category, '')) = 'user_report'
  order by sr.created_at desc nulls last
  limit 1
) sr_latest on true
left join lateral (
  select
    aal.action,
    aal.created_at,
    aal.actor_id,
    actor_profile.display_name as actor_display_name,
    case
      when lower(coalesce(aal.details ->> 'source', '')) = 'sentinel' then 'sentinel'
      else 'manual'
    end as action_source
  from public.admin_audit_logs aal
  left join public.profiles actor_profile on actor_profile.id = aal.actor_id
  where aal.target_user_id = r.target_user_id
    and aal.action like 'reports_%'
  order by aal.created_at desc nulls last
  limit 1
) latest_audit on true
where exists (
  select 1
  from public.profiles p
  where p.id = auth.uid()
    and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
);

create or replace view public.view_admin_report_casefile as
with active_restrictions as (
  select
    umr.user_id,
    jsonb_object_agg(umr.restriction_key, true) as restriction_flags
  from public.user_moderation_restrictions umr
  where umr.disabled_at is null
    and umr.enabled_at <= now()
    and (umr.expires_at is null or umr.expires_at > now())
  group by umr.user_id
)
select
  ur.id as report_id,
  ur.target_id as target_user_id,
  ur.reporter_id as reporter_user_id,
  ur.categories,
  ur.score,
  ur.details,
  ur.attachment_urls,
  coalesce(ur.source_origin, 'unknown') as source_origin,
  ur.created_at as report_created_at,
  target_profile.display_name as target_display_name,
  target_profile.social_id as target_social_id,
  reporter_profile.display_name as reporter_display_name,
  reporter_profile.social_id as reporter_social_id,
  sr_latest.id as support_request_id,
  sr_latest.subject as support_subject,
  sr_latest.message as support_message,
  sr_latest.created_at as support_created_at,
  coalesce(um.moderation_state, 'active') as moderation_state,
  coalesce(um.automation_paused, false) as automation_paused,
  coalesce(ar.restriction_flags, '{}'::jsonb) as restriction_flags,
  coalesce(um.case_status, 'open') as case_status,
  um.reason_internal as moderation_note,
  coalesce(rfp.false_report_count, 0) as reporter_false_report_count
from public.user_reports ur
left join public.profiles target_profile on target_profile.id = ur.target_id
left join public.profiles reporter_profile on reporter_profile.id = ur.reporter_id
left join public.user_moderation um on um.user_id = ur.target_id
left join active_restrictions ar on ar.user_id = ur.target_id
left join public.reporter_false_report_penalties rfp on rfp.reporter_user_id = ur.reporter_id
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

commit;
