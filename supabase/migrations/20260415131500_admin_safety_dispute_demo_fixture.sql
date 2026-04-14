-- /admin/safety realistic dispute demo fixture (read-only, no payout/refund execution)
-- Tagged: [DEMO_FIXTURE_ADMIN_SAFETY_V1]

begin;

alter table public.service_disputes
  drop constraint if exists service_disputes_status_check;

alter table public.service_disputes
  add constraint service_disputes_status_check
  check (
    status = any (
      array[
        'open'::text,
        'under_review'::text,
        'decision_ready'::text,
        'resolved_release_full'::text,
        'resolved_partial_refund'::text,
        'resolved_refund_full'::text,
        'resolved'::text,
        'closed'::text
      ]
    )
  );

do $$
declare
  v_tag constant text := '[DEMO_FIXTURE_ADMIN_SAFETY_V1]';
  v_requester uuid;
  v_provider uuid;
  v_actor uuid;

  v_chat_id_open uuid := '22222222-2222-4222-8222-222222222211'::uuid;
  v_chat_id_ready uuid := '22222222-2222-4222-8222-222222222212'::uuid;
  v_service_chat_open uuid := '33333333-3333-4333-8333-333333333311'::uuid;
  v_service_chat_ready uuid := '33333333-3333-4333-8333-333333333312'::uuid;
  v_dispute_open uuid := '44444444-4444-4444-8444-444444444411'::uuid;
  v_dispute_ready uuid := '44444444-4444-4444-8444-444444444412'::uuid;
begin
  select p.id into v_actor
  from public.profiles p
  where coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin'
  order by p.created_at asc nulls last
  limit 1;

  select p.id into v_requester
  from public.profiles p
  where p.id <> coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
  order by p.created_at asc nulls last
  limit 1;

  select p.id into v_provider
  from public.profiles p
  where p.id not in (
    coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(v_requester, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  order by
    case when lower(coalesce(p.user_role, '')) in ('provider', 'carer', 'pet carer', 'service_provider') then 0 else 1 end,
    p.created_at asc nulls last
  limit 1;

  if v_requester is null or v_provider is null then
    raise notice 'Skipping dispute fixture: requires at least 2 profile rows';
    return;
  end if;

  if v_actor is null then
    v_actor := v_requester;
  end if;

  -- idempotent cleanup for this fixture
  delete from public.chat_messages where chat_id in (v_chat_id_open, v_chat_id_ready);
  delete from public.chat_participants where chat_id in (v_chat_id_open, v_chat_id_ready);
  delete from public.service_disputes where id in (v_dispute_open, v_dispute_ready)
    or description ilike '%' || v_tag || '%';
  delete from public.service_chats where id in (v_service_chat_open, v_service_chat_ready);
  delete from public.chats where id in (v_chat_id_open, v_chat_id_ready);

  insert into public.chats (id, type, name, created_by, created_at, updated_at, last_message_at)
  values
    (v_chat_id_open, 'service', v_tag || ' Demo Service Chat Open', v_requester, now() - interval '3 day', now() - interval '2 day', now() - interval '2 day'),
    (v_chat_id_ready, 'service', v_tag || ' Demo Service Chat Decision Ready', v_requester, now() - interval '2 day', now() - interval '1 day', now() - interval '1 day');

  insert into public.chat_participants (chat_id, user_id, role, joined_at)
  values
    (v_chat_id_open, v_requester, 'member', now() - interval '3 day'),
    (v_chat_id_open, v_provider, 'member', now() - interval '3 day'),
    (v_chat_id_ready, v_requester, 'member', now() - interval '2 day'),
    (v_chat_id_ready, v_provider, 'member', now() - interval '2 day')
  on conflict do nothing;

  insert into public.service_chats (
    id, chat_id, requester_id, provider_id, status,
    request_card, quote_card,
    request_opened_at, quote_sent_at, booked_at, disputed_at,
    requester_mark_finished, provider_mark_finished,
    created_at, updated_at
  ) values
    (
      v_service_chat_open,
      v_chat_id_open,
      v_requester,
      v_provider,
      'disputed',
      jsonb_build_object(
        'serviceType', 'Pet Grooming',
        'serviceTypes', jsonb_build_array('Pet Grooming'),
        'requestedDates', jsonb_build_array(to_char((now()::date - 1), 'YYYY-MM-DD'), to_char(now()::date, 'YYYY-MM-DD')),
        'locationArea', 'Hong Kong Island',
        'additionalNotes', v_tag || ' Open dispute booking period demo'
      ),
      jsonb_build_object(
        'serviceType', 'Pet Grooming',
        'serviceTypes', jsonb_build_array('Pet Grooming'),
        'currency', 'HKD',
        'finalPrice', '230.00',
        'platform_fee_amount', '23.00',
        'rate', 'fixed'
      ),
      now() - interval '2 day 8 hour',
      now() - interval '2 day 6 hour',
      now() - interval '2 day 4 hour',
      now() - interval '2 day 1 hour',
      true,
      true,
      now() - interval '3 day',
      now() - interval '2 day'
    ),
    (
      v_service_chat_ready,
      v_chat_id_ready,
      v_requester,
      v_provider,
      'disputed',
      jsonb_build_object(
        'serviceType', 'Boarding',
        'serviceTypes', jsonb_build_array('Boarding'),
        'requestedDates', jsonb_build_array(to_char((now()::date - 3), 'YYYY-MM-DD'), to_char((now()::date - 2), 'YYYY-MM-DD')),
        'locationArea', 'Kowloon',
        'additionalNotes', v_tag || ' Decision-ready dispute booking period demo'
      ),
      jsonb_build_object(
        'serviceType', 'Boarding',
        'serviceTypes', jsonb_build_array('Boarding'),
        'currency', 'HKD',
        'finalPrice', '520.00',
        'platform_fee_amount', '52.00',
        'rate', 'fixed'
      ),
      now() - interval '1 day 12 hour',
      now() - interval '1 day 11 hour',
      now() - interval '1 day 10 hour',
      now() - interval '1 day 8 hour',
      true,
      true,
      now() - interval '2 day',
      now() - interval '1 day'
    );

  insert into public.chat_messages (chat_id, sender_id, content, created_at)
  values
    (v_chat_id_open, v_requester, v_tag || ' Requester evidence note: pet returned with stress signs.', now() - interval '2 day 30 minute'),
    (v_chat_id_open, v_provider, v_tag || ' Provider response: service was completed as agreed.', now() - interval '2 day 25 minute'),
    (v_chat_id_open, v_requester, v_tag || ' Requester follow-up: attaching grooming photo evidence.', now() - interval '2 day 20 minute'),
    (v_chat_id_ready, v_requester, v_tag || ' Requester claim: booked dates were shortened.', now() - interval '1 day 7 hour'),
    (v_chat_id_ready, v_provider, v_tag || ' Provider claim: partial service delivered due to emergency.', now() - interval '1 day 6 hour');

  insert into public.service_disputes (
    id, service_chat_id, filed_by, category, description, evidence_urls, status, admin_notes, created_at, updated_at,
    decision_action, decision_note, decision_payload, decision_actor_id, decision_at, decision_version
  ) values
    (
      v_dispute_open,
      v_service_chat_open,
      v_requester,
      'service_quality',
      v_tag || ' Open dispute: quality concern for Pet Grooming service.',
      array[
        'https://example.com/' || replace(v_tag, '[', '') || '/grooming-before.jpg',
        'https://example.com/' || replace(v_tag, '[', '') || '/grooming-after.jpg'
      ]::text[],
      'open',
      v_tag || ' Open fixture. Funds should remain on hold until decision.',
      now() - interval '2 day',
      now() - interval '2 day',
      null,
      null,
      jsonb_build_object(
        'source', 'manual',
        'demo_fixture_tag', v_tag,
        'money', jsonb_build_object(
          'currency', 'hkd',
          'total_paid_amount', 230.00,
          'platform_fee_amount', 23.00,
          'provider_receives_amount', 0,
          'customer_refund_amount', 0
        )
      ),
      null,
      null,
      0
    ),
    (
      v_dispute_ready,
      v_service_chat_ready,
      v_requester,
      'booking_scope',
      v_tag || ' Decision-ready dispute: service period mismatch for Boarding.',
      array['https://example.com/' || replace(v_tag, '[', '') || '/boarding-chat-export.pdf']::text[],
      'decision_ready',
      v_tag || ' Decision-ready fixture for admin action testing.',
      now() - interval '1 day 9 hour',
      now() - interval '1 day 6 hour',
      null,
      null,
      jsonb_build_object(
        'source', 'manual',
        'demo_fixture_tag', v_tag,
        'money', jsonb_build_object(
          'currency', 'hkd',
          'total_paid_amount', 520.00,
          'platform_fee_amount', 52.00,
          'provider_receives_amount', 0,
          'customer_refund_amount', 0
        )
      ),
      null,
      null,
      0
    );

  insert into public.admin_audit_logs (actor_id, action, target_user_id, notes, details, created_at)
  values (
    v_actor,
    'disputes_fixture_seeded',
    v_requester,
    v_tag || ' Realistic dispute fixture seeded for /admin/safety live review',
    jsonb_build_object(
      'source', 'manual',
      'demo_fixture_tag', v_tag,
      'dispute_ids', jsonb_build_array(v_dispute_open, v_dispute_ready),
      'service_chat_ids', jsonb_build_array(v_service_chat_open, v_service_chat_ready)
    ),
    now() - interval '10 minute'
  );
end $$;

commit;
