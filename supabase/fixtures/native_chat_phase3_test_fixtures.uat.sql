begin;

do $$
declare
  v_viewer constant uuid := '1e3e51ba-a8e7-4386-a947-09768a5c4cf7';
  v_peer constant uuid := '92eac3d5-08f2-43f4-bb53-9f4565b16784';
  v_group_peer constant uuid := '7ca64508-cd40-4ca5-b7eb-699fe81dede3';
  v_direct_chat constant uuid := '10000000-0000-4000-8000-000000001001';
  v_group_chat constant uuid := '10000000-0000-4000-8000-000000001002';
  v_service_chat constant uuid := '10000000-0000-4000-8000-000000001003';
  v_service_row constant uuid := '10000000-0000-4000-8000-000000001004';
  v_attachment_message constant uuid := '10000000-0000-4000-8000-000000001101';
  v_attachment_path constant text := '1e3e51ba-a8e7-4386-a947-09768a5c4cf7/chat-media/10000000-0000-4000-8000-000000001002/phase3-signed-fixture.png';
begin
  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id in (v_viewer, v_peer, v_group_peer)
    and email like 'native.chat.%@huddle.local';

  insert into public.profiles (
    id, email, display_name, full_name, dob, social_id, bio, onboarding_completed,
    location_name, location_country, location_district, last_lat, last_lng,
    pet_experience, languages, availability_status, social_availability,
    is_verified, verification_status, human_verification_status, human_verified_at,
    card_verification_status, card_verified, card_verified_at, effective_tier,
    non_social, account_status, created_at, updated_at, last_active_at
  )
  values
    (v_viewer, 'native.chat.viewer.test@huddle.local', 'Native Chat Viewer', 'Native Chat Viewer', '1996-05-06', 'nativeviewer', 'Non-production native chat Phase 3 fixture account.', true, 'Central', 'Hong Kong', 'Central and Western', 22.2819, 114.1589, array['Dogs','Cats'], array['English'], array['Pet Parent'], true, true, 'verified', 'passed', now(), 'passed', true, now(), 'gold', false, 'active', now() - interval '2 day', now(), now()),
    (v_peer, 'native.chat.peer.test@huddle.local', 'Native Chat Peer', 'Native Chat Peer', '1995-04-12', 'nativepeer', 'Direct chat peer for non-production native runtime proof.', true, 'Sheung Wan', 'Hong Kong', 'Central and Western', 22.2867, 114.1520, array['Dogs'], array['English'], array['Pet Nanny'], true, true, 'verified', 'passed', now(), 'passed', true, now(), 'gold', false, 'active', now() - interval '2 day', now(), now()),
    (v_group_peer, 'native.chat.group.test@huddle.local', 'Native Group Member', 'Native Group Member', '1994-03-15', 'nativegroup', 'Group chat peer for non-production native runtime proof.', true, 'Wan Chai', 'Hong Kong', 'Wan Chai', 22.2760, 114.1751, array['Cats'], array['English'], array['Animal Friend'], true, true, 'verified', 'passed', now(), 'passed', true, now(), 'gold', false, 'active', now() - interval '2 day', now(), now())
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    full_name = excluded.full_name,
    dob = excluded.dob,
    social_id = excluded.social_id,
    bio = excluded.bio,
    onboarding_completed = excluded.onboarding_completed,
    location_name = excluded.location_name,
    location_country = excluded.location_country,
    location_district = excluded.location_district,
    last_lat = excluded.last_lat,
    last_lng = excluded.last_lng,
    pet_experience = excluded.pet_experience,
    languages = excluded.languages,
    availability_status = excluded.availability_status,
    social_availability = excluded.social_availability,
    is_verified = excluded.is_verified,
    verification_status = excluded.verification_status,
    human_verification_status = excluded.human_verification_status,
    human_verified_at = excluded.human_verified_at,
    card_verification_status = excluded.card_verification_status,
    card_verified = excluded.card_verified,
    card_verified_at = excluded.card_verified_at,
    effective_tier = excluded.effective_tier,
    non_social = excluded.non_social,
    account_status = excluded.account_status,
    updated_at = excluded.updated_at,
    last_active_at = excluded.last_active_at;

  delete from public.message_reads where chat_id in (v_direct_chat, v_group_chat, v_service_chat);
  delete from public.chat_messages where chat_id in (v_direct_chat, v_group_chat, v_service_chat);
  delete from public.service_chats where chat_id = v_service_chat or id = v_service_row;
  delete from public.matches where chat_id = v_direct_chat or (user1_id = least(v_viewer, v_peer) and user2_id = greatest(v_viewer, v_peer));
  delete from public.group_chat_invites where chat_id = v_group_chat;
  delete from public.group_join_requests where chat_id = v_group_chat;
  delete from public.chat_participants where chat_id in (v_direct_chat, v_group_chat, v_service_chat);
  delete from public.chat_room_members where chat_id in (v_direct_chat, v_group_chat, v_service_chat);
  delete from public.chats where id in (v_direct_chat, v_group_chat, v_service_chat);

  insert into public.chats (
    id, type, name, created_by, created_at, updated_at, last_message_at,
    visibility, join_method, room_code, location_label, location_country, pet_focus, description
  )
  values
    (v_direct_chat, 'direct', null, v_viewer, now() - interval '2 day', now(), now(), 'private', 'request', null, null, null, null, null),
    (v_group_chat, 'group', 'Native Phase 3 Fixture Group', v_viewer, now() - interval '2 day', now(), now(), 'public', 'instant', null, 'Central', 'Hong Kong', array['Dogs','Cats'], 'Non-production group fixture for native chat Phase 3 runtime proof.'),
    (v_service_chat, 'service', 'Native Phase 3 Fixture Service', v_viewer, now() - interval '2 day', now(), now(), 'private', 'request', null, null, null, null, null);

  insert into public.chat_room_members (chat_id, user_id, created_at)
  values
    (v_direct_chat, v_viewer, now() - interval '2 day'),
    (v_direct_chat, v_peer, now() - interval '2 day'),
    (v_group_chat, v_viewer, now() - interval '2 day'),
    (v_group_chat, v_group_peer, now() - interval '2 day'),
    (v_service_chat, v_viewer, now() - interval '2 day'),
    (v_service_chat, v_peer, now() - interval '2 day')
  on conflict (chat_id, user_id) do nothing;

  insert into public.chat_participants (chat_id, user_id, role, joined_at, last_read_at, is_muted)
  values
    (v_group_chat, v_viewer, 'admin', now() - interval '2 day', now(), false),
    (v_group_chat, v_group_peer, 'member', now() - interval '2 day', now(), false)
  on conflict on constraint chat_participants_chat_id_user_id_key do update set
    role = excluded.role,
    joined_at = excluded.joined_at,
    last_read_at = excluded.last_read_at,
    is_muted = excluded.is_muted;

  insert into public.matches (user1_id, user2_id, chat_id, matched_at, last_interaction_at, is_active)
  values (least(v_viewer, v_peer), greatest(v_viewer, v_peer), v_direct_chat, now() - interval '2 day', now(), true)
  on conflict (user1_id, user2_id) do update set
    chat_id = excluded.chat_id,
    matched_at = excluded.matched_at,
    last_interaction_at = excluded.last_interaction_at,
    is_active = true;

  insert into public.pet_care_profiles (user_id, story, skills, days, time_blocks, location_styles, services_offered, pet_types, dog_sizes, starting_price, currency, rates, completed, listed, agreement_accepted, agreement_accepted_at, agreement_version)
  values (v_peer, 'Non-production native service handoff fixture provider.', array['Professional pet-carer','Passionate newbie'], array['Mon','Tue','Wed'], array['Morning','Afternoon'], array['Owner home'], array['Walking','Drop-in'], array['Dogs','Cats'], array['Small','Medium'], 120, 'HKD', array['Per visit'], true, true, true, now(), 'fixture')
  on conflict (user_id) do update set
    story = excluded.story,
    skills = excluded.skills,
    days = excluded.days,
    time_blocks = excluded.time_blocks,
    location_styles = excluded.location_styles,
    services_offered = excluded.services_offered,
    pet_types = excluded.pet_types,
    dog_sizes = excluded.dog_sizes,
    starting_price = excluded.starting_price,
    currency = excluded.currency,
    rates = excluded.rates,
    completed = excluded.completed,
    listed = excluded.listed,
    agreement_accepted = excluded.agreement_accepted,
    agreement_accepted_at = excluded.agreement_accepted_at,
    agreement_version = excluded.agreement_version,
    updated_at = now();

  insert into public.service_chats (id, chat_id, requester_id, provider_id, status, request_card, request_opened_at, request_sent_at, created_at, updated_at)
  values (
    v_service_row,
    v_service_chat,
    v_viewer,
    v_peer,
    'pending',
    jsonb_build_object('title', 'Native Phase 3 Fixture Service', 'description', 'Non-production service chat handoff fixture.', 'pet', 'Fixture pet'),
    now() - interval '1 day',
    now() - interval '1 day',
    now() - interval '1 day',
    now()
  )
  on conflict (id) do update set
    chat_id = excluded.chat_id,
    requester_id = excluded.requester_id,
    provider_id = excluded.provider_id,
    status = excluded.status,
    request_card = excluded.request_card,
    request_opened_at = excluded.request_opened_at,
    request_sent_at = excluded.request_sent_at,
    updated_at = excluded.updated_at;

  insert into public.group_chat_invites (chat_id, chat_name, inviter_user_id, invitee_user_id, status, created_at)
  values (v_group_chat, 'Native Phase 3 Fixture Group', v_viewer, v_peer, 'pending', now() - interval '1 day')
  on conflict (chat_id, invitee_user_id) do update set
    chat_name = excluded.chat_name,
    inviter_user_id = excluded.inviter_user_id,
    status = excluded.status,
    created_at = excluded.created_at;

  insert into public.group_join_requests (chat_id, user_id, status, created_at)
  values (v_group_chat, v_peer, 'pending', now() - interval '1 day')
  on conflict (chat_id, user_id) do update set
    status = excluded.status;

  insert into public.chat_messages (id, chat_id, sender_id, content, created_at)
  values
    ('10000000-0000-4000-8000-000000001010', v_direct_chat, v_peer, 'Direct fixture opener for native Phase 3 proof.', now() - interval '2 day'),
    ('10000000-0000-4000-8000-000000001011', v_direct_chat, v_viewer, 'Direct fixture reply with read receipt seed.', now() - interval '2 day' + interval '5 minute'),
    ('10000000-0000-4000-8000-000000001020', v_group_chat, v_group_peer, 'Native Group Member just joined the chat.', now() - interval '2 day'),
    (v_attachment_message, v_group_chat, v_viewer, jsonb_build_object('text', 'Signed attachment fixture', 'attachments', jsonb_build_array(jsonb_build_object('bucket', 'chat_attachments', 'path', v_attachment_path, 'url', null, 'name', 'phase3-signed-fixture.png', 'mime', 'image/png', 'size', 256)))::text, now() - interval '1 day'),
    ('10000000-0000-4000-8000-000000001030', v_service_chat, v_peer, 'Service fixture opener for native handoff proof.', now() - interval '1 day');

  insert into public.chat_messages (chat_id, sender_id, content, created_at)
  select
    v_direct_chat,
    case when gs % 2 = 0 then v_viewer else v_peer end,
    'Direct pagination fixture message #' || lpad(gs::text, 3, '0'),
    now() - interval '20 hour' + (gs || ' minutes')::interval
  from generate_series(1, 120) as gs;

  insert into public.chat_messages (chat_id, sender_id, content, created_at)
  select
    v_group_chat,
    case when gs % 2 = 0 then v_viewer else v_group_peer end,
    case
      when gs <= 40 then jsonb_build_object('text', 'Media-heavy fixture message #' || gs, 'attachments', jsonb_build_array(jsonb_build_object('bucket', 'chat_attachments', 'path', v_attachment_path, 'url', null, 'name', 'phase3-signed-fixture.png', 'mime', 'image/png', 'size', 256)))::text
      else 'Group pagination fixture message #' || gs
    end,
    now() - interval '18 hour' + (gs || ' minutes')::interval
  from generate_series(1, 110) as gs;

  insert into public.message_reads (chat_id, message_id, user_id, read_at)
  select cm.chat_id, cm.id, v_peer, now()
  from public.chat_messages cm
  where cm.chat_id = v_direct_chat
    and cm.sender_id = v_viewer
  on conflict (message_id, user_id) do update set
    chat_id = excluded.chat_id,
    read_at = excluded.read_at;

  update public.chats c
  set last_message_at = latest.created_at,
      updated_at = now()
  from (
    select chat_id, max(created_at) as created_at
    from public.chat_messages
    where chat_id in (v_direct_chat, v_group_chat, v_service_chat)
    group by chat_id
  ) latest
  where c.id = latest.chat_id;
end $$;

commit;
