begin;

do $$
declare
  v_team_huddle_user_id constant uuid := '8f55ab31-6b25-4d1a-98c7-3a6e8af2d941';
  v_instance_id uuid;
begin
  select id into v_instance_id from auth.instances limit 1;
  if v_instance_id is null then
    select instance_id into v_instance_id from auth.users limit 1;
  end if;
  if v_instance_id is null then
    raise exception 'auth_instance_missing_and_no_auth_users';
  end if;

  if not exists (select 1 from auth.users where id = v_team_huddle_user_id) then
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      v_team_huddle_user_id,
      v_instance_id,
      'authenticated',
      'authenticated',
      'team.huddle@internal.huddle.pet',
      crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"internal":true}',
      '{"display_name":"Team Huddle","social_id":"teamhuddle"}',
      now(),
      now()
    );
  end if;

  insert into public.profiles (
    id,
    display_name,
    social_id,
    is_verified,
    verified,
    non_social,
    hide_from_map,
    map_visible,
    posted_to_threads,
    user_role,
    is_admin,
    account_status,
    updated_at
  ) values (
    v_team_huddle_user_id,
    'Team Huddle',
    'teamhuddle',
    true,
    true,
    true,
    true,
    false,
    false,
    'internal_system',
    false,
    'active',
    now()
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        social_id = excluded.social_id,
        is_verified = true,
        verified = true,
        non_social = true,
        hide_from_map = true,
        map_visible = false,
        posted_to_threads = false,
        user_role = 'internal_system',
        is_admin = false,
        account_status = 'active',
        updated_at = now();

  delete from public.pet_care_profiles where user_id = v_team_huddle_user_id;
  delete from public.sitter_profiles where user_id = v_team_huddle_user_id;
end $$;

create table if not exists public.team_huddle_case_messages (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  case_type text not null check (case_type in ('report', 'dispute', 'user')),
  case_id text not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_role text not null,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  chat_id uuid not null references public.chats(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  notification_id text null,
  notification_href text null,
  message_body text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists team_huddle_case_messages_recipient_created_idx
  on public.team_huddle_case_messages (recipient_user_id, created_at desc);

create or replace function public.admin_send_team_huddle_case_message(
  p_case_type text,
  p_case_id text,
  p_recipient_user_id uuid,
  p_recipient_role text,
  p_message_body text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_case_type text := lower(trim(coalesce(p_case_type, '')));
  v_case_id text := nullif(trim(coalesce(p_case_id, '')), '');
  v_recipient_role text := lower(trim(coalesce(p_recipient_role, '')));
  v_message_body text := nullif(trim(coalesce(p_message_body, '')), '');
  v_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_team_huddle_user_id constant uuid := '8f55ab31-6b25-4d1a-98c7-3a6e8af2d941';
  v_chat_id uuid := null;
  v_message_id uuid := null;
  v_notification_id text := null;
  v_notification_href text := null;
  v_existing jsonb := null;
  v_notification_body text := 'You have received a message from Team Huddle. Tap to view';
begin
  if v_actor is null then
    raise exception 'auth_required';
  end if;

  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_actor;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'not_authorized';
  end if;

  if v_case_type not in ('report', 'dispute', 'user') then
    raise exception 'invalid_case_type';
  end if;
  if v_case_id is null then
    raise exception 'case_id_required';
  end if;
  if p_recipient_user_id is null then
    raise exception 'recipient_required';
  end if;
  if v_recipient_role = '' then
    raise exception 'recipient_role_required';
  end if;
  if v_message_body is null then
    raise exception 'message_body_required';
  end if;
  if v_idempotency_key is null then
    raise exception 'idempotency_key_required';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_team_huddle_user_id) then
    raise exception 'team_huddle_identity_not_configured';
  end if;

  select jsonb_build_object(
    'ok', true,
    'idempotent_replay', true,
    'chat_id', t.chat_id,
    'message_id', t.message_id,
    'notification_id', t.notification_id,
    'notification_href', t.notification_href,
    'sender_user_id', t.sender_user_id,
    'recipient_user_id', t.recipient_user_id,
    'case_type', t.case_type,
    'case_id', t.case_id,
    'recipient_role', t.recipient_role,
    'message_body', t.message_body
  )
  into v_existing
  from public.team_huddle_case_messages t
  where t.idempotency_key = v_idempotency_key
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select c.id
  into v_chat_id
  from public.chats c
  where lower(coalesce(c.type, '')) = 'direct'
    and exists (
      select 1 from public.chat_room_members crm
      where crm.chat_id = c.id and crm.user_id = v_team_huddle_user_id
    )
    and exists (
      select 1 from public.chat_room_members crm
      where crm.chat_id = c.id and crm.user_id = p_recipient_user_id
    )
    and (
      select count(*) from public.chat_room_members crm
      where crm.chat_id = c.id
    ) = 2
  order by c.updated_at desc nulls last, c.created_at desc nulls last
  limit 1;

  if v_chat_id is null then
    insert into public.chats (type, created_by, name, created_at, updated_at, last_message_at)
    values ('direct', v_team_huddle_user_id, null, now(), now(), now())
    returning id into v_chat_id;

    insert into public.chat_room_members (chat_id, user_id, created_at)
    values
      (v_chat_id, v_team_huddle_user_id, now()),
      (v_chat_id, p_recipient_user_id, now())
    on conflict do nothing;
  end if;

  insert into public.chat_messages (chat_id, sender_id, content, created_at)
  values (v_chat_id, v_team_huddle_user_id, v_message_body, now())
  returning id into v_message_id;

  update public.chats
    set last_message_at = now(),
        updated_at = now()
  where id = v_chat_id;

  v_notification_href := '/chat-dialogue?room=' || v_chat_id::text || '&with=' || v_team_huddle_user_id::text;

  if not exists (
    select 1
    from public.notifications n
    where n.user_id = p_recipient_user_id
      and n.type = 'chats'
      and coalesce(n.data->>'team_huddle_idempotency_key', '') = v_idempotency_key
  ) then
    select public.enqueue_notification(
      p_user_id := p_recipient_user_id,
      p_category := 'chats',
      p_kind := 'team_huddle_case_message',
      p_title := 'Team Huddle',
      p_body := v_notification_body,
      p_href := v_notification_href,
      p_data := jsonb_build_object(
        'room_id', v_chat_id,
        'with_user_id', v_team_huddle_user_id,
        'team_huddle_idempotency_key', v_idempotency_key,
        'case_type', v_case_type,
        'case_id', v_case_id,
        'recipient_role', v_recipient_role
      )
    ) into v_notification_id;
  end if;

  insert into public.team_huddle_case_messages (
    idempotency_key,
    case_type,
    case_id,
    recipient_user_id,
    recipient_role,
    sender_user_id,
    chat_id,
    message_id,
    notification_id,
    notification_href,
    message_body,
    created_by
  ) values (
    v_idempotency_key,
    v_case_type,
    v_case_id,
    p_recipient_user_id,
    v_recipient_role,
    v_team_huddle_user_id,
    v_chat_id,
    v_message_id,
    v_notification_id,
    v_notification_href,
    v_message_body,
    v_actor
  );

  insert into public.admin_audit_logs (actor_id, action, target_user_id, notes, details)
  values (
    v_actor,
    'team_huddle_case_message_sent',
    p_recipient_user_id,
    null,
    jsonb_build_object(
      'source', 'manual',
      'case_type', v_case_type,
      'case_id', v_case_id,
      'recipient_user_id', p_recipient_user_id,
      'recipient_role', v_recipient_role,
      'sender_user_id', v_team_huddle_user_id,
      'chat_id', v_chat_id,
      'message_id', v_message_id,
      'message_body', v_message_body,
      'notification_id', v_notification_id,
      'notification_href', v_notification_href,
      'idempotency_key', v_idempotency_key
    )
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'chat_id', v_chat_id,
    'message_id', v_message_id,
    'notification_id', v_notification_id,
    'notification_href', v_notification_href,
    'sender_user_id', v_team_huddle_user_id,
    'recipient_user_id', p_recipient_user_id,
    'case_type', v_case_type,
    'case_id', v_case_id,
    'recipient_role', v_recipient_role,
    'message_body', v_message_body
  );
end;
$$;

create or replace function public.admin_get_team_huddle_correspondence(
  p_user_id uuid,
  p_limit integer default 120
)
returns table (
  message_id uuid,
  chat_id uuid,
  sender_user_id uuid,
  sender_display_name text,
  sender_social_id text,
  message_body text,
  created_at timestamptz,
  is_team_huddle boolean,
  case_type text,
  case_id text,
  recipient_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_chat_id uuid := null;
  v_team_huddle_user_id constant uuid := '8f55ab31-6b25-4d1a-98c7-3a6e8af2d941';
  v_limit integer := greatest(1, least(coalesce(p_limit, 120), 500));
begin
  if v_actor is null then
    raise exception 'auth_required';
  end if;
  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_actor;
  if coalesce(v_is_admin, false) is not true then
    raise exception 'not_authorized';
  end if;
  if p_user_id is null then
    raise exception 'user_required';
  end if;

  select c.id
  into v_chat_id
  from public.chats c
  where lower(coalesce(c.type, '')) = 'direct'
    and exists (
      select 1 from public.chat_room_members crm
      where crm.chat_id = c.id and crm.user_id = v_team_huddle_user_id
    )
    and exists (
      select 1 from public.chat_room_members crm
      where crm.chat_id = c.id and crm.user_id = p_user_id
    )
    and (
      select count(*) from public.chat_room_members crm
      where crm.chat_id = c.id
    ) = 2
  order by c.updated_at desc nulls last, c.created_at desc nulls last
  limit 1;

  if v_chat_id is null then
    return;
  end if;

  return query
  with latest as (
    select
      m.id as message_id,
      m.chat_id,
      m.sender_id as sender_user_id,
      p.display_name as sender_display_name,
      p.social_id as sender_social_id,
      m.content as message_body,
      m.created_at,
      (m.sender_id = v_team_huddle_user_id) as is_team_huddle
    from public.chat_messages m
    left join public.profiles p on p.id = m.sender_id
    where m.chat_id = v_chat_id
    order by m.created_at desc, m.id desc
    limit v_limit
  )
  select
    l.message_id,
    l.chat_id,
    l.sender_user_id,
    l.sender_display_name,
    l.sender_social_id,
    l.message_body,
    l.created_at,
    l.is_team_huddle,
    t.case_type,
    t.case_id,
    t.recipient_role
  from latest l
  left join public.team_huddle_case_messages t on t.message_id = l.message_id
  order by l.created_at asc, l.message_id asc;
end;
$$;

revoke all on table public.team_huddle_case_messages from public;
revoke all on table public.team_huddle_case_messages from anon;
revoke all on table public.team_huddle_case_messages from authenticated;
grant select, insert on table public.team_huddle_case_messages to service_role;

revoke all on function public.admin_send_team_huddle_case_message(text, text, uuid, text, text, text) from public;
revoke all on function public.admin_send_team_huddle_case_message(text, text, uuid, text, text, text) from anon;
revoke all on function public.admin_send_team_huddle_case_message(text, text, uuid, text, text, text) from authenticated;
revoke all on function public.admin_send_team_huddle_case_message(text, text, uuid, text, text, text) from service_role;
grant execute on function public.admin_send_team_huddle_case_message(text, text, uuid, text, text, text) to authenticated;
grant execute on function public.admin_send_team_huddle_case_message(text, text, uuid, text, text, text) to service_role;

revoke all on function public.admin_get_team_huddle_correspondence(uuid, integer) from public;
revoke all on function public.admin_get_team_huddle_correspondence(uuid, integer) from anon;
revoke all on function public.admin_get_team_huddle_correspondence(uuid, integer) from authenticated;
revoke all on function public.admin_get_team_huddle_correspondence(uuid, integer) from service_role;
grant execute on function public.admin_get_team_huddle_correspondence(uuid, integer) to authenticated;
grant execute on function public.admin_get_team_huddle_correspondence(uuid, integer) to service_role;

commit;
