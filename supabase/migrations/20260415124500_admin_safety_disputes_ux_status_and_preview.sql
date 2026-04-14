-- /admin/safety disputes UX correction pass
-- Keeps Stripe/payment runtime untouched. Admin-only decision/read layer.

create or replace function public.admin_apply_dispute_decision(
  p_dispute_id uuid,
  p_action text,
  p_note text,
  p_customer_refund_amount numeric default null
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
  v_platform_fee numeric := 0;
  v_refund numeric := 0;
  v_provider numeric := 0;
  v_refundable numeric := 0;
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
    public.try_parse_numeric(v_dispute.decision_payload->>'total_paid_amount'),
    public.try_parse_numeric(v_chat.quote_card->>'finalPrice'),
    public.try_parse_numeric(v_chat.quote_card->>'total_paid'),
    public.try_parse_numeric(v_chat.quote_card->>'totalPaid'),
    public.try_parse_numeric(v_chat.quote_card->>'amount_total'),
    public.try_parse_numeric(v_chat.quote_card->>'amountTotal'),
    public.try_parse_numeric(v_chat.request_card->>'suggestedPrice'),
    0
  );

  v_platform_fee := coalesce(
    public.try_parse_numeric(v_dispute.decision_payload->>'platform_fee_amount'),
    public.try_parse_numeric(v_chat.quote_card->>'platform_fee_amount'),
    public.try_parse_numeric(v_chat.quote_card->>'platformFeeAmount'),
    public.try_parse_numeric(v_chat.quote_card->>'platform_fee'),
    public.try_parse_numeric(v_chat.quote_card->>'platformFee'),
    public.try_parse_numeric(v_chat.request_card->>'platform_fee_amount'),
    0
  );

  if v_total_paid < 0 then v_total_paid := 0; end if;
  if v_platform_fee < 0 then v_platform_fee := 0; end if;
  if v_platform_fee > v_total_paid then v_platform_fee := 0; end if;

  v_refundable := greatest(v_total_paid - v_platform_fee, 0);

  if v_action = 'release_full' then
    v_status := 'resolved_release_full';
    v_refund := 0;
    v_provider := v_refundable;
    v_audit_action := 'disputes_release_full';
  elsif v_action = 'partial_refund' then
    if p_customer_refund_amount is null then
      raise exception 'refund_amount_required';
    end if;
    v_refund := greatest(least(p_customer_refund_amount, v_refundable), 0);
    v_provider := greatest(v_refundable - v_refund, 0);
    v_status := 'resolved_partial_refund';
    v_audit_action := 'disputes_partial_refund';
  else
    v_status := 'resolved_refund_full';
    v_refund := v_refundable;
    v_provider := 0;
    v_audit_action := 'disputes_refund_full';
  end if;

  v_money := jsonb_build_object(
    'total_paid_amount', v_total_paid,
    'platform_fee_amount', v_platform_fee,
    'provider_receives_amount', v_provider,
    'customer_refund_amount', v_refund,
    'refund_input_amount', p_customer_refund_amount,
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

revoke all on function public.admin_apply_dispute_decision(uuid, text, text, numeric) from public;
revoke all on function public.admin_apply_dispute_decision(uuid, text, text, numeric) from anon;
revoke all on function public.admin_apply_dispute_decision(uuid, text, text, numeric) from authenticated;
revoke all on function public.admin_apply_dispute_decision(uuid, text, text, numeric) from service_role;
grant execute on function public.admin_apply_dispute_decision(uuid, text, text, numeric) to authenticated;
grant execute on function public.admin_apply_dispute_decision(uuid, text, text, numeric) to service_role;

create or replace function public.admin_get_service_chat_preview(
  p_service_chat_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_chat_row record;
  v_result jsonb;
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

  select
    sc.id as service_chat_id,
    sc.chat_id,
    sc.status,
    sc.requester_id,
    sc.provider_id,
    requester_profile.display_name as requester_display_name,
    requester_profile.social_id as requester_social_id,
    provider_profile.display_name as provider_display_name,
    provider_profile.social_id as provider_social_id,
    sc.request_opened_at,
    sc.payout_release_requested_at,
    sc.payout_released_at
  into v_chat_row
  from public.service_chats sc
  left join public.profiles requester_profile on requester_profile.id = sc.requester_id
  left join public.profiles provider_profile on provider_profile.id = sc.provider_id
  where sc.id = p_service_chat_id;

  if v_chat_row.service_chat_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'service_chat_id', v_chat_row.service_chat_id,
    'chat_id', v_chat_row.chat_id,
    'status', v_chat_row.status,
    'requester_id', v_chat_row.requester_id,
    'provider_id', v_chat_row.provider_id,
    'requester_display_name', v_chat_row.requester_display_name,
    'requester_social_id', v_chat_row.requester_social_id,
    'provider_display_name', v_chat_row.provider_display_name,
    'provider_social_id', v_chat_row.provider_social_id,
    'request_opened_at', v_chat_row.request_opened_at,
    'payout_release_requested_at', v_chat_row.payout_release_requested_at,
    'payout_released_at', v_chat_row.payout_released_at,
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cm.id,
          'sender_id', cm.sender_id,
          'sender_display_name', sp.display_name,
          'sender_social_id', sp.social_id,
          'content', cm.content,
          'created_at', cm.created_at
        )
        order by cm.created_at asc
      )
      from public.chat_messages cm
      left join public.profiles sp on sp.id = cm.sender_id
      where cm.chat_id = v_chat_row.chat_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_get_service_chat_preview(uuid) from public;
revoke all on function public.admin_get_service_chat_preview(uuid) from anon;
revoke all on function public.admin_get_service_chat_preview(uuid) from authenticated;
revoke all on function public.admin_get_service_chat_preview(uuid) from service_role;
grant execute on function public.admin_get_service_chat_preview(uuid) to authenticated;
grant execute on function public.admin_get_service_chat_preview(uuid) to service_role;

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
  sd.decision_action,
  sd.decision_note,
  sd.decision_payload,
  sd.decision_actor_id,
  sd.decision_at,
  sd.decision_version,
  coalesce(
    public.try_parse_numeric(sd.decision_payload->'money'->>'total_paid_amount'),
    public.try_parse_numeric(sc.quote_card->>'finalPrice'),
    public.try_parse_numeric(sc.quote_card->>'total_paid'),
    public.try_parse_numeric(sc.quote_card->>'totalPaid'),
    public.try_parse_numeric(sc.quote_card->>'amount_total'),
    public.try_parse_numeric(sc.quote_card->>'amountTotal'),
    public.try_parse_numeric(sc.request_card->>'suggestedPrice')
  ) as total_paid_amount,
  coalesce(
    public.try_parse_numeric(sd.decision_payload->'money'->>'platform_fee_amount'),
    public.try_parse_numeric(sc.quote_card->>'platform_fee_amount'),
    public.try_parse_numeric(sc.quote_card->>'platformFeeAmount'),
    public.try_parse_numeric(sc.quote_card->>'platform_fee'),
    public.try_parse_numeric(sc.quote_card->>'platformFee'),
    0
  ) as platform_fee_amount,
  coalesce(
    public.try_parse_numeric(sd.decision_payload->'money'->>'provider_receives_amount'),
    0
  ) as provider_receives_amount,
  coalesce(
    public.try_parse_numeric(sd.decision_payload->'money'->>'customer_refund_amount'),
    0
  ) as customer_refund_amount,
  coalesce(
    nullif(lower(sd.decision_payload->'money'->>'currency'), ''),
    nullif(lower(sc.quote_card->>'currency'), ''),
    'hkd'
  ) as currency_code,
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

revoke all on public.view_admin_service_disputes_queue from public;
grant select on public.view_admin_service_disputes_queue to authenticated;
grant select on public.view_admin_service_disputes_queue to service_role;
