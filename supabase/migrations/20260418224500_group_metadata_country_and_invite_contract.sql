create or replace function public.normalize_country_key(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v_norm text := lower(btrim(coalesce(p_value, '')));
begin
  return case v_norm
    when '' then null
    when 'hk' then 'hong kong'
    when 'hong kong sar' then 'hong kong'
    when 'hong kong s.a.r.' then 'hong kong'
    when 'us' then 'united states'
    when 'usa' then 'united states'
    when 'u.s.a.' then 'united states'
    when 'united states of america' then 'united states'
    when 'uk' then 'united kingdom'
    when 'u.k.' then 'united kingdom'
    else v_norm
  end;
end;
$$;

create or replace function public.extract_country_from_location_label(p_label text)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[];
  v_last text;
begin
  if nullif(btrim(coalesce(p_label, '')), '') is null then
    return null;
  end if;

  v_parts := regexp_split_to_array(p_label, '\s*,\s*');
  if v_parts is null or array_length(v_parts, 1) is null then
    return null;
  end if;

  v_last := nullif(btrim(v_parts[array_length(v_parts, 1)]), '');
  return public.normalize_country_key(v_last);
end;
$$;

create or replace function public.resolve_group_country_for_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_location_name text;
  v_live_country text;
  v_profile_country text;
  v_profile_location_name text;
  v_profile_pinned_until timestamptz;
  v_pin_country text;
begin
  if p_user_id is null then
    return null;
  end if;

  select
    ul.location_name,
    public.normalize_country_key(ul.location_country)
    into v_live_location_name, v_live_country
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
    v_live_country,
    public.extract_country_from_location_label(v_live_location_name),
    v_pin_country,
    v_profile_country,
    public.extract_country_from_location_label(v_profile_location_name)
  );
end;
$$;

create or replace function public.sync_group_location_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'group' then
    new.location_country := coalesce(
      public.extract_country_from_location_label(new.location_label),
      public.normalize_country_key(new.location_country),
      public.resolve_group_country_for_user(new.created_by)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_group_location_country on public.chats;
create trigger trg_sync_group_location_country
before insert or update of type, created_by, location_label, location_country
on public.chats
for each row
execute function public.sync_group_location_country();

update public.chats c
set location_country = coalesce(
  public.extract_country_from_location_label(c.location_label),
  public.normalize_country_key(c.location_country),
  public.resolve_group_country_for_user(c.created_by)
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
    coalesce(
      public.extract_country_from_location_label(c.location_label),
      public.normalize_country_key(c.location_country),
      public.resolve_group_country_for_user(c.created_by)
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
  cross join viewer v
  where c.type = 'group'
    and c.visibility = 'public'
    and v.country_key is not null
    and coalesce(
      public.extract_country_from_location_label(c.location_label),
      public.normalize_country_key(c.location_country),
      public.resolve_group_country_for_user(c.created_by)
    ) = v.country_key
    and not exists (
      select 1
      from public.chat_room_members crm
      where crm.chat_id = c.id
        and crm.user_id = p_user_id
    )
  order by coalesce(c.last_message_at, c.created_at) desc, c.created_at desc;
$$;

create or replace function public.update_group_chat_metadata(
  p_chat_id uuid,
  p_avatar_url text default null,
  p_description text default null,
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
    from public.chat_participants cp
    where cp.chat_id = p_chat_id
      and cp.user_id = auth.uid()
      and cp.role = 'admin'
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
    avatar_url = case
      when p_update_avatar then nullif(btrim(coalesce(p_avatar_url, '')), '')
      else c.avatar_url
    end,
    description = case
      when p_update_description then nullif(btrim(coalesce(p_description, '')), '')
      else c.description
    end
  where c.id = p_chat_id
    and c.type = 'group'
  returning c.* into v_chat;

  if not found then
    raise exception 'group_not_found';
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

grant execute on function public.update_group_chat_metadata(uuid, text, text, boolean, boolean) to authenticated;
