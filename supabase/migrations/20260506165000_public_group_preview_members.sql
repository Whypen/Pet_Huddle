create or replace function public.get_public_group_preview_members(
  p_chat_id uuid
)
returns table(
  user_id uuid,
  display_name text,
  avatar_url text,
  role text,
  is_verified boolean
)
language sql
security definer
set search_path = public
as $$
  select
    crm.user_id,
    p.display_name,
    p.avatar_url,
    case
      when c.created_by = crm.user_id then 'admin'
      else coalesce(cp.role, 'member')
    end as role,
    coalesce(p.is_verified, false) as is_verified
  from public.chats c
  join public.chat_room_members crm on crm.chat_id = c.id
  left join public.chat_participants cp on cp.chat_id = c.id and cp.user_id = crm.user_id
  left join public.profiles_public p on p.id = crm.user_id
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
  order by case when c.created_by = crm.user_id or cp.role in ('admin', 'creator') then 0 else 1 end, crm.created_at asc
  limit 100;
$$;

grant execute on function public.get_public_group_preview_members(uuid) to authenticated;
