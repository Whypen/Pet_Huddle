-- Admin Safety correction pass:
-- 1) allow customer/provider fee-waiver toggles for all dispute decision actions.
-- 2) make warn action carry editable message and send to user chat as Team Huddle identity when available.

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
  v_waive_provider_fee_effective := coalesce(p_waive_provider_platform_fee, false);
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

drop function if exists public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid);
drop function if exists public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid, text);

create or replace function public.admin_apply_report_moderation(
  p_target_user_id uuid,
  p_action text,
  p_note text default null,
  p_restriction_flags jsonb default '{}'::jsonb,
  p_pause_sentinel boolean default null,
  p_reporter_user_id uuid default null,
  p_warn_message text default null
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
  v_warn_message_default text :=
    'Huddle only works when the neighborhood is safe and friendly for everyone.' || E'\n' ||
    'We''ve noticed some recent activity on your account that doesn''t quite align with our community standards.' || E'\n' ||
    'If you think this is a mistake, please reach out to our team at support@huddle.pet';
  v_warn_message_body text := nullif(trim(coalesce(p_warn_message, '')), '');
  v_warn_sender_user_id uuid := null;
  v_warn_chat_id uuid := null;
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

  if v_action = 'warn' then
    v_warn_message_body := coalesce(v_warn_message_body, v_warn_message_default);
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

    select p.id
    into v_warn_sender_user_id
    from public.profiles p
    where lower(trim(coalesce(p.display_name, ''))) = 'team huddle'
       or lower(trim(coalesce(p.social_id, ''))) in ('teamhuddle', 'team_huddle', 'team-huddle', 'huddleteam', 'huddle_team')
    order by case when lower(trim(coalesce(p.display_name, ''))) = 'team huddle' then 0 else 1 end,
             p.updated_at desc nulls last
    limit 1;

    if v_warn_sender_user_id is null then
      v_warn_sender_user_id := v_actor;
    end if;

    select c.id
    into v_warn_chat_id
    from public.chats c
    where lower(coalesce(c.type, '')) = 'direct'
      and exists (
        select 1
        from public.chat_room_members crm
        where crm.chat_id = c.id
          and crm.user_id = p_target_user_id
      )
      and exists (
        select 1
        from public.chat_room_members crm
        where crm.chat_id = c.id
          and crm.user_id = v_warn_sender_user_id
      )
      and (
        select count(*)
        from public.chat_room_members crm
        where crm.chat_id = c.id
      ) = 2
    order by c.updated_at desc nulls last, c.created_at desc nulls last
    limit 1;

    if v_warn_chat_id is null then
      insert into public.chats (type, created_by, name, created_at, updated_at, last_message_at)
      values ('direct', v_warn_sender_user_id, null, now(), now(), now())
      returning id into v_warn_chat_id;

      insert into public.chat_room_members (chat_id, user_id, created_at)
      values
        (v_warn_chat_id, v_warn_sender_user_id, now()),
        (v_warn_chat_id, p_target_user_id, now())
      on conflict do nothing;
    end if;

    insert into public.chat_messages (chat_id, sender_id, content, created_at)
    values (v_warn_chat_id, v_warn_sender_user_id, v_warn_message_body, now());

    update public.chats
      set last_message_at = now(), updated_at = now()
    where id = v_warn_chat_id;

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
      'warn_message_body', v_warn_message_body,
      'warn_message_sender_user_id', v_warn_sender_user_id,
      'warn_message_chat_id', v_warn_chat_id,
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
    'warn_message_body', v_warn_message_body,
    'warn_message_sender_user_id', v_warn_sender_user_id,
    'warn_message_chat_id', v_warn_chat_id,
    'penalized_reporter_user_id', p_reporter_user_id,
    'false_report_count', v_false_report_count
  );
end;
$$;

revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid, text) from public;
revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid, text) from anon;
revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid, text) from authenticated;
revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid, text) from service_role;
grant execute on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid, text) to authenticated;
grant execute on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean, uuid, text) to service_role;

commit;
