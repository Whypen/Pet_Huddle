create or replace function public.resolve_group_country_for_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_location_name text;
  v_profile_country text;
  v_profile_location_name text;
  v_profile_pinned_until timestamptz;
  v_pin_country text;
begin
  if p_user_id is null then
    return null;
  end if;

  select
    ul.location_name
    into v_live_location_name
  from public.user_locations ul
  where ul.user_id = p_user_id
    and (ul.expires_at is null or ul.expires_at > now())
  order by ul.updated_at desc
  limit 1;

  select
    public.normalize_country_key(p.location_country),
    nullif(btrim(p.location_name), ''),
    p.location_pinned_until
    into v_profile_country, v_profile_location_name, v_profile_pinned_until
  from public.profiles p
  where p.id = p_user_id;

  if v_profile_pinned_until is not null and v_profile_pinned_until > now() then
    v_pin_country := coalesce(v_profile_country, public.extract_country_from_location_label(v_profile_location_name));
  else
    v_pin_country := null;
  end if;

  return coalesce(
    public.extract_country_from_location_label(v_live_location_name),
    v_pin_country,
    v_profile_country,
    public.extract_country_from_location_label(v_profile_location_name)
  );
end;
$$;

create or replace function public.resolve_group_country_for_chat(
  p_created_by uuid,
  p_location_country text,
  p_location_label text
)
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(
    public.resolve_group_country_for_user(p_created_by),
    public.normalize_country_key(p_location_country),
    public.extract_country_from_location_label(p_location_label)
  );
$$;

create or replace function public.sync_group_location_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'group' then
    new.location_country := public.resolve_group_country_for_chat(
      new.created_by,
      new.location_country,
      new.location_label
    );
  end if;
  return new;
end;
$$;

update public.chats c
set location_country = public.resolve_group_country_for_chat(
  c.created_by,
  c.location_country,
  c.location_label
)
where c.type = 'group';

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
  with viewer as (
    select public.normalize_country_key(p_country) as country_key
  )
  select
    c.id,
    c.name,
    c.avatar_url,
    c.location_label,
    public.resolve_group_country_for_chat(c.created_by, c.location_country, c.location_label) as location_country,
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
  cross join viewer v
  where c.type = 'group'
    and c.visibility = 'public'
    and v.country_key is not null
    and public.resolve_group_country_for_chat(c.created_by, c.location_country, c.location_label) = v.country_key
    and not exists (
      select 1
      from public.chat_room_members crm
      where crm.chat_id = c.id
        and crm.user_id = p_user_id
    )
  order by coalesce(c.last_message_at, c.created_at) desc, c.created_at desc;
$$;

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
    public.resolve_group_country_for_chat(c.created_by, c.location_country, c.location_label) as location_country,
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

create or replace function public.join_private_group_by_code(
  p_code text
)
returns table(
  chat_id uuid,
  chat_name text,
  room_code text,
  joined boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  v_chat public.chats%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_code !~ '^[A-Z0-9]{6}$' then
    return query select null::uuid, null::text, v_code, false, 'invalid_code'::text;
    return;
  end if;

  select c.*
    into v_chat
  from public.chats c
  where c.type = 'group'
    and c.visibility = 'private'
    and c.room_code = v_code
  limit 1;

  if not found then
    return query select null::uuid, null::text, v_code, false, 'invalid_code'::text;
    return;
  end if;

  insert into public.chat_room_members (chat_id, user_id)
  values (v_chat.id, auth.uid())
  on conflict (chat_id, user_id) do nothing;

  insert into public.chat_participants (chat_id, user_id, role)
  values (v_chat.id, auth.uid(), 'member')
  on conflict on constraint chat_participants_chat_id_user_id_key do nothing;

  return query select v_chat.id, v_chat.name, v_chat.room_code, true, null::text;
end;
$$;
