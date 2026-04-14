-- SAFE DEMO FIXTURE: /admin/safety read/moderation testing only
-- Scope: user_reports, user_moderation, admin_audit_logs
-- No Stripe/webhook/payment/service_disputes mutations.

begin;

do $$
declare
  v_tag constant text := '[DEMO_FIXTURE_ADMIN_SAFETY_V1]';
  v_ids uuid[];
  v_target_a uuid;
  v_target_b uuid;
  v_reporter_a uuid;
  v_reporter_b uuid;
  v_actor uuid;
begin
  select array_agg(p.id order by p.email)
  into v_ids
  from public.profiles p
  where p.email ilike '%@huddle.test';

  if coalesce(array_length(v_ids, 1), 0) < 5 then
    raise exception 'demo_fixture_requires_5_test_accounts';
  end if;

  v_target_a := v_ids[1];
  v_target_b := v_ids[2];
  v_reporter_a := v_ids[3];
  v_reporter_b := v_ids[4];
  v_actor := v_ids[5];

  -- idempotent cleanup for this fixture tag
  delete from public.admin_audit_logs
  where coalesce(notes, '') like '%' || v_tag || '%'
     or coalesce(details->>'demo_fixture_tag', '') = v_tag;

  delete from public.user_reports
  where coalesce(details, '') like '%' || v_tag || '%';

  delete from public.user_moderation
  where coalesce(reason_internal, '') like '%' || v_tag || '%'
     or coalesce(metadata->>'demo_fixture_tag', '') = v_tag;

  -- two moderated demo users
  insert into public.user_moderation (
    user_id,
    moderation_state,
    reason_internal,
    restriction_flags,
    automation_paused,
    metadata,
    updated_at
  ) values
  (
    v_target_a,
    'shadow_restricted',
    v_tag || ' Shadow restriction demo state',
    jsonb_build_object('chat_disabled', true, 'map_hidden', true),
    false,
    jsonb_build_object('demo_fixture', true, 'demo_fixture_tag', v_tag, 'fixture_scope', 'admin_safety'),
    now() - interval '20 minutes'
  ),
  (
    v_target_b,
    'under_review',
    v_tag || ' Under review demo state',
    '{}'::jsonb,
    true,
    jsonb_build_object('demo_fixture', true, 'demo_fixture_tag', v_tag, 'fixture_scope', 'admin_safety'),
    now() - interval '10 minutes'
  );

  -- three demo reports (unique reporter->target pairs to avoid dedup index conflict)
  insert into public.user_reports (
    reporter_id,
    target_id,
    categories,
    score,
    details,
    attachment_urls,
    is_scored,
    window_start,
    created_at
  ) values
  (
    v_reporter_a,
    v_target_a,
    array['Unsafe or harmful behavior (online or in-person)'],
    8,
    v_tag || ' Evidence-backed safety report for queue testing',
    array['https://huddle.pet/huddle-logo.jpg'],
    true,
    now() - interval '90 minutes',
    now() - interval '90 minutes'
  ),
  (
    v_reporter_b,
    v_target_a,
    array['Harassment or bullying'],
    4,
    v_tag || ' Text-only behavior complaint for queue scoring',
    '{}'::text[],
    true,
    now() - interval '55 minutes',
    now() - interval '55 minutes'
  ),
  (
    v_reporter_a,
    v_target_b,
    array['Scams, money requests, or promotions'],
    6,
    v_tag || ' Scam-pattern report for pause sentinel test state',
    '{}'::text[],
    true,
    now() - interval '35 minutes',
    now() - interval '35 minutes'
  );

  -- demo audit timeline rows
  insert into public.admin_audit_logs (
    actor_id,
    action,
    target_user_id,
    notes,
    details,
    created_at
  ) values
  (
    v_actor,
    'reports_warn',
    v_target_b,
    v_tag || ' Warned by demo fixture',
    jsonb_build_object('demo_fixture', true, 'demo_fixture_tag', v_tag, 'source', 'admin_safety_demo_fixture_apply'),
    now() - interval '30 minutes'
  ),
  (
    v_actor,
    'reports_shadow_restrict',
    v_target_a,
    v_tag || ' Shadow restricted by demo fixture',
    jsonb_build_object('demo_fixture', true, 'demo_fixture_tag', v_tag, 'source', 'admin_safety_demo_fixture_apply'),
    now() - interval '20 minutes'
  ),
  (
    v_actor,
    'reports_pause_sentinel',
    v_target_b,
    v_tag || ' Sentinel paused by demo fixture',
    jsonb_build_object('demo_fixture', true, 'demo_fixture_tag', v_tag, 'source', 'admin_safety_demo_fixture_apply', 'automation_paused', true),
    now() - interval '10 minutes'
  );
end $$;

commit;
