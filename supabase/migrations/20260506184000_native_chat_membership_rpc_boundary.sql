create or replace function public.is_native_group_admin(p_chat_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chats c
    where c.id = p_chat_id
      and c.created_by = p_user_id
  )
  or exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = p_chat_id
      and cp.user_id = p_user_id
      and coalesce(cp.role, 'member') = 'admin'
  )
$$;

grant execute on function public.is_native_group_admin(uuid, uuid) to authenticated;

create or replace function public.join_native_group_member(
  p_chat_id uuid,
  p_user_id uuid default auth.uid(),
  p_role text default 'member'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
  v_role text := case when lower(coalesce(p_role, 'member')) = 'admin' then 'admin' else 'member' end;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id, type, visibility, join_method, created_by
    into v_room
  from public.chats
  where id = p_chat_id;

  if not found or v_room.type <> 'group' then
    raise exception 'Group not found';
  end if;

  if p_user_id <> auth.uid()
    and not public.is_native_group_admin(p_chat_id, auth.uid()) then
    raise exception 'Not authorized';
  end if;

  if p_user_id = auth.uid()
    and v_room.created_by <> auth.uid()
    and coalesce(v_room.visibility, 'private') <> 'public'
    and coalesce(v_room.join_method, 'request') <> 'instant' then
    raise exception 'Not authorized';
  end if;

  insert into public.chat_room_members (chat_id, user_id)
  values (p_chat_id, p_user_id)
  on conflict (chat_id, user_id) do nothing;

  insert into public.chat_participants (chat_id, user_id, role)
  values (p_chat_id, p_user_id, v_role)
  on conflict on constraint chat_participants_chat_id_user_id_key
  do update set role = excluded.role;

  return true;
end;
$$;

grant execute on function public.join_native_group_member(uuid, uuid, text) to authenticated;

create or replace function public.remove_native_group_member(
  p_chat_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id <> auth.uid()
    and not public.is_native_group_admin(p_chat_id, auth.uid()) then
    raise exception 'Not authorized';
  end if;

  delete from public.chat_room_members
  where chat_id = p_chat_id
    and user_id = p_user_id;

  delete from public.chat_participants
  where chat_id = p_chat_id
    and user_id = p_user_id;

  return true;
end;
$$;

grant execute on function public.remove_native_group_member(uuid, uuid) to authenticated;

create or replace function public.get_native_group_member_state(p_chat_id uuid)
returns table(is_muted boolean, role text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cp.is_muted, false) as is_muted,
         case
           when c.created_by = auth.uid() then 'admin'
           else coalesce(cp.role, 'member')
         end as role
  from public.chat_room_members crm
  join public.chats c on c.id = crm.chat_id
  left join public.chat_participants cp
    on cp.chat_id = crm.chat_id
   and cp.user_id = crm.user_id
  where crm.chat_id = p_chat_id
    and crm.user_id = auth.uid()
  limit 1
$$;

grant execute on function public.get_native_group_member_state(uuid) to authenticated;

create or replace function public.get_native_group_members(p_chat_id uuid)
returns table(user_id uuid, role text, display_name text, avatar_url text, is_verified boolean)
language sql
stable
security definer
set search_path = public
as $$
  select crm.user_id,
         case
           when c.created_by = crm.user_id then 'admin'
           else coalesce(cp.role, 'member')
         end as role,
         p.display_name,
         p.avatar_url,
         coalesce(p.is_verified, false) as is_verified
  from public.chat_room_members crm
  join public.chats c on c.id = crm.chat_id
  left join public.chat_participants cp
    on cp.chat_id = crm.chat_id
   and cp.user_id = crm.user_id
  left join public.profiles p on p.id = crm.user_id
  where crm.chat_id = p_chat_id
    and exists (
      select 1
      from public.chat_room_members viewer
      where viewer.chat_id = p_chat_id
        and viewer.user_id = auth.uid()
    )
  order by case when c.created_by = crm.user_id then 0 else 1 end, crm.created_at asc
$$;

grant execute on function public.get_native_group_members(uuid) to authenticated;
