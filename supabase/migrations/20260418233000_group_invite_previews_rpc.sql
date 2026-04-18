create or replace function public.get_group_invite_previews(
  p_user_id uuid
)
returns table(
  invite_id uuid,
  chat_id uuid,
  chat_name text,
  inviter_name text,
  created_at timestamptz,
  avatar_url text,
  location_label text,
  location_country text,
  pet_focus text[],
  join_method text,
  last_message_at timestamptz,
  description text,
  member_count bigint,
  created_by uuid,
  visibility text,
  room_code text
)
language sql
security definer
set search_path = public
as $$
  select
    inv.id as invite_id,
    c.id as chat_id,
    coalesce(inv.chat_name, c.name) as chat_name,
    coalesce(p.display_name, 'Someone') as inviter_name,
    inv.created_at,
    c.avatar_url,
    c.location_label,
    coalesce(
      public.extract_country_from_location_label(c.location_label),
      public.normalize_country_key(c.location_country),
      public.resolve_group_country_for_user(c.created_by)
    ) as location_country,
    c.pet_focus,
    c.join_method,
    c.last_message_at,
    c.description,
    (
      select count(*)
      from public.chat_room_members crm
      where crm.chat_id = c.id
    ) as member_count,
    c.created_by,
    c.visibility,
    c.room_code
  from public.group_chat_invites inv
  join public.chats c on c.id = inv.chat_id
  left join public.profiles p on p.id = inv.inviter_user_id
  where inv.invitee_user_id = p_user_id
    and inv.status = 'pending'
    and c.type = 'group'
    and not exists (
      select 1
      from public.chat_room_members crm
      where crm.chat_id = c.id
        and crm.user_id = p_user_id
    )
  order by inv.created_at desc;
$$;

grant execute on function public.get_group_invite_previews(uuid) to authenticated;
