-- Admin Safety corrections:
-- 1) Fix dispute decision math with explicit customer/provider fee waiver handling.
-- 2) Remove misleading default manual source in reports queue when no audit action exists.

begin;

create or replace function public.admin_apply_dispute_decision(
  p_dispute_id uuid,
  p_action text,
  p_note text,
  p_customer_refund_amount numeric default null,
  p_waive_customer_platform_fee boolean default false,
  p_waive_provider_platform_fee boolean default false
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
  v_dispute public.service_disputes%rowtype;
  v_chat public.service_chats%rowtype;
  v_status text;
  v_total_paid numeric := 0;
  v_customer_platform_fee numeric := 0;
  v_provider_platform_fee numeric := 0;
  v_service_rate numeric := 0;
  v_service_refund_input numeric := 0;
  v_refund numeric := 0;
  v_provider numeric := 0;
  v_huddle_retains numeric := 0;
  v_provider_fee_deduction numeric := 0;
  v_waive_customer_fee_effective boolean := false;
  v_waive_provider_fee_effective boolean := false;
  v_money jsonb := '{}'::jsonb;
  v_audit_action text;
  v_target_user_id uuid;
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

  if p_dispute_id is null then
    raise exception 'dispute_id_required';
  end if;

  if v_action not in ('release_full', 'partial_refund', 'full_refund') then
    raise exception 'invalid_action';
  end if;

  if v_note is null then
    raise exception 'admin_note_required';
  end if;

  select *
  into v_dispute
  from public.service_disputes sd
  where sd.id = p_dispute_id
  for update;

  if v_dispute.id is null then
    raise exception 'dispute_not_found';
  end if;

  select *
  into v_chat
  from public.service_chats sc
  where sc.id = v_dispute.service_chat_id;

  if v_chat.id is null then
    raise exception 'service_chat_not_found';
  end if;

  v_total_paid := coalesce(
    public.try_parse_numeric(v_dispute.decision_payload->'money'->>'total_paid_amount'),
    public.try_parse_numeric(v_chat.quote_card->>'finalPrice'),
    public.try_parse_numeric(v_chat.quote_card->>'total_paid'),
    public.try_parse_numeric(v_chat.quote_card->>'totalPaid'),
    public.try_parse_numeric(v_chat.quote_card->>'amount_total'),
    public.try_parse_numeric(v_chat.quote_card->>'amountTotal'),
    public.try_parse_numeric(v_chat.request_card->>'suggestedPrice'),
    0
  );

  v_customer_platform_fee := coalesce(
    public.try_parse_numeric(v_dispute.decision_payload->'money'->>'customer_platform_fee_amount'),
    public.try_parse_numeric(v_dispute.decision_payload->'money'->>'platform_fee_amount'),
    public.try_parse_numeric(v_chat.quote_card->>'customer_platform_fee_amount'),
    public.try_parse_numeric(v_chat.quote_card->>'platform_fee_amount'),
    public.try_parse_numeric(v_chat.quote_card->>'platformFeeAmount'),
    public.try_parse_numeric(v_chat.quote_card->>'platform_fee'),
    public.try_parse_numeric(v_chat.quote_card->>'platformFee'),
    public.try_parse_numeric(v_chat.request_card->>'customer_platform_fee_amount'),
    public.try_parse_numeric(v_chat.request_card->>'platform_fee_amount'),
    0
  );

  v_provider_platform_fee := coalesce(
    public.try_parse_numeric(v_dispute.decision_payload->'money'->>'provider_platform_fee_amount'),
    public.try_parse_numeric(v_chat.quote_card->>'provider_platform_fee_amount'),
    public.try_parse_numeric(v_chat.quote_card->>'provider_fee'),
    public.try_parse_numeric(v_chat.quote_card->>'providerFee'),
    v_customer_platform_fee,
    0
  );

  v_service_rate := coalesce(
    public.try_parse_numeric(v_dispute.decision_payload->'money'->>'service_rate_amount'),
    public.try_parse_numeric(v_chat.quote_card->>'service_rate_amount'),
    greatest(v_total_paid - v_customer_platform_fee, 0)
  );

  if v_total_paid < 0 then v_total_paid := 0; end if;
  if v_service_rate < 0 then v_service_rate := 0; end if;
  if v_customer_platform_fee < 0 then v_customer_platform_fee := 0; end if;
  if v_provider_platform_fee < 0 then v_provider_platform_fee := 0; end if;
  if v_service_rate > v_total_paid then v_service_rate := v_total_paid; end if;

  v_waive_customer_fee_effective := (v_action <> 'release_full') and coalesce(p_waive_customer_platform_fee, false);
  v_waive_provider_fee_effective := (v_action <> 'full_refund') and coalesce(p_waive_provider_platform_fee, false);
  v_provider_fee_deduction := case when v_waive_provider_fee_effective then 0 else v_provider_platform_fee end;

  if v_action = 'release_full' then
    v_status := 'resolved_release_full';
    v_service_refund_input := 0;
    v_refund := 0;
    v_provider := greatest(v_service_rate - v_provider_fee_deduction, 0);
    v_audit_action := 'disputes_release_full';
  elsif v_action = 'partial_refund' then
    if p_customer_refund_amount is null then
      raise exception 'refund_amount_required';
    end if;

    -- Partial refund input is service-refund amount only.
    v_service_refund_input := greatest(least(p_customer_refund_amount, v_service_rate), 0);
    v_refund := v_service_refund_input + case when v_waive_customer_fee_effective then v_customer_platform_fee else 0 end;
    v_provider := greatest(v_service_rate - v_service_refund_input - v_provider_fee_deduction, 0);
    v_status := 'resolved_partial_refund';
    v_audit_action := 'disputes_partial_refund';
  else
    v_status := 'resolved_refund_full';
    v_service_refund_input := v_service_rate;
    v_refund := v_service_rate + case when v_waive_customer_fee_effective then v_customer_platform_fee else 0 end;
    v_provider := 0;
    v_audit_action := 'disputes_refund_full';
  end if;

  v_huddle_retains := greatest(v_total_paid - v_provider - v_refund, 0);

  v_money := jsonb_build_object(
    'total_paid_amount', v_total_paid,
    'service_rate_amount', v_service_rate,
    'customer_platform_fee_amount', v_customer_platform_fee,
    'provider_platform_fee_amount', v_provider_platform_fee,
    'platform_fee_amount', v_customer_platform_fee,
    'waive_customer_platform_fee', v_waive_customer_fee_effective,
    'waive_provider_platform_fee', v_waive_provider_fee_effective,
    'provider_receives_amount', v_provider,
    'customer_refund_amount', v_refund,
    'service_refund_input_amount', v_service_refund_input,
    'refund_input_amount', p_customer_refund_amount,
    'huddle_retained_amount', v_huddle_retains,
    'currency', coalesce(v_chat.quote_card->>'currency', 'hkd')
  );

  update public.service_disputes
  set
    status = v_status,
    admin_notes = v_note,
    decision_action = v_action,
    decision_note = v_note,
    decision_payload = jsonb_build_object(
      'source', 'manual',
      'money', v_money,
      'stripe_context', jsonb_build_object(
        'stripe_payment_intent_id', v_chat.stripe_payment_intent_id,
        'stripe_transfer_id', null,
        'stripe_refund_id', null
      ),
      'execution', jsonb_build_object(
        'executed', false,
        'execution_mode', 'deferred',
        'execution_blocked_reason', 'admin_safety_decision_only_no_live_stripe_execution'
      ),
      'snapshot_at', now(),
      'decision_actor_id', v_actor
    ),
    decision_actor_id = v_actor,
    decision_at = now(),
    decision_version = coalesce(decision_version, 0) + 1,
    updated_at = now()
  where id = p_dispute_id;

  v_target_user_id := coalesce(v_dispute.filed_by, v_chat.requester_id);

  insert into public.admin_audit_logs(actor_id, action, target_user_id, notes, details)
  values (
    v_actor,
    v_audit_action,
    v_target_user_id,
    v_note,
    jsonb_build_object(
      'source', 'manual',
      'dispute_id', v_dispute.id,
      'service_chat_id', v_dispute.service_chat_id,
      'decision_action', v_action,
      'decision_status', v_status,
      'money', v_money,
      'stripe_payment_intent_id', v_chat.stripe_payment_intent_id,
      'execution_mode', 'deferred',
      'execution_blocked_reason', 'no_live_stripe_execution_in_admin_safety_phase'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'dispute_id', v_dispute.id,
    'status', v_status,
    'action', v_action,
    'money', v_money,
    'source', 'manual'
  );
end;
$$;

revoke all on function public.admin_apply_dispute_decision(uuid, text, text, numeric, boolean, boolean) from public;
revoke all on function public.admin_apply_dispute_decision(uuid, text, text, numeric, boolean, boolean) from anon;
revoke all on function public.admin_apply_dispute_decision(uuid, text, text, numeric, boolean, boolean) from authenticated;
revoke all on function public.admin_apply_dispute_decision(uuid, text, text, numeric, boolean, boolean) from service_role;
grant execute on function public.admin_apply_dispute_decision(uuid, text, text, numeric, boolean, boolean) to authenticated;
grant execute on function public.admin_apply_dispute_decision(uuid, text, text, numeric, boolean, boolean) to service_role;

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
  latest_audit.action_source as latest_action_source,
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

revoke all on public.view_admin_reports_queue from public;
grant select on public.view_admin_reports_queue to authenticated;
grant select on public.view_admin_reports_queue to service_role;

commit;
