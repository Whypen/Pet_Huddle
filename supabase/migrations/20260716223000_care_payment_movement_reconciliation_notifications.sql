begin;

-- Stripe webhooks are the primary signal. This schedule is only a due-row
-- recovery path, so completed movements stop permanently and an empty queue
-- does not invoke the Edge Function.
alter table public.care_payment_movements
  alter column next_sync_at drop not null;

alter table public.care_payment_movements
  add column if not exists reconciliation_attention_at timestamptz;

create or replace function public.care_payout_failure_requires_user_action(p_failure_code text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $function$
  select lower(btrim(coalesce(p_failure_code, ''))) = any(array[
    'account_closed',
    'account_frozen',
    'bank_account_restricted',
    'bank_ownership_changed',
    'debit_not_authorized',
    'invalid_account_number',
    'incorrect_account_holder_address',
    'incorrect_account_holder_name',
    'incorrect_account_holder_tax_id',
    'no_account'
  ]::text[]);
$function$;

revoke all on function public.care_payout_failure_requires_user_action(text) from public, anon, authenticated;
grant execute on function public.care_payout_failure_requires_user_action(text) to service_role;

create or replace function public.notify_care_payment_movement_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_chat_id uuid;
  v_owner_id uuid;
  v_carer_id uuid;
  v_owner_name text;
  v_href text;
  v_date_label text;
  v_data jsonb;
  v_refund_delayed boolean;
begin
  select sc.chat_id, sc.requester_id, sc.provider_id,
         coalesce(nullif(btrim(p.display_name), ''), 'the owner')
  into v_chat_id, v_owner_id, v_carer_id, v_owner_name
  from public.service_chats sc
  left join public.profiles p on p.id = sc.requester_id
  where sc.id = new.service_chat_id;

  if v_chat_id is null then return new; end if;
  v_href := '/chats?tab=service&room=' || v_chat_id::text || '&service=' || new.service_chat_id::text;

  if new.movement_kind = 'owner_refund' then
    if new.status = 'succeeded' and new.estimated_arrival_at is not null then
      v_date_label := to_char(new.estimated_arrival_at at time zone 'UTC', 'FMDD Mon');
      v_data := jsonb_build_object(
        'kind', 'care_refund_on_the_way',
        'chatId', v_chat_id,
        'serviceChatId', new.service_chat_id,
        'movementId', new.id,
        'notification_key', 'care_payment:' || new.id::text || ':refund_on_the_way'
      );
      perform public.service_notify(
        v_owner_id,
        'care_refund_on_the_way',
        'Care Refund: On the way',
        'Your refund is on the way. Estimated arrival: ' || v_date_label || '.',
        v_href,
        v_data
      );
    end if;

    v_refund_delayed := new.status in ('failed', 'canceled', 'requires_review')
      or (
        new.status = 'succeeded'
        and new.estimated_arrival_at is not null
        and new.estimated_arrival_at < now()
        and nullif(btrim(coalesce(new.refund_reference_value, '')), '') is null
      );
    if v_refund_delayed then
      v_data := jsonb_build_object(
        'kind', 'care_refund_delayed',
        'chatId', v_chat_id,
        'serviceChatId', new.service_chat_id,
        'movementId', new.id,
        'notification_key', 'care_payment:' || new.id::text || ':refund_delayed'
      );
      perform public.service_notify(
        v_owner_id,
        'care_refund_delayed',
        'Care Refund: Delayed',
        'Your refund is taking longer than expected. Please be assured we''re working on this.',
        v_href,
        v_data
      );
    end if;
  elsif new.movement_kind = 'carer_payout' then
    if new.status in ('pending', 'in_transit') and new.estimated_arrival_at is not null then
      v_date_label := to_char(new.estimated_arrival_at at time zone 'UTC', 'FMDD Mon');
      v_data := jsonb_build_object(
        'kind', 'care_payment_on_the_way',
        'chatId', v_chat_id,
        'serviceChatId', new.service_chat_id,
        'movementId', new.id,
        'notification_key', 'care_payment:' || new.id::text || ':payment_on_the_way'
      );
      perform public.service_notify(
        v_carer_id,
        'care_payment_on_the_way',
        'Care Payment: On the way',
        'Your payment for ' || v_owner_name || '’s care session is on the way. Estimated arrival: ' || v_date_label || '.',
        v_href,
        v_data
      );
    end if;

    if new.status = 'paid' and new.paid_at is not null then
      v_date_label := to_char(new.paid_at at time zone 'UTC', 'FMDD Mon');
      v_data := jsonb_build_object(
        'kind', 'care_payment_released',
        'chatId', v_chat_id,
        'serviceChatId', new.service_chat_id,
        'movementId', new.id,
        'notification_key', 'care_payment:' || new.id::text || ':payment_released'
      );
      perform public.service_notify(
        v_carer_id,
        'care_payment_released',
        'Care Payment: Released',
        'Your payment for ' || v_owner_name || '’s care session was released on ' || v_date_label || '.',
        v_href,
        v_data
      );
    end if;

    if new.status = 'failed' and public.care_payout_failure_requires_user_action(new.failure_code) then
      v_data := jsonb_build_object(
        'kind', 'care_payment_setup_needed',
        'chatId', v_chat_id,
        'serviceChatId', new.service_chat_id,
        'movementId', new.id,
        'notification_key', 'care_payment:' || new.id::text || ':payment_setup_needed',
        'actionLabel', 'Review payout account',
        'actionHref', '/carerprofile?userId=' || v_carer_id::text || '&mode=edit&section=professional'
      );
      perform public.service_notify(
        v_carer_id,
        'care_payment_setup_needed',
        'Payment setup needed',
        'Stripe couldn''t complete this payout. Review your payout account details.',
        v_href,
        v_data
      );
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists notify_care_payment_movement_transition on public.care_payment_movements;
create trigger notify_care_payment_movement_transition
after insert or update of status, estimated_arrival_at, paid_at, refund_reference_value, payout_trace_value, failure_code
on public.care_payment_movements
for each row execute function public.notify_care_payment_movement_transition();

create or replace function public.queue_care_payment_movement_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_project_url') || '/functions/v1/sync-care-payment-movements',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('source', 'movement_created', 'service_chat_id', new.service_chat_id),
    timeout_milliseconds := 30000
  );
  return new;
end;
$function$;

drop trigger if exists queue_care_payment_movement_sync on public.care_payment_movements;
create trigger queue_care_payment_movement_sync
after insert on public.care_payment_movements
for each row execute function public.queue_care_payment_movement_sync();

create or replace function public.get_service_care_payment_status_by_service_id(p_service_chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select case when sc.requester_id = v_uid then 'owner' when sc.provider_id = v_uid then 'carer' end
  into v_role from public.service_chats sc where sc.id = p_service_chat_id;
  if v_role is null then raise exception 'service_participant_required' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'movement_kind', m.movement_kind,
    'movement_reason', m.movement_reason,
    'amount_minor', m.amount_minor,
    'currency', m.currency,
    'status', m.status,
    'requested_at', m.requested_at,
    'processed_at', m.processed_at,
    'estimated_arrival_at', m.estimated_arrival_at,
    'paid_at', m.paid_at,
    'refund_reference', case when v_role = 'owner' then m.refund_reference_value else null end,
    'refund_reference_status', case when v_role = 'owner' then m.refund_reference_status else null end,
    'refund_reference_type', case when v_role = 'owner' then m.refund_reference_type else null end,
    'payout_trace_id', case when v_role = 'carer' then m.payout_trace_value else null end,
    'payout_trace_status', case when v_role = 'carer' then m.payout_trace_status else null end,
    'action_required', case when v_role = 'carer' then public.care_payout_failure_requires_user_action(m.failure_code) else false end,
    'is_delayed', case when v_role = 'owner' then (
      m.status in ('failed', 'canceled', 'requires_review')
      or (m.status = 'succeeded' and m.estimated_arrival_at < now() and m.refund_reference_value is null)
    ) else false end,
    'last_synced_at', m.last_synced_at,
    'updated_at', m.updated_at
  ) order by m.created_at desc), '[]'::jsonb)
  into v_result
  from public.care_payment_movements m
  where m.service_chat_id = p_service_chat_id
    and ((v_role = 'owner' and m.movement_kind = 'owner_refund')
      or (v_role = 'carer' and m.movement_kind = 'carer_payout'));
  return jsonb_build_object('role', v_role, 'movements', v_result);
end;
$function$;

create or replace function public.get_my_service_care_payment_statuses(p_service_chat_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select coalesce(array_agg(distinct item), '{}'::uuid[])
  into v_ids from unnest(coalesce(p_service_chat_ids, '{}'::uuid[])) item;
  if cardinality(v_ids) > 20 then raise exception 'too_many_service_chats' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'service_chat_id', m.service_chat_id,
    'id', m.id,
    'movement_kind', m.movement_kind,
    'movement_reason', m.movement_reason,
    'amount_minor', m.amount_minor,
    'currency', m.currency,
    'status', m.status,
    'requested_at', m.requested_at,
    'processed_at', m.processed_at,
    'estimated_arrival_at', m.estimated_arrival_at,
    'paid_at', m.paid_at,
    'refund_reference', case when sc.requester_id = v_uid then m.refund_reference_value else null end,
    'refund_reference_status', case when sc.requester_id = v_uid then m.refund_reference_status else null end,
    'refund_reference_type', case when sc.requester_id = v_uid then m.refund_reference_type else null end,
    'payout_trace_id', case when sc.provider_id = v_uid then m.payout_trace_value else null end,
    'payout_trace_status', case when sc.provider_id = v_uid then m.payout_trace_status else null end,
    'action_required', case when sc.provider_id = v_uid then public.care_payout_failure_requires_user_action(m.failure_code) else false end,
    'is_delayed', case when sc.requester_id = v_uid then (
      m.status in ('failed', 'canceled', 'requires_review')
      or (m.status = 'succeeded' and m.estimated_arrival_at < now() and m.refund_reference_value is null)
    ) else false end,
    'last_synced_at', m.last_synced_at,
    'updated_at', m.updated_at
  ) order by m.created_at desc), '[]'::jsonb)
  into v_result
  from public.care_payment_movements m
  join public.service_chats sc on sc.id = m.service_chat_id
  where m.service_chat_id = any(v_ids)
    and ((sc.requester_id = v_uid and m.movement_kind = 'owner_refund')
      or (sc.provider_id = v_uid and m.movement_kind = 'carer_payout'));
  return v_result;
end;
$function$;

create or replace function public.admin_request_care_payment_movement_refresh(p_movement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_service_chat_id uuid;
  v_request_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = v_uid
      and (coalesce(p.is_admin, false) or lower(coalesce(p.user_role, '')) = 'admin')
  ) then raise exception 'admin_required' using errcode = '42501'; end if;

  update public.care_payment_movements
  set next_sync_at = now(), sync_attempt_count = 0,
      reconciliation_attention_at = null, updated_at = now()
  where id = p_movement_id
  returning service_chat_id into v_service_chat_id;
  if v_service_chat_id is null then raise exception 'movement_not_found' using errcode = 'P0002'; end if;

  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_project_url') || '/functions/v1/sync-care-payment-movements',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('source', 'admin_refresh', 'service_chat_id', v_service_chat_id),
    timeout_milliseconds := 30000
  ) into v_request_id;
  return jsonb_build_object('queued', true, 'request_id', v_request_id, 'service_chat_id', v_service_chat_id);
end;
$function$;

revoke all on function public.admin_request_care_payment_movement_refresh(uuid) from public, anon;
grant execute on function public.admin_request_care_payment_movement_refresh(uuid) to authenticated, service_role;

do $block$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname in (
    'sync-care-payment-movements-15min',
    'sync-care-payment-movements-hourly'
  ) loop perform cron.unschedule(v_jobid); end loop;

  perform cron.schedule(
    'sync-care-payment-movements-hourly', '7 * * * *',
    $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_project_url') || '/functions/v1/sync-care-payment-movements',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('source', 'hourly_due_recovery'),
        timeout_milliseconds := 30000
      )
      where exists (
        select 1 from public.care_payment_movements m
        where m.next_sync_at is not null and m.next_sync_at <= now()
      );
    $cron$
  );
end;
$block$;

commit;
notify pgrst, 'reload schema';
