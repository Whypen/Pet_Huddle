drop function if exists public.get_public_group_preview_members(uuid);

create or replace function public.get_public_group_preview_members(
  p_chat_id uuid
)
returns table(
  user_id uuid,
  display_name text,
  avatar_url text,
  role text,
  is_verified boolean,
  verification_status text
)
language sql
security definer
set search_path = public
as $$
  select
    crm.user_id,
    pp.display_name,
    pp.avatar_url,
    case
      when c.created_by = crm.user_id then 'admin'
      else coalesce(cp.role, 'member')
    end as role,
    coalesce(p.is_verified, pp.is_verified, false) as is_verified,
    p.verification_status::text as verification_status
  from public.chats c
  join public.chat_room_members crm on crm.chat_id = c.id
  left join public.chat_participants cp on cp.chat_id = c.id and cp.user_id = crm.user_id
  left join public.profiles_public pp on pp.id = crm.user_id
  left join public.profiles p on p.id = crm.user_id
  where c.id = p_chat_id
    and c.type = 'group'
    and (
      c.visibility = 'public'
      or exists (
        select 1
        from public.chat_room_members viewer_member
        where viewer_member.chat_id = c.id
          and viewer_member.user_id = auth.uid()
      )
    )
  order by case when c.created_by = crm.user_id then 0 when cp.role in ('admin', 'creator') then 1 else 2 end, crm.created_at asc
  limit 100;
$$;

grant execute on function public.get_public_group_preview_members(uuid) to authenticated;

drop function if exists public.get_native_group_members(uuid);

create or replace function public.get_native_group_members(p_chat_id uuid)
returns table(user_id uuid, role text, display_name text, avatar_url text, is_verified boolean, verification_status text)
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
         pp.display_name,
         pp.avatar_url,
         coalesce(p.is_verified, pp.is_verified, false) as is_verified,
         p.verification_status::text as verification_status
  from public.chat_room_members crm
  join public.chats c on c.id = crm.chat_id
  left join public.chat_participants cp
    on cp.chat_id = crm.chat_id
   and cp.user_id = crm.user_id
  left join public.profiles_public pp on pp.id = crm.user_id
  left join public.profiles p on p.id = crm.user_id
  where crm.chat_id = p_chat_id
    and exists (
      select 1
      from public.chat_room_members viewer
      where viewer.chat_id = p_chat_id
        and viewer.user_id = auth.uid()
    )
  order by case when c.created_by = crm.user_id then 0 when cp.role in ('admin', 'creator') then 1 else 2 end, crm.created_at asc
$$;

grant execute on function public.get_native_group_members(uuid) to authenticated;
