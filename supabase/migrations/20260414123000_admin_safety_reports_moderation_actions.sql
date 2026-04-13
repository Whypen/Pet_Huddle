-- Reports moderation actions for /admin/safety
-- No Stripe/payment/webhook/service dispute mutation changes.

alter table public.user_moderation
  add column if not exists restriction_flags jsonb not null default '{}'::jsonb,
  add column if not exists automation_paused boolean not null default false;

alter table public.user_moderation
  drop constraint if exists user_moderation_moderation_state_check;

alter table public.user_moderation
  add constraint user_moderation_moderation_state_check
  check (
    moderation_state in (
      'active',
      'under_review',
      'shadow_restricted',
      'banned',
      'suspended',
      'review'
    )
  );

create or replace function public.admin_apply_report_moderation(
  p_target_user_id uuid,
  p_action text,
  p_note text default null,
  p_restriction_flags jsonb default '{}'::jsonb,
  p_pause_sentinel boolean default null
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
  v_allowed_flags text[] := array['chat_disabled', 'discovery_hidden', 'social_posting_disabled', 'marketplace_hidden', 'map_hidden'];
  v_key text;
  v_ban_result jsonb := '{}'::jsonb;
  v_unban_result jsonb := '{}'::jsonb;
  v_result_action text;
  v_result_state text;
  v_result_paused boolean;
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

  if v_action not in ('set_active', 'warn', 'shadow_restrict', 'hard_ban', 'pause_sentinel') then
    raise exception 'invalid_action';
  end if;

  if v_action in ('set_active', 'warn', 'shadow_restrict', 'hard_ban') and v_note is null then
    raise exception 'moderator_note_required';
  end if;

  if v_action = 'pause_sentinel' then
    if v_pause is null then
      raise exception 'pause_state_required';
    end if;
    if v_pause = true and v_note is null then
      raise exception 'moderator_note_required';
    end if;
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

  if v_action = 'set_active' then
    select public.admin_unban_user(
      p_user_id := p_target_user_id,
      p_clear_identifiers := false,
      p_metadata := jsonb_build_object('source', 'admin_safety_reports', 'action', 'set_active')
    )
    into v_unban_result;

    insert into public.user_moderation (user_id, moderation_state, reason_internal, restriction_flags, updated_at)
    values (p_target_user_id, 'active', v_note, '{}'::jsonb, now())
    on conflict (user_id) do update
      set moderation_state = 'active',
          reason_internal = excluded.reason_internal,
          restriction_flags = '{}'::jsonb,
          updated_at = now();

    v_result_action := 'reports_set_active';
  elsif v_action = 'warn' then
    insert into public.user_moderation (user_id, moderation_state, reason_internal, updated_at)
    values (p_target_user_id, 'under_review', v_note, now())
    on conflict (user_id) do update
      set moderation_state = 'under_review',
          reason_internal = excluded.reason_internal,
          updated_at = now();

    v_result_action := 'reports_warn';
  elsif v_action = 'shadow_restrict' then
    insert into public.user_moderation (user_id, moderation_state, reason_internal, restriction_flags, updated_at)
    values (p_target_user_id, 'shadow_restricted', v_note, coalesce(v_restrictions, '{}'::jsonb), now())
    on conflict (user_id) do update
      set moderation_state = 'shadow_restricted',
          reason_internal = excluded.reason_internal,
          restriction_flags = excluded.restriction_flags,
          updated_at = now();

    v_result_action := 'reports_shadow_restrict';
  elsif v_action = 'hard_ban' then
    select public.admin_ban_user(
      p_user_id := p_target_user_id,
      p_reason_internal := v_note,
      p_public_message := 'Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.',
      p_block_email := true,
      p_block_phone := true,
      p_metadata := jsonb_build_object('source', 'admin_safety_reports', 'action', 'hard_ban')
    ) into v_ban_result;

    insert into public.user_moderation (user_id, moderation_state, reason_internal, updated_at)
    values (p_target_user_id, 'banned', v_note, now())
    on conflict (user_id) do update
      set moderation_state = 'banned',
          reason_internal = excluded.reason_internal,
          updated_at = now();

    v_result_action := 'reports_hard_ban';
  elsif v_action = 'pause_sentinel' then
    insert into public.user_moderation (user_id, moderation_state, automation_paused, reason_internal, updated_at)
    values (p_target_user_id, 'active', v_pause, v_note, now())
    on conflict (user_id) do update
      set automation_paused = v_pause,
          reason_internal = coalesce(excluded.reason_internal, public.user_moderation.reason_internal),
          updated_at = now();

    v_result_action := 'reports_pause_sentinel';
  end if;

  select um.moderation_state, coalesce(um.automation_paused, false)
  into v_result_state, v_result_paused
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
      'restriction_flags', coalesce(v_restrictions, '{}'::jsonb),
      'pause_sentinel', v_pause,
      'ban_result', coalesce(v_ban_result, '{}'::jsonb),
      'unban_result', coalesce(v_unban_result, '{}'::jsonb),
      'source', 'admin_safety_reports'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'moderation_state', coalesce(v_result_state, 'active'),
    'automation_paused', coalesce(v_result_paused, false),
    'restriction_flags', coalesce(v_restrictions, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean) from public;
grant execute on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean) to authenticated;
grant execute on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean) to service_role;

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
  sr_latest.created_at as latest_support_created_at,
  coalesce(um.moderation_state, 'active') as moderation_state,
  coalesce(um.automation_paused, false) as automation_paused,
  coalesce(um.restriction_flags, '{}'::jsonb) as restriction_flags
from reports r
left join public.user_moderation um on um.user_id = r.target_user_id
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
  sr_latest.created_at as support_created_at,
  coalesce(um.moderation_state, 'active') as moderation_state,
  coalesce(um.automation_paused, false) as automation_paused,
  coalesce(um.restriction_flags, '{}'::jsonb) as restriction_flags,
  um.reason_internal as moderation_note
from public.user_reports ur
left join public.profiles target_profile on target_profile.id = ur.target_id
left join public.profiles reporter_profile on reporter_profile.id = ur.reporter_id
left join public.user_moderation um on um.user_id = ur.target_id
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

revoke all on public.view_admin_reports_queue from public;
revoke all on public.view_admin_report_casefile from public;

grant select on public.view_admin_reports_queue to authenticated;
grant select on public.view_admin_report_casefile to authenticated;
grant select on public.view_admin_reports_queue to service_role;
grant select on public.view_admin_report_casefile to service_role;
