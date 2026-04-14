-- Admin Safety correction: Full Refund must block provider-side fee waiver.

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

  v_waive_customer_fee_effective := coalesce(p_waive_customer_platform_fee, false);
  v_waive_provider_fee_effective := (v_action <> 'full_refund') and coalesce(p_waive_provider_platform_fee, false);
  v_provider_fee_deduction := case when v_waive_provider_fee_effective then 0 else v_provider_platform_fee end;

  if v_action = 'release_full' then
    v_status := 'resolved_release_full';
    v_service_refund_input := 0;
    v_refund := case when v_waive_customer_fee_effective then v_customer_platform_fee else 0 end;
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

commit;
