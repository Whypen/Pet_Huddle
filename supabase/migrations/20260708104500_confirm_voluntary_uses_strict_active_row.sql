-- No-charge booking confirmation must resolve the same active service row used by
-- the chat UI. A reused conversation can contain old completed/cancelled rows and
-- newer pending rows; only the strict active row is valid for confirmation.

create or replace function public.confirm_voluntary_service_booking(p_chat_id uuid, p_requester_id uuid, p_booking_snapshot jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := p_requester_id;
  v_sc public.service_chats%rowtype;
  v_version public.care_scope_versions%rowtype;
  v_owner_sig public.care_scope_signatures%rowtype;
  v_carer_sig public.care_scope_signatures%rowtype;
  v_snapshot jsonb;
  v_consent jsonb;
  v_consent_hash text;
  v_agreement public.service_care_agreements%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_sc
  from public.service_chats
  where id = p_chat_id
  for update;

  if not found then
    select * into v_sc
    from public.service_chats
    where id = public.current_active_service_chat_id_for_room(p_chat_id)
    for update;
  end if;

  if not found then raise exception 'service_chat_not_found'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.status <> 'pending' then raise exception 'invalid_status'; end if;
  perform public.assert_pending_request_not_expired(v_sc.id);
  if coalesce((v_sc.quote_card->>'voluntary')::boolean, false) is not true then raise exception 'quote_not_voluntary'; end if;
  if nullif(btrim(coalesce(v_sc.quote_card->>'finalPrice', '')), '') is not null
     and (
       coalesce(v_sc.quote_card->>'finalPrice', '') !~ '^[0-9]+(\.[0-9]+)?$'
       or (v_sc.quote_card->>'finalPrice')::numeric > 0
     ) then
    raise exception 'voluntary_quote_has_price';
  end if;

  perform public.expire_stale_care_scope_payment_lock(v_sc.id);

  select * into v_version
  from public.care_scope_versions
  where service_chat_id = v_sc.id and is_active
  for update;
  if not found then raise exception 'care_scope_version_required'; end if;
  if v_version.payment_status in ('creating', 'pending') then raise exception 'care_scope_payment_pending'; end if;

  select * into v_owner_sig
  from public.care_scope_signatures
  where scope_version_id = v_version.id and role = 'owner' and scope_hash = v_version.scope_hash
  limit 1;
  if not found then raise exception 'owner_scope_signature_required'; end if;

  select * into v_carer_sig
  from public.care_scope_signatures
  where scope_version_id = v_version.id and role = 'carer' and scope_hash = v_version.scope_hash
  limit 1;
  if not found then raise exception 'carer_scope_signature_required'; end if;

  v_snapshot := coalesce(p_booking_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'voluntary', true,
      'price', jsonb_build_object('currency', '', 'providerQuote', 0, 'requesterTotal', 0),
      'requesterId', v_sc.requester_id,
      'providerId', v_sc.provider_id,
      'requesterSignature', coalesce(v_owner_sig.signature, '{}'::jsonb) || jsonb_build_object(
        'imageBucket', coalesce(nullif(v_owner_sig.image_bucket, ''), 'care_agreements'),
        'imagePath', v_owner_sig.image_path,
        'path', coalesce(nullif(v_owner_sig.image_path, ''), v_owner_sig.signature->>'path'),
        'signedAt', coalesce(v_owner_sig.signed_at::text, v_owner_sig.signature->>'signedAt')
      ),
      'createdAt', now()
    );

  v_consent := jsonb_build_object(
    'paymentAmount', 0,
    'paymentCurrency', coalesce(v_snapshot #>> '{price,currency}', ''),
    'paymentMethodConsent', false,
    'serviceFee', 0,
    'cancellationRefundAcknowledged', true,
    'termsPath', coalesce(v_snapshot->>'termsPath', '/booking-terms'),
    'termsVersion', coalesce(v_snapshot->>'termsVersion', '20 May 2026'),
    'checkoutRequestedAt', now(),
    'voluntaryNoCharge', true
  );
  v_consent_hash := public.care_scope_hash(jsonb_strip_nulls(v_consent || jsonb_build_object(
    'scopeVersionId', v_version.id,
    'scopeHash', v_version.scope_hash,
    'ownerId', v_sc.requester_id,
    'providerId', v_sc.provider_id
  )));

  update public.care_scope_versions
  set owner_payment_consent = v_consent,
      owner_payment_consent_hash = v_consent_hash,
      owner_payment_consented_at = now()
  where id = v_version.id
  returning * into v_version;

  perform public.validate_service_booking_snapshot(v_snapshot);

  update public.service_chats
  set status = 'booked',
      care_status = 'awaiting_handoff',
      booking_snapshot = v_snapshot,
      booking_snapshot_pending = null,
      stripe_checkout_session_id = null,
      stripe_payment_intent_id = null,
      booked_at = coalesce(booked_at, now()),
      updated_at = now()
  where id = v_sc.id;

  update public.care_scope_versions
  set payment_status = 'succeeded',
      payment_pending_started_at = null,
      payment_pending_expires_at = null
  where id = v_version.id;

  insert into public.service_care_agreements(
    service_chat_id, agreement_version, booking_snapshot, requester_signature, requester_signature_path, requester_signed_at,
    provider_signature, provider_signature_path, provider_signed_at, status, scope_version_id, scope_hash,
    owner_payment_consent, owner_payment_consent_hash, payment_status
  )
  values (
    v_sc.id, '1.0', v_snapshot, v_owner_sig.signature, v_owner_sig.image_path, v_owner_sig.signed_at,
    v_carer_sig.signature, v_carer_sig.image_path, v_carer_sig.signed_at, 'provider_signed', v_version.id, v_version.scope_hash,
    v_version.owner_payment_consent, v_version.owner_payment_consent_hash, 'voluntary_confirmed'
  )
  on conflict (service_chat_id) do update
    set booking_snapshot = excluded.booking_snapshot,
        requester_signature = excluded.requester_signature,
        requester_signature_path = excluded.requester_signature_path,
        requester_signed_at = excluded.requester_signed_at,
        provider_signature = excluded.provider_signature,
        provider_signature_path = excluded.provider_signature_path,
        provider_signed_at = excluded.provider_signed_at,
        scope_version_id = excluded.scope_version_id,
        scope_hash = excluded.scope_hash,
        owner_payment_consent = excluded.owner_payment_consent,
        owner_payment_consent_hash = excluded.owner_payment_consent_hash,
        payment_status = excluded.payment_status,
        status = case when public.service_care_agreements.pdf_path is not null then public.service_care_agreements.status else 'provider_signed' end,
        updated_at = now()
  returning * into v_agreement;

  insert into public.service_care_events (service_chat_id, actor_id, event_type, metadata)
  values (v_sc.id, v_uid, 'care_update', jsonb_build_object('kind', 'voluntary_booking_confirmed', 'confirmed_at', now()));

  insert into public.chat_messages (chat_id, sender_id, content)
  values (v_sc.chat_id, v_uid, jsonb_build_object('kind', 'service_booked', 'voluntary', true)::text);

  update public.chats set last_message_at = now() where id = v_sc.chat_id;

  perform public.insert_care_agreement_notification(
    'care_booking_secured:' || v_agreement.id::text,
    v_sc.id,
    v_version.id,
    v_uid,
    v_sc.provider_id,
    'service_booking',
    'Booking secured',
    'Booking secured! The owner signed the agreement.',
    '/service-chat?room=' || v_sc.chat_id::text,
    jsonb_build_object('kind', 'care_booking_secured', 'agreement_id', v_agreement.id, 'scope_version_id', v_version.id, 'voluntary', true)
  );

  return jsonb_build_object('ok', true, 'status', 'booked', 'care_status', 'awaiting_handoff', 'agreement_id', v_agreement.id);
end;
$function$;

revoke all on function public.confirm_voluntary_service_booking(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_voluntary_service_booking(uuid, uuid, jsonb) to service_role;
