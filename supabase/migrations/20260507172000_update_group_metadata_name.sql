create or replace function public.update_group_chat_metadata(
  p_chat_id uuid,
  p_name text default null,
  p_avatar_url text default null,
  p_description text default null,
  p_update_name boolean default false,
  p_update_avatar boolean default false,
  p_update_description boolean default false
)
returns table(
  id uuid,
  name text,
  avatar_url text,
  description text,
  location_label text,
  location_country text,
  pet_focus text[],
  join_method text,
  visibility text,
  room_code text,
  created_at timestamptz,
  last_message_at timestamptz,
  created_by uuid,
  member_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat public.chats%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.chat_room_members crm
    where crm.chat_id = p_chat_id
      and crm.user_id = auth.uid()
      and crm.role = 'admin'
  ) and not exists (
    select 1
    from public.chats c
    where c.id = p_chat_id
      and c.type = 'group'
      and c.created_by = auth.uid()
  ) then
    raise exception 'not_authorized';
  end if;

  update public.chats c
  set
    name = case
      when p_update_name then nullif(btrim(coalesce(p_name, '')), '')
      else c.name
    end,
    avatar_url = case
      when p_update_avatar then nullif(btrim(coalesce(p_avatar_url, '')), '')
      else c.avatar_url
    end,
    description = case
      when p_update_description then nullif(btrim(coalesce(p_description, '')), '')
      else c.description
    end,
    updated_at = now()
  where c.id = p_chat_id
    and c.type = 'group'
  returning c.* into v_chat;

  if not found then
    raise exception 'group_not_found';
  end if;

  if p_update_name and v_chat.name is null then
    raise exception 'group_name_required';
  end if;

  return query
  select
    v_chat.id,
    v_chat.name,
    v_chat.avatar_url,
    v_chat.description,
    v_chat.location_label,
    v_chat.location_country,
    v_chat.pet_focus,
    v_chat.join_method,
    v_chat.visibility,
    v_chat.room_code,
    v_chat.created_at,
    v_chat.last_message_at,
    v_chat.created_by,
    (
      select count(*)
      from public.chat_room_members crm
      where crm.chat_id = v_chat.id
    ) as member_count;
end;
$$;

grant execute on function public.update_group_chat_metadata(uuid, text, text, text, boolean, boolean, boolean) to authenticated;
