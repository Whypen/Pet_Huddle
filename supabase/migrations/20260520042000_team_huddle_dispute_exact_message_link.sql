begin;

do $$
begin
  update public.profiles
  set
    display_name = 'Team huddle',
    social_id = 'teamhuddle',
    non_social = true,
    hide_from_map = true,
    map_visible = false,
    posted_to_threads = false,
    user_role = 'internal_system',
    account_status = 'active',
    updated_at = now()
  where id = '8f55ab31-6b25-4d1a-98c7-3a6e8af2d941'::uuid;
end $$;

create or replace function public.service_dispute_review_copy(
  p_viewer_role text,
  p_is_reporter boolean,
  p_outcome text,
  p_amount text default null
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $function$
declare
  v_role text := lower(trim(coalesce(p_viewer_role, '')));
  v_outcome text := lower(trim(coalesce(p_outcome, '')));
  v_amount text := nullif(trim(coalesce(p_amount, '')), '');
  v_opening text;
  v_body text;
  v_closing text;
  v_closed_note constant text := '*Note: This is an automated case notification. This thread is closed and is no longer monitored.*';
  v_went_against_viewer boolean := false;
begin
  if v_role not in ('owner', 'carer') then
    raise exception 'invalid_viewer_role';
  end if;

  if v_outcome not in ('full_release_to_carer', 'partial_refund', 'full_refund_to_owner') then
    raise exception 'invalid_review_outcome';
  end if;

  v_opening := case
    when coalesce(p_is_reporter, false) then 'We''re sorry this booking didn''t go as planned.'
    else 'The review is complete.'
  end;

  if v_outcome = 'full_release_to_carer' then
    v_body := case
      when v_role = 'owner' then 'After review, the booking payment has been approved for release to the carer.'
      else 'After review, the booking payment has been approved for release to your connected payout account.'
    end;
    v_went_against_viewer := v_role = 'owner';
  elsif v_outcome = 'partial_refund' then
    v_body := case
      when v_role = 'owner' and v_amount is not null then 'A partial refund of ' || v_amount || ' has been issued to your original payment method.'
      when v_role = 'carer' and v_amount is not null then v_amount || ' has been approved for release to your connected payout account.'
      when v_role = 'owner' then 'A partial refund has been issued to your original payment method.'
      else 'A remaining payout has been approved for release to your connected payout account.'
    end;
  else
    v_body := case
      when v_role = 'owner' then 'A full refund has been issued to your original payment method.'
      else 'The booking payment will not be released for this booking.'
    end;
    v_went_against_viewer := v_role = 'carer';
  end if;

  v_closing := case
    when coalesce(p_is_reporter, false) then 'We appreciate your patience while we reviewed this.'
    when v_went_against_viewer then 'We understand this may be disappointing, and appreciate your cooperation.'
    else 'Thank you for your cooperation.'
  end;

  return jsonb_build_object(
    'dialogue_system_status', 'Review completed. This booking is now closed.',
    'push_body', 'Booking review updated. Tap to view the update from Team huddle.',
    'in_app_body', 'Your booking review is ready. Tap to view the update from Team huddle.',
    'team_huddle_message', v_opening || ' ' || v_body || ' ' || v_closing || E'\n\n' || v_closed_note,
    'opening', v_opening,
    'outcome_body', v_body,
    'closing', v_closing,
    'outcome_went_against_viewer', v_went_against_viewer
  );
end;
$function$;

create or replace function public.get_native_chat_dialogue_snapshot(
  p_chat_id uuid,
  p_before_created_at timestamptz default null,
  p_limit int default 50,
  p_target_message_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  authorized as (
    select crm.chat_id
    from public.chat_room_members crm
    join viewer v on v.user_id = crm.user_id
    where crm.chat_id = p_chat_id
      and crm.deleted_at is null
      and crm.left_at is null
    limit 1
  ),
  room_row as (
    select
      c.id,
      c.type,
      c.name,
      c.avatar_url,
      c.created_by,
      c.created_at,
      c.updated_at,
      c.last_message_at,
      c.visibility,
      c.join_method,
      c.room_code,
      c.location_label,
      c.location_country,
      c.pet_focus,
      c.description
    from public.chats c
    join authorized a on a.chat_id = c.id
    where c.deleted_at is null
    limit 1
  ),
  member_rows as (
    select
      crm.chat_id,
      crm.user_id,
      crm.created_at,
      crm.role
    from public.chat_room_members crm
    join authorized a on a.chat_id = crm.chat_id
    where crm.deleted_at is null
      and crm.left_at is null
    order by crm.created_at asc nulls last, crm.user_id
    limit 100
  ),
  target_message as (
    select cm.id, cm.created_at
    from public.chat_messages cm
    join authorized a on a.chat_id = cm.chat_id
    where cm.chat_id = p_chat_id
      and cm.id = p_target_message_id
    limit 1
  ),
  visible_messages as (
    select
      cm.id,
      cm.chat_id,
      cm.sender_id,
      cm.content,
      cm.created_at,
      null::timestamptz as updated_at
    from public.chat_messages cm
    join authorized a on a.chat_id = cm.chat_id
    left join target_message tm on true
    where (
      p_target_message_id is not null
      and tm.id is not null
      and (cm.created_at <= tm.created_at or cm.id = tm.id)
    ) or (
      (p_target_message_id is null or tm.id is null)
      and (p_before_created_at is null or cm.created_at < p_before_created_at)
    )
    order by cm.created_at desc, cm.id desc
    limit greatest(0, least(coalesce(p_limit, 50), 100))
  ),
  ordered_messages as (
    select *
    from visible_messages
    order by created_at asc, id asc
  ),
  read_rows as (
    select distinct
      mr.message_id
    from public.message_reads mr
    join visible_messages vm on vm.id = mr.message_id
    join viewer v on true
    where vm.sender_id = v.user_id
      and mr.user_id <> v.user_id
  )
  select jsonb_build_object(
    'room', (select to_jsonb(r) from room_row r),
    'members', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at asc nulls last, m.user_id) from member_rows m), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at asc, m.id asc) from ordered_messages m), '[]'::jsonb),
    'read_message_ids', coalesce((select jsonb_agg(rr.message_id order by rr.message_id) from read_rows rr), '[]'::jsonb)
  )
  where exists (select 1 from room_row);
$$;

revoke all on function public.get_native_chat_dialogue_snapshot(uuid, timestamptz, int, uuid) from public, anon;
grant execute on function public.get_native_chat_dialogue_snapshot(uuid, timestamptz, int, uuid) to authenticated;
grant execute on function public.get_native_chat_dialogue_snapshot(uuid, timestamptz, int, uuid) to service_role;

create or replace function public.ensure_team_huddle_direct_message(
  p_case_id text,
  p_recipient_user_id uuid,
  p_recipient_role text,
  p_message_body text,
  p_idempotency_key text,
  p_notification_body text,
  p_push_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_team_huddle_user_id constant uuid := '8f55ab31-6b25-4d1a-98c7-3a6e8af2d941';
  v_chat_id uuid;
  v_message_id uuid;
  v_notification_id text;
  v_notification_href text;
begin
  if p_recipient_user_id is null then
    raise exception 'recipient_required';
  end if;

  select t.message_id
  into v_message_id
  from public.team_huddle_case_messages t
  where t.idempotency_key = p_idempotency_key
  limit 1;

  if v_message_id is not null then
    return v_message_id;
  end if;

  select c.id
  into v_chat_id
  from public.chats c
  where lower(coalesce(c.type, '')) = 'direct'
    and exists (select 1 from public.chat_room_members crm where crm.chat_id = c.id and crm.user_id = v_team_huddle_user_id)
    and exists (select 1 from public.chat_room_members crm where crm.chat_id = c.id and crm.user_id = p_recipient_user_id)
    and (select count(*) from public.chat_room_members crm where crm.chat_id = c.id) = 2
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

  insert into public.direct_chat_pairs (user_low, user_high, chat_id)
  values (
    least(v_team_huddle_user_id, p_recipient_user_id),
    greatest(v_team_huddle_user_id, p_recipient_user_id),
    v_chat_id
  )
  on conflict do nothing;

  insert into public.chat_messages (chat_id, sender_id, content, created_at)
  values (v_chat_id, v_team_huddle_user_id, p_message_body, now())
  returning id into v_message_id;

  update public.chats
  set last_message_at = now(),
      updated_at = now()
  where id = v_chat_id;

  v_notification_href := '/chat-dialogue?room=' || v_chat_id::text
    || '&with=' || v_team_huddle_user_id::text
    || '&targetMessage=' || v_message_id::text
    || '&message_id=' || v_message_id::text;

  select public.enqueue_notification(
    p_user_id := p_recipient_user_id,
    p_category := 'chats',
    p_kind := 'service_dispute_review_ready',
    p_title := 'Team huddle',
    p_body := p_notification_body,
    p_href := v_notification_href,
    p_data := jsonb_build_object(
      'room_id', v_chat_id,
      'chat_id', v_chat_id,
      'with_user_id', v_team_huddle_user_id,
      'targetMessage', v_message_id,
      'message_id', v_message_id,
      'team_huddle_idempotency_key', p_idempotency_key,
      'case_type', 'dispute',
      'case_id', p_case_id,
      'recipient_role', p_recipient_role,
      'pushTitle', 'Team huddle',
      'pushBody', p_push_body
    )
  ) into v_notification_id;

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
    p_idempotency_key,
    'dispute',
    p_case_id,
    p_recipient_user_id,
    p_recipient_role,
    v_team_huddle_user_id,
    v_chat_id,
    v_message_id,
    v_notification_id,
    v_notification_href,
    p_message_body,
    v_team_huddle_user_id
  );

  return v_message_id;
end;
$function$;

revoke all on function public.ensure_team_huddle_direct_message(text, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.ensure_team_huddle_direct_message(text, uuid, text, text, text, text, text) to authenticated, service_role;

do $$
declare
  v_team_huddle_user_id constant uuid := '8f55ab31-6b25-4d1a-98c7-3a6e8af2d941';
  v_closed_note constant text := '*Note: This is an automated case notification. This thread is closed and is no longer monitored.*';
begin
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
        and crm.deleted_at is null
        and crm.left_at is null
    ) = 2
  on conflict do nothing;

  update public.chat_messages cm
  set content = cm.content || E'\n\n' || v_closed_note
  from public.team_huddle_case_messages th
  where th.message_id = cm.id
    and th.idempotency_key like 'service-dispute-review:%'
    and cm.content not like '%' || v_closed_note || '%';

  update public.team_huddle_case_messages th
  set
    message_body = th.message_body || E'\n\n' || v_closed_note,
    notification_href = '/chat-dialogue?room=' || th.chat_id::text
      || '&with=' || v_team_huddle_user_id::text
      || '&targetMessage=' || th.message_id::text
      || '&message_id=' || th.message_id::text
  where th.idempotency_key like 'service-dispute-review:%'
    and th.message_body not like '%' || v_closed_note || '%';

  update public.team_huddle_case_messages th
  set notification_href = '/chat-dialogue?room=' || th.chat_id::text
    || '&with=' || v_team_huddle_user_id::text
    || '&targetMessage=' || th.message_id::text
    || '&message_id=' || th.message_id::text
  where th.idempotency_key like 'service-dispute-review:%'
    and coalesce(th.notification_href, '') not like '%targetMessage=%';

  update public.notifications n
  set
    title = 'Team huddle',
    href = th.notification_href,
    data = coalesce(n.data, '{}'::jsonb)
      || jsonb_build_object(
        'href', th.notification_href,
        'room_id', th.chat_id,
        'chat_id', th.chat_id,
        'with_user_id', v_team_huddle_user_id,
        'targetMessage', th.message_id,
        'message_id', th.message_id,
        'pushTitle', 'Team huddle'
      )
  from public.team_huddle_case_messages th
  where n.id::text = th.notification_id
    and th.idempotency_key like 'service-dispute-review:%';
end $$;

commit;
