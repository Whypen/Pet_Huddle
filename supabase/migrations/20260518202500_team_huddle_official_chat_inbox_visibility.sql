-- Make official Team Huddle case-message rooms visible/openable in the normal
-- friends inbox without exposing the internal identity to discovery/social.

do $$
declare
  v_team_huddle_user_id constant uuid := '8f55ab31-6b25-4d1a-98c7-3a6e8af2d941';
  v_logo_url constant text := 'https://huddle.pet/huddle-logo.jpg';
begin
  update public.profiles
  set
    display_name = 'Team Huddle',
    social_id = 'teamhuddle',
    avatar_url = v_logo_url,
    non_social = true,
    hide_from_map = true,
    map_visible = false,
    posted_to_threads = false,
    user_role = 'internal_system',
    is_admin = false,
    account_status = 'active',
    updated_at = now()
  where id = v_team_huddle_user_id;

  insert into public.direct_chat_pairs (user_low, user_high, chat_id)
  select
    least(v_team_huddle_user_id, peer.user_id),
    greatest(v_team_huddle_user_id, peer.user_id),
    c.id
  from public.chats c
  join public.chat_room_members team_member
    on team_member.chat_id = c.id
   and team_member.user_id = v_team_huddle_user_id
  join public.chat_room_members peer
    on peer.chat_id = c.id
   and peer.user_id <> v_team_huddle_user_id
  where lower(coalesce(c.type, '')) = 'direct'
    and (
      select count(*)
      from public.chat_room_members crm
      where crm.chat_id = c.id
    ) = 2
  on conflict do nothing;
end $$;

create or replace function public.check_native_direct_relationship(p_target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  relationship as (
    select
      exists (
        select 1
        from public.user_blocks ub
        join viewer v on true
        where (ub.blocker_id = v.user_id and ub.blocked_id = p_target_user_id)
           or (ub.blocker_id = p_target_user_id and ub.blocked_id = v.user_id)
      ) as blocked,
      exists (
        select 1
        from public.user_unmatches uu
        join viewer v on true
        where (uu.actor_id = v.user_id and uu.target_id = p_target_user_id)
           or (uu.actor_id = p_target_user_id and uu.target_id = v.user_id)
      ) as unmatched,
      p_target_user_id = '8f55ab31-6b25-4d1a-98c7-3a6e8af2d941'::uuid as target_is_team_huddle
  )
  select jsonb_build_object(
    'allowed', (select user_id from viewer) is not null
      and p_target_user_id is not null
      and p_target_user_id <> (select user_id from viewer)
      and not blocked
      and (target_is_team_huddle or not unmatched),
    'blocked', blocked,
    'unmatched', case when target_is_team_huddle then false else unmatched end
  )
  from relationship;
$$;

revoke all on function public.check_native_direct_relationship(uuid) from public, anon;
grant execute on function public.check_native_direct_relationship(uuid) to authenticated;

do $$
declare
  v_function_oid oid;
  v_function_def text;
  v_previous_profile_gate text := 'and coalesce(p.non_social, false) = false
            and coalesce(p.account_status::text, ''active'') = ''active''';
  v_next_profile_gate text := 'and (
              coalesce(p.non_social, false) = false
              or p.id = ''8f55ab31-6b25-4d1a-98c7-3a6e8af2d941''::uuid
            )
            and coalesce(p.account_status::text, ''active'') = ''active''';
begin
  select p.oid
  into v_function_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_chat_inbox_summaries'
    and pg_get_function_identity_arguments(p.oid) = 'p_scope text, p_chat_ids uuid[], p_only_with_activity boolean, p_limit integer, p_cursor timestamp with time zone';

  if v_function_oid is null then
    raise exception 'get_chat_inbox_summaries_signature_missing';
  end if;

  v_function_def := pg_get_functiondef(v_function_oid);

  if position(v_next_profile_gate in v_function_def) = 0 then
    if position(v_previous_profile_gate in v_function_def) = 0 then
      raise exception 'get_chat_inbox_summaries_direct_profile_gate_changed';
    end if;
    v_function_def := replace(v_function_def, v_previous_profile_gate, v_next_profile_gate);
  end if;

  execute v_function_def;
end $$;

do $$
declare
  v_function_oid oid;
  v_function_def text;
  v_previous_member_insert text := 'insert into public.chat_room_members (chat_id, user_id, created_at)
    values
      (v_chat_id, v_team_huddle_user_id, now()),
      (v_chat_id, p_recipient_user_id, now())
    on conflict do nothing;';
  v_next_member_insert text := 'insert into public.chat_room_members (chat_id, user_id, created_at)
    values
      (v_chat_id, v_team_huddle_user_id, now()),
      (v_chat_id, p_recipient_user_id, now())
    on conflict do nothing;

    insert into public.direct_chat_pairs (user_low, user_high, chat_id)
    values (
      least(v_team_huddle_user_id, p_recipient_user_id),
      greatest(v_team_huddle_user_id, p_recipient_user_id),
      v_chat_id
    )
    on conflict do nothing;';
begin
  select p.oid
  into v_function_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_send_team_huddle_case_message'
    and pg_get_function_identity_arguments(p.oid) = 'p_case_type text, p_case_id text, p_recipient_user_id uuid, p_recipient_role text, p_message_body text, p_idempotency_key text';

  if v_function_oid is null then
    raise exception 'admin_send_team_huddle_case_message_signature_missing';
  end if;

  v_function_def := pg_get_functiondef(v_function_oid);

  if position('insert into public.direct_chat_pairs (user_low, user_high, chat_id)' in v_function_def) = 0 then
    if position(v_previous_member_insert in v_function_def) = 0 then
      raise exception 'admin_send_team_huddle_case_message_member_insert_changed';
    end if;
    v_function_def := replace(v_function_def, v_previous_member_insert, v_next_member_insert);
  end if;

  execute v_function_def;
end $$;

revoke all on function public.admin_send_team_huddle_case_message(text, text, uuid, text, text, text) from public, anon;
grant execute on function public.admin_send_team_huddle_case_message(text, text, uuid, text, text, text) to authenticated, service_role;
