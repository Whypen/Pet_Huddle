-- Treat user replies in official Team Huddle case threads as case evidence,
-- and allow allowlisted/admin console users to read private chat evidence.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'chat_attachments_select_admins'
  ) then
    create policy chat_attachments_select_admins
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'chat_attachments'
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and (
              coalesce(p.is_admin, false) = true
              or lower(coalesce(p.user_role, '')) = 'admin'
            )
        )
      );
  end if;
end $$;

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

  select (
    coalesce(p.is_admin, false) = true
    or lower(coalesce(p.user_role, '')) = 'admin'
  )
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
    coalesce(t.case_type, inherited.case_type),
    coalesce(t.case_id, inherited.case_id),
    coalesce(t.recipient_role, inherited.recipient_role)
  from latest l
  left join public.team_huddle_case_messages t on t.message_id = l.message_id
  left join lateral (
    select
      prior_t.case_type,
      prior_t.case_id,
      prior_t.recipient_role
    from public.chat_messages prior_m
    join public.team_huddle_case_messages prior_t on prior_t.message_id = prior_m.id
    where prior_m.chat_id = l.chat_id
      and prior_m.sender_id = v_team_huddle_user_id
      and prior_m.created_at <= l.created_at
    order by prior_m.created_at desc, prior_m.id desc
    limit 1
  ) inherited on l.sender_user_id <> v_team_huddle_user_id
  order by l.created_at asc, l.message_id asc;
end;
$$;

revoke all on function public.admin_get_team_huddle_correspondence(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_get_team_huddle_correspondence(uuid, integer) to authenticated, service_role;
