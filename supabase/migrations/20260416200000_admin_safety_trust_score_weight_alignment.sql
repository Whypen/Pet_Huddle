-- Align Admin Safety trust read model:
-- trust_score (base) + moderation_adjustment = trust_weight (effective)

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
    p.human_verification_status,
    p.card_verification_status,
    public.normalize_email_for_ban(p.email) as email_norm,
    public.normalize_phone_for_ban(p.phone) as phone_norm
  from candidate_users cu
  left join public.profiles p on p.id = cu.user_id
),
device_flags as (
  select
    d.user_id,
    (count(*) > 0) as device_verified
  from public.device_fingerprint_history d
  group by d.user_id
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
),
trust_model as (
  select
    pn.user_id,
    (
      1
      + case when nullif(trim(coalesce(pn.phone, '')), '') is not null then 1 else 0 end
      + case when coalesce(df.device_verified, false) then 1 else 0 end
      + case when pn.human_verification_status = 'passed' then 1 else 0 end
      + case when pn.card_verification_status = 'passed' then 1 else 0 end
    )::int as trust_score,
    (
      (
        coalesce(ap.penalty_count, 0)
        + coalesce(fr.false_report_count, 0)
      ) * -1
    )::int as moderation_adjustment
  from profile_norm pn
  left join device_flags df on df.user_id = pn.user_id
  left join audit_penalties ap on ap.user_id = pn.user_id
  left join false_reports fr on fr.user_id = pn.user_id
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
  greatest(0, tm.trust_score + tm.moderation_adjustment)::int as trust_weight,
  dc.disputes_involved,
  greatest(
    coalesce(rc.latest_report_activity, to_timestamp(0)),
    coalesce(dc.latest_dispute_at, to_timestamp(0)),
    coalesce(ap.latest_penalty_at, to_timestamp(0)),
    coalesce(fr.last_penalized_at, to_timestamp(0)),
    coalesce(la.latest_audit_at, to_timestamp(0)),
    coalesce(ms.moderation_updated_at, to_timestamp(0))
  ) as latest_safety_activity,
  tm.trust_score,
  tm.moderation_adjustment
from profile_norm pn
left join report_counts rc on rc.user_id = pn.user_id
left join dispute_counts dc on dc.user_id = pn.user_id
left join audit_penalties ap on ap.user_id = pn.user_id
left join false_reports fr on fr.user_id = pn.user_id
left join moderation_state ms on ms.user_id = pn.user_id
left join ban_state bs on bs.user_id = pn.user_id
left join latest_audit la on la.user_id = pn.user_id
left join trust_model tm on tm.user_id = pn.user_id
where exists (
  select 1
  from public.profiles p
  where p.id = auth.uid()
    and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
);

alter view if exists public.view_admin_safety_users set (security_invoker = true);
