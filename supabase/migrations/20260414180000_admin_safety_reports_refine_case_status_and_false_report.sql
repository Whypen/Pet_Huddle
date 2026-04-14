-- Refine /admin/safety reports moderation UX data contract
-- Scope: moderation-only tables/functions/views. No Stripe/payment/webhook/service dispute mutations.

alter table public.user_moderation
  add column if not exists case_status text not null default 'open';

alter table public.user_moderation
  drop constraint if exists user_moderation_case_status_check;

alter table public.user_moderation
  add constraint user_moderation_case_status_check
  check (case_status in ('open', 'resolved', 'dismissed'));

create table if not exists public.reporter_false_report_penalties (
  reporter_user_id uuid primary key references public.profiles(id) on delete cascade,
  false_report_count integer not null default 0,
  last_penalized_at timestamptz,
  last_penalized_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on public.reporter_false_report_penalties from public, anon, authenticated;
grant select on public.reporter_false_report_penalties to service_role;

drop function if exists public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean);
drop function if exists public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid);

create or replace function public.admin_apply_report_moderation(
  p_target_user_id uuid,
  p_action text,
  p_note text default null,
  p_restriction_flags jsonb default '{}'::jsonb,
  p_pause_sentinel boolean default null,
  p_reporter_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_pause boolean := p_pause_sentinel;
  v_restrictions jsonb := '{}'::jsonb;
  v_allowed_flags text[] := array['chat_disabled', 'discovery_hidden', 'social_posting_disabled', 'marketplace_hidden', 'service_disabled', 'map_hidden', 'map_disabled'];
  v_key text;
  v_ban_result jsonb := '{}'::jsonb;
  v_result_action text;
  v_result_state text;
  v_result_paused boolean;
  v_result_case_status text;
  v_false_report_count integer := null;
begin
  if v_actor is null then
    raise exception 'auth_required';
  end if;

  select (
    coalesce(p.is_admin, false) = true
    or lower(coalesce(p.user_role, '')) = 'admin'
  )
  into v_is_admin
  from public.profiles p
  where p.id = v_actor;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'not_authorized';
  end if;

  if p_target_user_id is null then
    raise exception 'target_user_required';
  end if;

  if v_action not in (
    'clear_restrictions',
    'warn',
    'shadow_restrict',
    'hard_ban',
    'pause_sentinel',
    'mark_dismissed',
    'mark_false_report'
  ) then
    raise exception 'invalid_action';
  end if;

  if v_action in ('hard_ban', 'mark_false_report') and v_note is null then
    raise exception 'moderator_note_required';
  end if;

  if v_action = 'pause_sentinel' and v_pause is null then
    raise exception 'pause_state_required';
  end if;

  if v_action = 'mark_false_report' and p_reporter_user_id is null then
    raise exception 'reporter_user_required';
  end if;

  if v_action = 'shadow_restrict' then
    v_restrictions := '{}'::jsonb;
    for v_key in select unnest(v_allowed_flags)
    loop
      if coalesce((p_restriction_flags ->> v_key)::boolean, false) then
        v_restrictions := v_restrictions || jsonb_build_object(v_key, true);
      end if;
    end loop;
  end if;

  if v_action = 'clear_restrictions' then
    insert into public.user_moderation (user_id, moderation_state, reason_internal, restriction_flags, case_status, updated_at)
    values (p_target_user_id, 'active', v_note, '{}'::jsonb, 'resolved', now())
    on conflict (user_id) do update
      set moderation_state = 'active',
          reason_internal = coalesce(excluded.reason_internal, public.user_moderation.reason_internal),
          restriction_flags = '{}'::jsonb,
          case_status = 'resolved',
          updated_at = now();

    v_result_action := 'reports_clear_restrictions';
  elsif v_action = 'warn' then
    insert into public.user_moderation (user_id, moderation_state, reason_internal, case_status, updated_at)
    values (p_target_user_id, 'under_review', v_note, 'resolved', now())
    on conflict (user_id) do update
      set moderation_state = 'under_review',
          reason_internal = coalesce(excluded.reason_internal, public.user_moderation.reason_internal),
          case_status = 'resolved',
          updated_at = now();

    v_result_action := 'reports_warn';
  elsif v_action = 'shadow_restrict' then
    insert into public.user_moderation (user_id, moderation_state, reason_internal, restriction_flags, case_status, updated_at)
    values (p_target_user_id, 'shadow_restricted', v_note, coalesce(v_restrictions, '{}'::jsonb), 'resolved', now())
    on conflict (user_id) do update
      set moderation_state = 'shadow_restricted',
          reason_internal = coalesce(excluded.reason_internal, public.user_moderation.reason_internal),
          restriction_flags = excluded.restriction_flags,
          case_status = 'resolved',
          updated_at = now();

    v_result_action := 'reports_shadow_restrict';
  elsif v_action = 'hard_ban' then
    select public.admin_ban_user(
      p_user_id := p_target_user_id,
      p_reason_internal := v_note,
      p_public_message := 'Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.',
      p_block_email := true,
      p_block_phone := true,
      p_metadata := jsonb_build_object('source', 'manual', 'action', 'hard_ban')
    ) into v_ban_result;

    insert into public.user_moderation (user_id, moderation_state, reason_internal, case_status, updated_at)
    values (p_target_user_id, 'banned', v_note, 'resolved', now())
    on conflict (user_id) do update
      set moderation_state = 'banned',
          reason_internal = excluded.reason_internal,
          case_status = 'resolved',
          updated_at = now();

    v_result_action := 'reports_hard_ban';
  elsif v_action = 'pause_sentinel' then
    insert into public.user_moderation (user_id, moderation_state, automation_paused, reason_internal, case_status, updated_at)
    values (p_target_user_id, 'active', v_pause, v_note, 'open', now())
    on conflict (user_id) do update
      set automation_paused = v_pause,
          reason_internal = coalesce(excluded.reason_internal, public.user_moderation.reason_internal),
          updated_at = now();

    v_result_action := case when v_pause then 'reports_pause_sentinel' else 'reports_resume_sentinel' end;
  elsif v_action = 'mark_dismissed' then
    insert into public.user_moderation (user_id, moderation_state, reason_internal, case_status, updated_at)
    values (p_target_user_id, 'active', v_note, 'dismissed', now())
    on conflict (user_id) do update
      set case_status = 'dismissed',
          reason_internal = coalesce(excluded.reason_internal, public.user_moderation.reason_internal),
          updated_at = now();

    v_result_action := 'reports_mark_dismissed';
  elsif v_action = 'mark_false_report' then
    insert into public.reporter_false_report_penalties (
      reporter_user_id,
      false_report_count,
      last_penalized_at,
      last_penalized_by,
      metadata,
      updated_at
    )
    values (
      p_reporter_user_id,
      1,
      now(),
      v_actor,
      jsonb_build_object(
        'source', 'manual',
        'target_user_id', p_target_user_id,
        'note', v_note
      ),
      now()
    )
    on conflict (reporter_user_id) do update
      set false_report_count = public.reporter_false_report_penalties.false_report_count + 1,
          last_penalized_at = now(),
          last_penalized_by = v_actor,
          metadata = coalesce(public.reporter_false_report_penalties.metadata, '{}'::jsonb) || jsonb_build_object(
            'source', 'manual',
            'target_user_id', p_target_user_id,
            'note', v_note
          ),
          updated_at = now()
    returning false_report_count into v_false_report_count;

    v_result_action := 'reports_mark_false_report';
  end if;

  select
    um.moderation_state,
    coalesce(um.automation_paused, false),
    coalesce(um.case_status, 'open')
  into v_result_state, v_result_paused, v_result_case_status
  from public.user_moderation um
  where um.user_id = p_target_user_id;

  insert into public.admin_audit_logs(actor_id, action, target_user_id, notes, details)
  values (
    v_actor,
    v_result_action,
    p_target_user_id,
    v_note,
    jsonb_build_object(
      'requested_action', v_action,
      'moderation_state', coalesce(v_result_state, 'active'),
      'automation_paused', coalesce(v_result_paused, false),
      'case_status', coalesce(v_result_case_status, 'open'),
      'restriction_flags', coalesce(v_restrictions, '{}'::jsonb),
      'pause_sentinel', v_pause,
      'ban_result', coalesce(v_ban_result, '{}'::jsonb),
      'source', 'manual',
      'penalized_reporter_user_id', p_reporter_user_id,
      'false_report_count', v_false_report_count
    )
  );

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'moderation_state', coalesce(v_result_state, 'active'),
    'automation_paused', coalesce(v_result_paused, false),
    'case_status', coalesce(v_result_case_status, 'open'),
    'restriction_flags', coalesce(v_restrictions, '{}'::jsonb),
    'penalized_reporter_user_id', p_reporter_user_id,
    'false_report_count', v_false_report_count
  );
end;
$$;

revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid) from public;
revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid) from anon;
revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid) from authenticated;
revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid) from service_role;
grant execute on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid) to authenticated;
grant execute on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid) to service_role;

drop view if exists public.view_admin_reports_queue;
create view public.view_admin_reports_queue as
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
  tp.display_name as target_display_name,
  tp.social_id as target_social_id,
  r.report_count,
  r.unique_reporters,
  r.total_score,
  r.latest_report_at,
  r.has_attachments,
  coalesce(r.category_tags, '{}'::text[]) as category_tags,
  sr_latest.subject as latest_support_subject,
  sr_latest.message as latest_support_message,
  sr_latest.created_at as latest_support_created_at,
  coalesce(um.moderation_state, 'active') as moderation_state,
  coalesce(um.automation_paused, false) as automation_paused,
  coalesce(um.restriction_flags, '{}'::jsonb) as restriction_flags,
  coalesce(um.case_status, 'open') as case_status,
  coalesce(latest_audit.action_source, 'manual') as latest_action_source,
  latest_audit.action as latest_action,
  latest_audit.created_at as latest_action_at,
  latest_audit.actor_id as latest_action_by_id,
  latest_audit.actor_display_name as latest_action_by_display_name
from reports r
left join public.profiles tp on tp.id = r.target_user_id
left join public.user_moderation um on um.user_id = r.target_user_id
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
      when lower(coalesce(aal.details->>'source', '')) = 'sentinel' then 'sentinel'
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

drop view if exists public.view_admin_report_casefile;
create view public.view_admin_report_casefile as
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
  target_profile.social_id as target_social_id,
  reporter_profile.display_name as reporter_display_name,
  reporter_profile.social_id as reporter_social_id,
  sr_latest.id as support_request_id,
  sr_latest.subject as support_subject,
  sr_latest.message as support_message,
  sr_latest.created_at as support_created_at,
  coalesce(um.moderation_state, 'active') as moderation_state,
  coalesce(um.automation_paused, false) as automation_paused,
  coalesce(um.restriction_flags, '{}'::jsonb) as restriction_flags,
  coalesce(um.case_status, 'open') as case_status,
  um.reason_internal as moderation_note,
  coalesce(rfp.false_report_count, 0) as reporter_false_report_count
from public.user_reports ur
left join public.profiles target_profile on target_profile.id = ur.target_id
left join public.profiles reporter_profile on reporter_profile.id = ur.reporter_id
left join public.user_moderation um on um.user_id = ur.target_id
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

drop view if exists public.view_admin_safety_audit_timeline;
create view public.view_admin_safety_audit_timeline as
select
  aal.id as audit_id,
  aal.created_at,
  aal.action,
  aal.actor_id,
  actor_profile.display_name as actor_display_name,
  aal.target_user_id,
  target_profile.display_name as target_display_name,
  aal.notes,
  aal.details,
  case
    when lower(coalesce(aal.details->>'source', '')) = 'sentinel' then 'sentinel'
    else 'manual'
  end as action_source
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
revoke all on public.view_admin_safety_audit_timeline from public;

grant select on public.view_admin_reports_queue to authenticated;
grant select on public.view_admin_report_casefile to authenticated;
grant select on public.view_admin_safety_audit_timeline to authenticated;
grant select on public.view_admin_reports_queue to service_role;
grant select on public.view_admin_report_casefile to service_role;
grant select on public.view_admin_safety_audit_timeline to service_role;
