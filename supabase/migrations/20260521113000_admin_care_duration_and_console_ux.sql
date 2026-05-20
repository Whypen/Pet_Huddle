create or replace function public.admin_care_jsonb_first_text(p_value jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) > 0 then p_value ->> 0
    when jsonb_typeof(p_value) = 'string' then trim(both '"' from p_value::text)
    else null
  end;
$$;

create or replace function public.admin_care_jsonb_last_text(p_value jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) > 0 then p_value ->> (jsonb_array_length(p_value) - 1)
    when jsonb_typeof(p_value) = 'string' then trim(both '"' from p_value::text)
    else null
  end;
$$;

create or replace function public.admin_care_date_time_timestamptz(p_date text, p_time text, p_end_of_day boolean default false)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  v_date date;
  v_time time;
begin
  if nullif(btrim(coalesce(p_date, '')), '') is null then
    return null;
  end if;

  v_date := p_date::date;
  if nullif(btrim(coalesce(p_time, '')), '') is null then
    if p_end_of_day then
      return ((v_date + 1)::timestamp at time zone 'Asia/Hong_Kong');
    end if;
    return (v_date::timestamp at time zone 'Asia/Hong_Kong');
  end if;

  v_time := p_time::time;
  return ((v_date + v_time)::timestamp at time zone 'Asia/Hong_Kong');
exception
  when others then
    return null;
end;
$$;

create or replace function public.admin_get_care_transactions()
returns table(
  service_chat_id uuid,
  chat_id uuid,
  owner_id uuid,
  owner_name text,
  owner_social_id text,
  carer_id uuid,
  carer_name text,
  carer_social_id text,
  booking_status text,
  dispute_status text,
  normalized_money_flow_status text,
  total_paid numeric,
  service_rate numeric,
  owner_refunded numeric,
  carer_receives numeric,
  platform_fee_gross numeric,
  stripe_fee numeric,
  platform_net_retained numeric,
  currency text,
  payment_intent_id text,
  charge_id text,
  refund_ids text[],
  transfer_id text,
  transfer_reversal_id text,
  application_fee_id text,
  dispute_id uuid,
  connected_account_id text,
  stripe_connect_model text,
  db_updated_at timestamptz,
  stripe_synced_at timestamptz,
  booked_service_hours numeric,
  actual_service_hours numeric,
  service_started_at timestamptz,
  service_scheduled_end_at timestamptz,
  checked_in_at timestamptz,
  completed_at timestamptz,
  dispute_raised_at timestamptz,
  service_duration_source text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
begin
  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(v_is_admin, false) is not true then
    raise exception 'admin_required';
  end if;

  return query
  with latest_dispute as (
    select distinct on (sd.service_chat_id)
      sd.*
    from public.service_disputes sd
    order by sd.service_chat_id, sd.updated_at desc nulls last, sd.created_at desc nulls last
  ),
  latest_snapshot as (
    select distinct on (s.service_chat_id)
      s.*
    from public.care_money_flow_snapshots s
    order by s.service_chat_id, s.synced_at desc
  ),
  base as (
    select
      sc.id as service_chat_id,
      sc.chat_id,
      sc.requester_id,
      sc.provider_id,
      sc.status as booking_status,
      sc.care_status,
      sc.payout_released_at,
      sc.updated_at as service_chat_updated_at,
      sc.stripe_payment_intent_id,
      sc.booking_snapshot,
      sc.quote_card,
      sc.request_card,
      sc.checkin_submitted_at,
      sc.completed_at,
      sc.disputed_at,
      mb.service_start_date as marketplace_service_start_date,
      mb.service_end_date as marketplace_service_end_date,
      owner.display_name as owner_display_name,
      owner.social_id as owner_social_id,
      carer.display_name as carer_display_name,
      carer.social_id as carer_social_id,
      ld.id as dispute_id,
      ld.status as dispute_status,
      ld.stripe_charge_id as dispute_charge_id,
      ld.stripe_refund_id as dispute_refund_id,
      ld.stripe_transfer_id as dispute_transfer_id,
      ld.stripe_connected_account_id as dispute_connected_account_id,
      ld.final_customer_refund_amount,
      ld.final_provider_receives_amount,
      ld.final_huddle_retained_amount,
      ld.decision_payload,
      ls.charge_id as snapshot_charge_id,
      ls.refunds,
      ls.transfers,
      ls.application_fee,
      ls.balance_transactions,
      ls.normalized_money_flow_status as snapshot_status,
      ls.error_code as snapshot_error_code,
      ls.error_message as snapshot_error_message,
      ls.synced_at
    from public.service_chats sc
    join public.profiles owner on owner.id = sc.requester_id
    join public.profiles carer on carer.id = sc.provider_id
    left join public.marketplace_bookings mb on mb.stripe_payment_intent_id = sc.stripe_payment_intent_id
    left join latest_dispute ld on ld.service_chat_id = sc.id
    left join latest_snapshot ls on ls.service_chat_id = sc.id
    where sc.stripe_payment_intent_id is not null
      and lower(coalesce(sc.status, '')) <> 'pending'
  ),
  money as (
    select
      b.*,
      coalesce(
        nullif(b.decision_payload #>> '{money,currency}', ''),
        nullif(b.quote_card #>> '{currency}', ''),
        nullif(b.request_card #>> '{suggestedCurrency}', ''),
        'HKD'
      ) as money_currency,
      coalesce(
        public.try_parse_numeric(b.decision_payload #>> '{money,total_paid_amount}'),
        public.try_parse_numeric(b.quote_card #>> '{finalPrice}'),
        public.try_parse_numeric(b.quote_card #>> '{total_paid}'),
        public.try_parse_numeric(b.quote_card #>> '{totalPaid}'),
        public.try_parse_numeric(b.quote_card #>> '{amount_total}'),
        public.try_parse_numeric(b.quote_card #>> '{amountTotal}'),
        public.try_parse_numeric(b.request_card #>> '{suggestedPrice}'),
        0
      ) as total_paid_amount,
      coalesce(
        public.try_parse_numeric(b.decision_payload #>> '{money,service_rate_amount}'),
        public.try_parse_numeric(b.quote_card #>> '{service_rate_amount}'),
        greatest(
          coalesce(public.try_parse_numeric(b.quote_card #>> '{finalPrice}'), 0)
          - coalesce(public.try_parse_numeric(b.quote_card #>> '{platformFeeAmount}'), 0),
          0
        )
      ) as service_rate_amount,
      coalesce(
        public.try_parse_numeric(b.decision_payload #>> '{money,customer_refund_amount}'),
        b.final_customer_refund_amount,
        0
      ) as owner_refunded_amount,
      coalesce(
        public.try_parse_numeric(b.decision_payload #>> '{money,provider_receives_amount}'),
        b.final_provider_receives_amount,
        0
      ) as carer_receives_amount,
      coalesce(
        public.try_parse_numeric(b.decision_payload #>> '{money,platform_fee_amount}'),
        public.try_parse_numeric(b.decision_payload #>> '{money,customer_platform_fee_amount}'),
        public.try_parse_numeric(b.quote_card #>> '{customer_platform_fee_amount}'),
        public.try_parse_numeric(b.quote_card #>> '{platform_fee_amount}'),
        public.try_parse_numeric(b.quote_card #>> '{platformFeeAmount}'),
        public.try_parse_numeric(b.quote_card #>> '{platform_fee}'),
        public.try_parse_numeric(b.quote_card #>> '{platformFee}'),
        0
      ) as platform_fee_amount,
      coalesce(
        (
          select sum(coalesce(public.try_parse_numeric(bt.value ->> 'fee'), 0) / 100.0)
          from jsonb_array_elements(coalesce(b.balance_transactions, '[]'::jsonb)) bt(value)
        ),
        0
      ) as stripe_fee_amount,
      coalesce(
        public.try_parse_numeric(b.decision_payload #>> '{money,huddle_retained_amount}'),
        b.final_huddle_retained_amount,
        0
      ) as huddle_retained_amount
    from base b
  ),
  duration_source as (
    select
      m.*,
      coalesce(
        public.admin_care_jsonb_first_text(m.quote_card -> 'requestedDates'),
        public.admin_care_jsonb_first_text(m.request_card -> 'requestedDates'),
        nullif(m.request_card ->> 'requestedDate', ''),
        case when coalesce(m.booking_snapshot ->> 'startAt', '') !~ '[T ]' then nullif(m.booking_snapshot ->> 'startAt', '') end
      ) as booked_start_date_text,
      coalesce(
        public.admin_care_jsonb_last_text(m.quote_card -> 'requestedDates'),
        public.admin_care_jsonb_last_text(m.request_card -> 'requestedDates'),
        nullif(m.request_card ->> 'requestedDate', ''),
        case when coalesce(m.booking_snapshot ->> 'endAt', '') !~ '[T ]' then nullif(m.booking_snapshot ->> 'endAt', '') end,
        case when coalesce(m.booking_snapshot ->> 'startAt', '') !~ '[T ]' then nullif(m.booking_snapshot ->> 'startAt', '') end
      ) as booked_end_date_text,
      coalesce(
        nullif(m.quote_card ->> 'startTime', ''),
        nullif(m.request_card ->> 'startTime', '')
      ) as booked_start_time_text,
      coalesce(
        nullif(m.quote_card ->> 'endTime', ''),
        nullif(m.request_card ->> 'endTime', '')
      ) as booked_end_time_text,
      coalesce(
        case when coalesce(m.booking_snapshot ->> 'startAt', '') ~ '[T ]' then public.try_parse_timestamptz(m.booking_snapshot ->> 'startAt') end,
        case when coalesce(m.quote_card ->> 'startAt', '') ~ '[T ]' then public.try_parse_timestamptz(m.quote_card ->> 'startAt') end,
        case when coalesce(m.request_card ->> 'startAt', '') ~ '[T ]' then public.try_parse_timestamptz(m.request_card ->> 'startAt') end
      ) as direct_start_at,
      coalesce(
        case when coalesce(m.booking_snapshot ->> 'endAt', '') ~ '[T ]' then public.try_parse_timestamptz(m.booking_snapshot ->> 'endAt') end,
        case when coalesce(m.quote_card ->> 'endAt', '') ~ '[T ]' then public.try_parse_timestamptz(m.quote_card ->> 'endAt') end,
        case when coalesce(m.request_card ->> 'endAt', '') ~ '[T ]' then public.try_parse_timestamptz(m.request_card ->> 'endAt') end
      ) as direct_end_at
    from money m
  ),
  duration as (
    select
      ds.*,
      coalesce(
        ds.marketplace_service_start_date,
        ds.direct_start_at,
        public.admin_care_date_time_timestamptz(ds.booked_start_date_text, ds.booked_start_time_text, false)
      ) as scheduled_start_at,
      case
        when coalesce(
          ds.marketplace_service_end_date,
          ds.direct_end_at,
          public.admin_care_date_time_timestamptz(ds.booked_end_date_text, ds.booked_end_time_text, true)
        ) < coalesce(
          ds.marketplace_service_start_date,
          ds.direct_start_at,
          public.admin_care_date_time_timestamptz(ds.booked_start_date_text, ds.booked_start_time_text, false)
        )
        then coalesce(
          ds.marketplace_service_end_date,
          ds.direct_end_at,
          public.admin_care_date_time_timestamptz(ds.booked_end_date_text, ds.booked_end_time_text, true)
        ) + interval '1 day'
        else coalesce(
          ds.marketplace_service_end_date,
          ds.direct_end_at,
          public.admin_care_date_time_timestamptz(ds.booked_end_date_text, ds.booked_end_time_text, true)
        )
      end as scheduled_end_at
    from duration_source ds
  )
  select
    d.service_chat_id,
    d.chat_id,
    d.requester_id as owner_id,
    coalesce(nullif(d.owner_display_name, ''), 'Owner') as owner_name,
    coalesce(nullif(d.owner_social_id, ''), '') as owner_social_id,
    d.provider_id as carer_id,
    coalesce(nullif(d.carer_display_name, ''), 'Carer') as carer_name,
    coalesce(nullif(d.carer_social_id, ''), '') as carer_social_id,
    d.booking_status,
    d.dispute_status,
    public.admin_care_money_flow_status(
      d.booking_status,
      d.care_status,
      d.dispute_status,
      d.payout_released_at,
      d.snapshot_status,
      coalesce(d.snapshot_error_code, d.snapshot_error_message),
      d.owner_refunded_amount,
      d.total_paid_amount,
      d.carer_receives_amount
    ) as normalized_money_flow_status,
    d.total_paid_amount as total_paid,
    d.service_rate_amount as service_rate,
    d.owner_refunded_amount as owner_refunded,
    d.carer_receives_amount as carer_receives,
    d.platform_fee_amount as platform_fee_gross,
    d.stripe_fee_amount as stripe_fee,
    greatest(d.huddle_retained_amount - d.stripe_fee_amount, 0) as platform_net_retained,
    upper(d.money_currency) as currency,
    d.stripe_payment_intent_id as payment_intent_id,
    coalesce(d.snapshot_charge_id, d.dispute_charge_id, d.decision_payload #>> '{stripe_context,stripe_charge_id}') as charge_id,
    coalesce(
      (
        select array_agg(refund.value ->> 'id')
        from jsonb_array_elements(coalesce(d.refunds, '[]'::jsonb)) refund(value)
        where nullif(refund.value ->> 'id', '') is not null
      ),
      case when nullif(d.dispute_refund_id, '') is not null then array[d.dispute_refund_id] else array[]::text[] end
    ) as refund_ids,
    coalesce(
      (
        select transfer.value ->> 'id'
        from jsonb_array_elements(coalesce(d.transfers, '[]'::jsonb)) transfer(value)
        where nullif(transfer.value ->> 'id', '') is not null
        order by transfer.value ->> 'created' desc nulls last
        limit 1
      ),
      d.dispute_transfer_id,
      d.decision_payload #>> '{stripe_context,stripe_transfer_id}'
    ) as transfer_id,
    (
      select reversal.value ->> 'id'
      from jsonb_array_elements(coalesce(d.transfers, '[]'::jsonb)) transfer(value)
      cross join lateral jsonb_array_elements(coalesce(transfer.value -> 'reversals', '[]'::jsonb)) reversal(value)
      where nullif(reversal.value ->> 'id', '') is not null
      limit 1
    ) as transfer_reversal_id,
    coalesce(d.application_fee ->> 'id', d.decision_payload #>> '{stripe_context,application_fee_id}') as application_fee_id,
    d.dispute_id,
    coalesce(d.dispute_connected_account_id, d.decision_payload #>> '{stripe_context,stripe_connected_account_id}') as connected_account_id,
    case
      when coalesce(d.dispute_connected_account_id, d.decision_payload #>> '{stripe_context,stripe_connected_account_id}') is not null then 'destination_charge_or_separate_transfer'
      else 'platform_charge'
    end as stripe_connect_model,
    d.service_chat_updated_at as db_updated_at,
    d.synced_at as stripe_synced_at,
    case
      when d.scheduled_start_at is not null and d.scheduled_end_at is not null and d.scheduled_end_at > d.scheduled_start_at
        then round((extract(epoch from (d.scheduled_end_at - d.scheduled_start_at)) / 3600.0)::numeric, 2)
      else null
    end as booked_service_hours,
    case
      when d.checkin_submitted_at is not null
        and d.completed_at is not null
        and d.completed_at >= d.checkin_submitted_at
        then round((extract(epoch from (d.completed_at - d.checkin_submitted_at)) / 3600.0)::numeric, 2)
      when d.checkin_submitted_at is not null
        and d.completed_at is null
        and d.disputed_at is not null
        and d.disputed_at >= d.checkin_submitted_at
        then round((extract(epoch from (d.disputed_at - d.checkin_submitted_at)) / 3600.0)::numeric, 2)
      else null
    end as actual_service_hours,
    d.scheduled_start_at as service_started_at,
    d.scheduled_end_at as service_scheduled_end_at,
    d.checkin_submitted_at as checked_in_at,
    d.completed_at,
    d.disputed_at as dispute_raised_at,
    case
      when d.checkin_submitted_at is not null and d.completed_at is not null and d.completed_at >= d.checkin_submitted_at then 'completed'
      when d.checkin_submitted_at is not null and d.completed_at is null and d.disputed_at is not null and d.disputed_at >= d.checkin_submitted_at then 'dispute'
      else 'unavailable'
    end as service_duration_source
  from duration d
  order by greatest(coalesce(d.service_chat_updated_at, '-infinity'::timestamptz), coalesce(d.synced_at, '-infinity'::timestamptz)) desc;
end;
$$;

revoke all on function public.admin_care_jsonb_first_text(jsonb) from anon, authenticated;
revoke all on function public.admin_care_jsonb_last_text(jsonb) from anon, authenticated;
revoke all on function public.admin_care_date_time_timestamptz(text, text, boolean) from anon, authenticated;
revoke all on function public.admin_get_care_transactions() from anon;
grant execute on function public.admin_get_care_transactions() to authenticated;
