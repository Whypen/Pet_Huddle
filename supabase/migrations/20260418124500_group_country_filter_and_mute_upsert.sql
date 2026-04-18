create or replace function public.get_public_groups_for_country(
  p_user_id uuid,
  p_country text
)
returns table(
  id uuid,
  name text,
  avatar_url text,
  location_label text,
  location_country text,
  pet_focus text[],
  join_method text,
  last_message_at timestamptz,
  created_at timestamptz,
  description text,
  member_count bigint,
  created_by uuid
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.avatar_url,
    c.location_label,
    coalesce(
      nullif(btrim(public.resolve_group_country_for_user(c.created_by)), ''),
      nullif(btrim(c.location_country), '')
    ) as location_country,
    c.pet_focus,
    c.join_method,
    c.last_message_at,
    c.created_at,
    c.description,
    (
      select count(*)
      from public.chat_room_members crm
      where crm.chat_id = c.id
    ) as member_count,
    c.created_by
  from public.chats c
  where c.type = 'group'
    and c.visibility = 'public'
    and lower(
      btrim(
        coalesce(
          nullif(btrim(public.resolve_group_country_for_user(c.created_by)), ''),
          nullif(btrim(c.location_country), ''),
          ''
        )
      )
    ) = lower(btrim(coalesce(p_country, '')))
    and not exists (
      select 1
      from public.chat_room_members crm
      where crm.chat_id = c.id
        and crm.user_id = p_user_id
    )
  order by coalesce(c.last_message_at, c.created_at) desc, c.created_at desc;
$$;

grant execute on function public.get_public_groups_for_country(uuid, text) to authenticated;

create or replace function public.set_group_mute_state(
  p_chat_id uuid,
  p_muted boolean
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

  if not exists (
    select 1
    from public.chat_room_members crm
    where crm.chat_id = p_chat_id
      and crm.user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  insert into public.chat_participants (chat_id, user_id, role, is_muted)
  values (p_chat_id, auth.uid(), 'member', coalesce(p_muted, false))
  on conflict on constraint chat_participants_chat_id_user_id_key
  do update
    set is_muted = excluded.is_muted;

  return true;
end;
$$;

grant execute on function public.set_group_mute_state(uuid, boolean) to authenticated;
