-- /admin/safety enhancement: users tab + unified safety timeline + disputes identity fields
-- Read-only/moderation data contract only. No Stripe/payment/webhook/service dispute mutation paths.

drop view if exists public.view_admin_service_disputes_queue;
create view public.view_admin_service_disputes_queue as
select
  sd.id as dispute_id,
  sd.service_chat_id,
  sd.status as dispute_status,
  sd.category as dispute_category,
  sd.created_at as dispute_created_at,
  sd.updated_at as dispute_updated_at,
  sd.filed_by,
  cardinality(coalesce(sd.evidence_urls, '{}'::text[]))::int as evidence_count,
  sd.evidence_urls,
  sc.requester_id,
  sc.provider_id,
  sc.status as chat_status,
  sc.request_opened_at,
  sc.stripe_payment_intent_id,
  sc.payout_release_requested_at,
  sc.payout_released_at,
  requester_profile.display_name as requester_display_name,
  requester_profile.social_id as requester_social_id,
  provider_profile.display_name as provider_display_name,
  provider_profile.social_id as provider_social_id
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

create or replace view public.view_admin_safety_users as
with candidate_users as (
  select ur.target_id as user_id from public.user_reports ur
  union
  select ur.reporter_id as user_id from public.user_reports ur
  union
  select sc.requester_id as user_id from public.service_chats sc
  union
  select sc.provider_id as user_id from public.service_chats sc
  union
  select sd.filed_by as user_id from public.service_disputes sd
  union
  select um.user_id as user_id from public.user_moderation um
  union
  select rfp.reporter_user_id as user_id from public.reporter_false_report_penalties rfp
  union
  select bi.source_user_id as user_id from public.banned_identifiers bi where bi.source_user_id is not null
  union
  select aal.target_user_id as user_id from public.admin_audit_logs aal where aal.target_user_id is not null
  union
  select aal.actor_id as user_id from public.admin_audit_logs aal where aal.actor_id is not null
),
profile_norm as (
  select
    cu.user_id,
    p.display_name,
    p.social_id,
    p.email,
    p.phone,
    p.user_role,
    p.is_verified,
    public.normalize_email_for_ban(p.email) as email_norm,
    public.normalize_phone_for_ban(p.phone) as phone_norm
  from candidate_users cu
  left join public.profiles p on p.id = cu.user_id
),
report_counts as (
  select
    u.user_id,
    coalesce(rr.reports_received, 0) as reports_received,
    coalesce(rf.reports_filed, 0) as reports_filed,
    greatest(coalesce(rr.latest_received_at, to_timestamp(0)), coalesce(rf.latest_filed_at, to_timestamp(0))) as latest_report_activity
  from (select distinct user_id from candidate_users) u
  left join (
    select target_id as user_id, count(*)::bigint as reports_received, max(created_at) as latest_received_at
    from public.user_reports
    group by target_id
  ) rr on rr.user_id = u.user_id
  left join (
    select reporter_id as user_id, count(*)::bigint as reports_filed, max(created_at) as latest_filed_at
    from public.user_reports
    group by reporter_id
  ) rf on rf.user_id = u.user_id
),
dispute_counts as (
  select
    u.user_id,
    coalesce(d.disputes_involved, 0) as disputes_involved,
    d.latest_dispute_at
  from (select distinct user_id from candidate_users) u
  left join (
    select
      x.user_id,
      count(*)::bigint as disputes_involved,
      max(x.dispute_created_at) as latest_dispute_at
    from (
      select sc.requester_id as user_id, sd.created_at as dispute_created_at
      from public.service_disputes sd
      join public.service_chats sc on sc.id = sd.service_chat_id
      union all
      select sc.provider_id as user_id, sd.created_at as dispute_created_at
      from public.service_disputes sd
      join public.service_chats sc on sc.id = sd.service_chat_id
      union all
      select sd.filed_by as user_id, sd.created_at as dispute_created_at
      from public.service_disputes sd
    ) x
    group by x.user_id
  ) d on d.user_id = u.user_id
),
audit_penalties as (
  select
    u.user_id,
    coalesce(a.penalty_count, 0) as penalty_count,
    coalesce(a.penalty_score, 0) as cumulative_penalty_score,
    a.latest_penalty_at
  from (select distinct user_id from candidate_users) u
  left join (
    select
      aal.target_user_id as user_id,
      count(*)::bigint as penalty_count,
      sum(
        case aal.action
          when 'reports_warn' then 1
          when 'reports_shadow_restrict' then 3
          when 'reports_hard_ban' then 10
          else 0
        end
      )::bigint as penalty_score,
      max(aal.created_at) as latest_penalty_at
    from public.admin_audit_logs aal
    where aal.target_user_id is not null
      and aal.action in ('reports_warn', 'reports_shadow_restrict', 'reports_hard_ban')
    group by aal.target_user_id
  ) a on a.user_id = u.user_id
),
false_reports as (
  select
    u.user_id,
    coalesce(rfp.false_report_count, 0) as false_report_count,
    rfp.last_penalized_at
  from (select distinct user_id from candidate_users) u
  left join public.reporter_false_report_penalties rfp on rfp.reporter_user_id = u.user_id
),
moderation_state as (
  select
    u.user_id,
    coalesce(um.moderation_state, 'active') as moderation_state,
    coalesce(um.automation_paused, false) as automation_paused,
    coalesce(um.case_status, 'open') as case_status,
    um.updated_at as moderation_updated_at
  from (select distinct user_id from candidate_users) u
  left join public.user_moderation um on um.user_id = u.user_id
),
ban_state as (
  select
    pn.user_id,
    exists (
      select 1
      from public.banned_identifiers bi
      where bi.active = true
        and (bi.expires_at is null or bi.expires_at > now())
        and (
          bi.source_user_id = pn.user_id
          or (
            pn.email_norm is not null
            and bi.identifier_type = 'email'
            and bi.identifier_hash = public.hash_identifier(pn.email_norm)
          )
          or (
            pn.phone_norm is not null
            and bi.identifier_type = 'phone'
            and bi.identifier_hash = public.hash_identifier(pn.phone_norm)
          )
        )
    ) as has_banned_identifier
  from profile_norm pn
),
latest_audit as (
  select target_user_id as user_id, max(created_at) as latest_audit_at
  from public.admin_audit_logs
  where target_user_id is not null
  group by target_user_id
)
select
  pn.user_id,
  coalesce(pn.display_name, 'Unknown User') as display_name,
  pn.social_id,
  ms.moderation_state,
  ms.automation_paused,
  ms.case_status,
  (coalesce(ms.moderation_state, 'active') = 'banned' or coalesce(bs.has_banned_identifier, false)) as is_banned_effective,
  rc.reports_received,
  rc.reports_filed,
  fr.false_report_count,
  (ap.penalty_count + case when fr.false_report_count > 0 then 1 else 0 end)::bigint as penalty_count,
  (ap.cumulative_penalty_score + (fr.false_report_count * 2))::bigint as cumulative_penalty_score,
  case
    when lower(coalesce(pn.user_role, '')) like '%vet%' and coalesce(pn.is_verified, false) = true then 3
    when lower(coalesce(pn.user_role, '')) in ('provider', 'carer', 'pet carer', 'service_provider', 'verified_provider') then 2
    when coalesce(pn.is_verified, false) = true then 1
    else 0
  end as trust_weight,
  dc.disputes_involved,
  greatest(
    coalesce(rc.latest_report_activity, to_timestamp(0)),
    coalesce(dc.latest_dispute_at, to_timestamp(0)),
    coalesce(ap.latest_penalty_at, to_timestamp(0)),
    coalesce(fr.last_penalized_at, to_timestamp(0)),
    coalesce(la.latest_audit_at, to_timestamp(0)),
    coalesce(ms.moderation_updated_at, to_timestamp(0))
  ) as latest_safety_activity
from profile_norm pn
left join report_counts rc on rc.user_id = pn.user_id
left join dispute_counts dc on dc.user_id = pn.user_id
left join audit_penalties ap on ap.user_id = pn.user_id
left join false_reports fr on fr.user_id = pn.user_id
left join moderation_state ms on ms.user_id = pn.user_id
left join ban_state bs on bs.user_id = pn.user_id
left join latest_audit la on la.user_id = pn.user_id
where exists (
  select 1
  from public.profiles p
  where p.id = auth.uid()
    and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
);

create or replace view public.view_admin_safety_user_timeline as
select
  ur.target_id as user_id,
  'report_received'::text as event_type,
  'reports_received'::text as event_group,
  ur.created_at as event_date,
  coalesce('Report received from ' || coalesce(rp.display_name, ur.reporter_id::text), 'Report received') as description,
  ur.id::text as related_id,
  case when ur.score >= 8 then 'high' when ur.score >= 5 then 'medium' else 'low' end as severity,
  'report'::text as source
from public.user_reports ur
left join public.profiles rp on rp.id = ur.reporter_id

union all

select
  ur.reporter_id as user_id,
  'report_filed'::text as event_type,
  'reports_filed'::text as event_group,
  ur.created_at as event_date,
  coalesce('Report filed against ' || coalesce(tp.display_name, ur.target_id::text), 'Report filed') as description,
  ur.id::text as related_id,
  case when ur.score >= 8 then 'high' when ur.score >= 5 then 'medium' else 'low' end as severity,
  'report'::text as source
from public.user_reports ur
left join public.profiles tp on tp.id = ur.target_id

union all

select
  x.user_id,
  'dispute_involved'::text as event_type,
  'disputes'::text as event_group,
  x.event_date,
  x.description,
  x.related_id,
  'medium'::text as severity,
  'dispute'::text as source
from (
  select
    sc.requester_id as user_id,
    sd.created_at as event_date,
    ('Dispute on service chat ' || sd.service_chat_id::text) as description,
    sd.id::text as related_id
  from public.service_disputes sd
  join public.service_chats sc on sc.id = sd.service_chat_id
  union all
  select
    sc.provider_id as user_id,
    sd.created_at as event_date,
    ('Dispute on service chat ' || sd.service_chat_id::text) as description,
    sd.id::text as related_id
  from public.service_disputes sd
  join public.service_chats sc on sc.id = sd.service_chat_id
) x

union all

select
  aal.target_user_id as user_id,
  'penalty_action'::text as event_type,
  'penalties'::text as event_group,
  aal.created_at as event_date,
  coalesce(aal.action, 'Penalty action') as description,
  aal.id::text as related_id,
  case aal.action when 'reports_hard_ban' then 'high' when 'reports_shadow_restrict' then 'medium' else 'low' end as severity,
  coalesce(nullif(lower(aal.details->>'source'), ''), 'manual') as source
from public.admin_audit_logs aal
where aal.target_user_id is not null
  and aal.action in ('reports_warn', 'reports_shadow_restrict', 'reports_hard_ban', 'reports_clear_restrictions', 'reports_mark_dismissed')

union all

select
  (aal.details->>'penalized_reporter_user_id')::uuid as user_id,
  'false_report_penalty'::text as event_type,
  'penalties'::text as event_group,
  aal.created_at as event_date,
  'False report penalty applied'::text as description,
  aal.id::text as related_id,
  'medium'::text as severity,
  coalesce(nullif(lower(aal.details->>'source'), ''), 'manual') as source
from public.admin_audit_logs aal
where coalesce(aal.details->>'penalized_reporter_user_id', '') <> ''

union all

select
  coalesce(aal.target_user_id, aal.actor_id) as user_id,
  'audit_event'::text as event_type,
  'audit'::text as event_group,
  aal.created_at as event_date,
  coalesce(aal.action, 'Audit event') as description,
  aal.id::text as related_id,
  'low'::text as severity,
  coalesce(nullif(lower(aal.details->>'source'), ''), 'manual') as source
from public.admin_audit_logs aal
where aal.target_user_id is not null

;

revoke all on public.view_admin_service_disputes_queue from public;
revoke all on public.view_admin_safety_users from public;
revoke all on public.view_admin_safety_user_timeline from public;

grant select on public.view_admin_service_disputes_queue to authenticated;
grant select on public.view_admin_safety_users to authenticated;
grant select on public.view_admin_safety_user_timeline to authenticated;

grant select on public.view_admin_service_disputes_queue to service_role;
grant select on public.view_admin_safety_users to service_role;
grant select on public.view_admin_safety_user_timeline to service_role;
