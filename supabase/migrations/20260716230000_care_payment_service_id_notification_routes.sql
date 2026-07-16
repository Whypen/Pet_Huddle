begin;

-- Payment notifications identify the immutable booking row only. The native
-- screen resolves its conversation shell from service_chats.id after access
-- control, so a newer booking in the same room can never replace this target.
create or replace function public.notify_care_payment_movement_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_owner_id uuid;
  v_carer_id uuid;
  v_owner_name text;
  v_href text;
  v_date_label text;
  v_data jsonb;
  v_refund_delayed boolean;
begin
  select sc.requester_id, sc.provider_id,
         coalesce(nullif(btrim(p.display_name), ''), 'the owner')
  into v_owner_id, v_carer_id, v_owner_name
  from public.service_chats sc
  left join public.profiles p on p.id = sc.requester_id
  where sc.id = new.service_chat_id;

  if v_owner_id is null or v_carer_id is null then return new; end if;
  v_href := '/service-chat?service=' || new.service_chat_id::text || '&historyService=' || new.service_chat_id::text;

  if new.movement_kind = 'owner_refund' then
    if new.status = 'succeeded' and new.estimated_arrival_at is not null then
      v_date_label := to_char(new.estimated_arrival_at at time zone 'UTC', 'FMDD Mon');
      v_data := jsonb_build_object(
        'kind', 'care_refund_on_the_way',
        'serviceChatId', new.service_chat_id,
        'movementId', new.id,
        'notification_key', 'care_payment:' || new.id::text || ':refund_on_the_way'
      );
      perform public.service_notify_once_serialized(
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
        'serviceChatId', new.service_chat_id,
        'movementId', new.id,
        'notification_key', 'care_payment:' || new.id::text || ':refund_delayed'
      );
      perform public.service_notify_once_serialized(
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
        'serviceChatId', new.service_chat_id,
        'movementId', new.id,
        'notification_key', 'care_payment:' || new.id::text || ':payment_on_the_way'
      );
      perform public.service_notify_once_serialized(
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
        'serviceChatId', new.service_chat_id,
        'movementId', new.id,
        'notification_key', 'care_payment:' || new.id::text || ':payment_released'
      );
      perform public.service_notify_once_serialized(
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
        'serviceChatId', new.service_chat_id,
        'movementId', new.id,
        'notification_key', 'care_payment:' || new.id::text || ':payment_setup_needed',
        'actionLabel', 'Review payout account',
        'actionHref', '/carerprofile?userId=' || v_carer_id::text || '&mode=edit&section=professional'
      );
      perform public.service_notify_once_serialized(
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


commit;
