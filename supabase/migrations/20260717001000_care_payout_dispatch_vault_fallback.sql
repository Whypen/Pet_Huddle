begin;

-- The payout worker previously read only legacy database settings, while this
-- project stores the already-approved dispatcher credentials in Supabase Vault.
-- Keep settings as an optional override and use Vault as the live fallback.
CREATE OR REPLACE FUNCTION public.process_service_payout_releases()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  v_processed integer := 0;
  v_dispatched integer := 0;
  v_supabase_url text := coalesce(
    nullif(btrim(current_setting('app.settings.supabase_url', true)), ''),
    (select nullif(btrim(decrypted_secret), '') from vault.decrypted_secrets where name = 'supabase_project_url' limit 1)
  );
  v_service_role_key text := coalesce(
    nullif(btrim(current_setting('app.settings.service_role_key', true)), ''),
    (select nullif(btrim(decrypted_secret), '') from vault.decrypted_secrets where name = 'supabase_service_role_key' limit 1)
  );
begin
  for rec in
    select sc.id, sc.chat_id, sc.requester_id
    from public.service_chats sc
    where sc.care_status = 'handoff_issue_review'
      and sc.handoff_problem_reported_at + interval '24 hours' < now()
      and sc.checkin_submitted_at is null and sc.refund_issued_at is null
      and not exists (select 1 from public.service_care_events e where e.service_chat_id = sc.id and e.event_type = 'requester_handoff_response')
  loop
    update public.service_chats set care_status = 'handoff_expired_manual_refund_required', status = 'cancelled',
      cancellation_status = 'manual_refund_required', manual_recovery_required_at = now(),
      manual_recovery_reason = 'handoff_problem_expired_without_requester_response',
      payout_release_requested_at = null, payout_release_lock_token = null, payout_release_locked_at = null, start_pin_hash = null
    where id = rec.id;
    insert into public.service_care_events(service_chat_id, actor_id, event_type, metadata)
    values (rec.id, rec.requester_id, 'handoff_problem_expired', jsonb_build_object('manual_recovery_required', true));
    v_processed := v_processed + 1;
  end loop;

  for rec in
    select sc.id, sc.chat_id, sc.requester_id, sc.provider_id, sc.stripe_payment_intent_id,
      public.service_chat_scheduled_end_at(sc.id) scheduled_end_at
    from public.service_chats sc
    where sc.status in ('in_progress', 'completed') and coalesce(sc.care_status, '') <> 'handoff_issue_review'
      and sc.refund_issued_at is null and sc.payout_released_at is null and sc.stripe_transfer_id is null
      and sc.manual_recovery_required_at is null
      and (sc.stripe_payment_intent_id is not null or (coalesce((sc.quote_card->>'voluntary')::boolean, false)
        and (nullif(btrim(coalesce(sc.quote_card->>'finalPrice', '')), '') is null
          or not (coalesce(sc.quote_card->>'finalPrice', '') ~ '^[0-9]+(\.[0-9]+)?$')
          or (sc.quote_card->>'finalPrice')::numeric <= 0)))
      and public.service_chat_has_valid_checkin(sc.id)
      and not exists (select 1 from public.service_disputes d where d.service_chat_id = sc.id and d.status not in ('resolved_hold','resolved_release_full','resolved_partial_refund','resolved_refund_full'))
      and not exists (select 1 from public.service_care_events e where e.service_chat_id = sc.id and e.event_type in ('issue_report','dispute_evidence') and public.service_care_event_blocks_payout(e.metadata))
  loop
    if rec.scheduled_end_at is null or rec.scheduled_end_at + interval '48 hours' > now() then continue; end if;
    update public.service_chats set care_status = 'completed', status = 'completed', completed_at = coalesce(completed_at, now()),
      payout_release_requested_at = case when rec.stripe_payment_intent_id is not null then coalesce(payout_release_requested_at, now()) else payout_release_requested_at end
    where id = rec.id and payout_released_at is null and stripe_transfer_id is null and refund_issued_at is null
      and manual_recovery_required_at is null and coalesce(care_status, '') not in ('completed','handoff_issue_review','under_dispute');
    if found then
      begin
        perform public.service_notify(rec.requester_id, 'service_completed', 'Care Complete', 'Hope your pet had a great time! Leave a review for your carer when you''re ready', '/chats?tab=service&room=' || rec.chat_id::text, jsonb_build_object('chatId', rec.chat_id, 'serviceChatId', rec.id));
        perform public.service_notify(rec.provider_id, 'service_completed', 'Care Complete', 'Great work! Leave a review for the owner — your payout moves forward after confirmation', '/chats?tab=service&room=' || rec.chat_id::text, jsonb_build_object('chatId', rec.chat_id, 'serviceChatId', rec.id));
      exception when others then null;
      end;
    end if;
    v_processed := v_processed + 1;
  end loop;

  for rec in
    select sc.id, sc.chat_id from public.service_chats sc
    where sc.status = 'completed' and sc.care_status = 'completed'
      and sc.payout_release_requested_at is not null and sc.payout_released_at is null
      and sc.stripe_transfer_id is null and sc.refund_issued_at is null and sc.manual_recovery_required_at is null
      and (sc.payout_release_attempted_at is null or sc.payout_release_attempted_at <= now() - interval '2 minutes')
      and (sc.payout_release_failed_at is null or sc.payout_release_failed_at <= now() - interval '10 minutes')
    limit 25
  loop
    if v_supabase_url is null or v_service_role_key is null then
      update public.service_chats set payout_release_failed_at = now(), payout_release_failure_reason = 'release_service_payout_dispatch_config_missing'
      where id = rec.id and payout_released_at is null and stripe_transfer_id is null;
      v_processed := v_processed + 1;
      continue;
    end if;
    begin
      update public.service_chats set payout_release_attempted_at = now() where id = rec.id and payout_released_at is null and stripe_transfer_id is null;
      perform net.http_post(url := v_supabase_url || '/functions/v1/release-service-payout',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_service_role_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object('service_chat_id', rec.id));
      v_dispatched := v_dispatched + 1;
    exception when others then
      update public.service_chats set payout_release_failed_at = now(), payout_release_failure_reason = left('release_service_payout_dispatch_failed: ' || sqlerrm, 500)
      where id = rec.id and payout_released_at is null and stripe_transfer_id is null;
    end;
  end loop;
  return v_processed + v_dispatched;
end;
$function$
;

revoke all on function public.process_service_payout_releases() from public, anon, authenticated;
grant execute on function public.process_service_payout_releases() to service_role;

commit;
