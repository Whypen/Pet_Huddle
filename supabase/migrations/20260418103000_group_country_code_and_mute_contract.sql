alter table public.chats
  add column if not exists location_country text;

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
  return v_last;
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
  v_profile_country text;
  v_profile_location_name text;
  v_profile_pinned_until timestamptz;
  v_live_country text;
  v_pin_country text;
begin
  if p_user_id is null then
    return null;
  end if;

  select ul.location_name
    into v_live_location_name
  from public.user_locations ul
  where ul.user_id = p_user_id
    and (ul.expires_at is null or ul.expires_at > now())
  order by ul.updated_at desc
  limit 1;

  select
    nullif(btrim(p.location_country), ''),
    nullif(btrim(p.location_name), ''),
    p.location_pinned_until
    into v_profile_country, v_profile_location_name, v_profile_pinned_until
  from public.profiles p
  where p.id = p_user_id;

  v_live_country := public.extract_country_from_location_label(v_live_location_name);
  if v_profile_pinned_until is not null and v_profile_pinned_until > now() then
    v_pin_country := coalesce(v_profile_country, public.extract_country_from_location_label(v_profile_location_name));
  else
    v_pin_country := null;
  end if;

  return coalesce(
    v_live_country,
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
    new.location_country := public.resolve_group_country_for_user(new.created_by);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_group_location_country on public.chats;
create trigger trg_sync_group_location_country
before insert or update of type, created_by
on public.chats
for each row
execute function public.sync_group_location_country();

update public.chats c
set location_country = public.resolve_group_country_for_user(c.created_by)
where c.type = 'group'
  and (
    c.location_country is null
    or btrim(c.location_country) = ''
  );

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
    c.location_country,
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
    and nullif(btrim(c.location_country), '') is not null
    and lower(btrim(c.location_country)) = lower(btrim(coalesce(p_country, '')))
    and not exists (
      select 1
      from public.chat_room_members crm
      where crm.chat_id = c.id
        and crm.user_id = p_user_id
    )
  order by coalesce(c.last_message_at, c.created_at) desc, c.created_at desc;
$$;

grant execute on function public.get_public_groups_for_country(uuid, text) to authenticated;

create or replace function public.get_private_group_by_code(
  p_code text
)
returns table(
  chat_id uuid,
  chat_name text,
  room_code text,
  description text,
  pet_focus text[],
  location_label text,
  member_count bigint
)
language sql
security definer
set search_path = public
as $$
  with normalized as (
    select upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')) as code
  )
  select
    c.id,
    c.name,
    c.room_code,
    c.description,
    c.pet_focus,
    c.location_label,
    (
      select count(*)
      from public.chat_room_members crm
      where crm.chat_id = c.id
    ) as member_count
  from public.chats c
  cross join normalized n
  where c.type = 'group'
    and c.visibility = 'private'
    and c.room_code = n.code
  limit 1;
$$;

grant execute on function public.get_private_group_by_code(text) to authenticated;

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

  select *
    into v_chat
  from public.chats
  where type = 'group'
    and visibility = 'private'
    and room_code = v_code
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

grant execute on function public.join_private_group_by_code(text) to authenticated;

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

  update public.chat_participants
  set is_muted = coalesce(p_muted, false)
  where chat_id = p_chat_id
    and user_id = auth.uid();

  return true;
end;
$$;

grant execute on function public.set_group_mute_state(uuid, boolean) to authenticated;

create or replace function public.notify_new_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat_type text;
  v_chat_name text;
  v_sender_name text;
  v_content_obj jsonb;
  v_preview text;
  v_title text;
  v_body text;
  v_kind text;
  v_recipient record;
  v_href text;
begin
  select type, name into v_chat_type, v_chat_name
  from public.chats
  where id = new.chat_id;

  if not found then return new; end if;
  if v_chat_type = 'service' then return new; end if;

  select coalesce(display_name, 'Someone') into v_sender_name
  from public.profiles
  where id = new.sender_id;

  v_href := '/chat-dialogue?room=' || new.chat_id;

  begin
    v_content_obj := new.content::jsonb;
  exception when others then
    v_content_obj := null;
  end;

  if v_content_obj is not null and v_content_obj->>'kind' = 'video' then
    v_kind := 'video_received';
    v_preview := v_sender_name || ' sent you a video';
  elsif v_content_obj is not null
    and (v_content_obj->>'kind' in ('image', 'photo', 'media')
         or v_content_obj ? 'mediaUrl'
         or v_content_obj ? 'imageUrl') then
    v_kind := 'photo_received';
    v_preview := v_sender_name || ' sent you a photo';
  else
    v_preview := left(coalesce(new.content, ''), 60);
    if length(coalesce(new.content, '')) > 60 then
      v_preview := v_preview || '…';
    end if;
  end if;

  if v_chat_type = 'group' then
    v_kind := coalesce(v_kind, 'group_message');
    v_title := coalesce(v_chat_name, 'Group message');
    v_body := v_sender_name || ' in ' || coalesce(v_chat_name, 'group') || ': ' || v_preview;
  else
    v_kind := coalesce(v_kind, 'new_message');
    v_title := v_sender_name;
    v_body := v_sender_name || ': ' || v_preview;
  end if;

  for v_recipient in
    select m.user_id
    from public.chat_room_members m
    left join public.chat_participants cp
      on cp.chat_id = m.chat_id
     and cp.user_id = m.user_id
    where m.chat_id = new.chat_id
      and m.user_id <> new.sender_id
      and (
        v_chat_type <> 'group'
        or coalesce(cp.is_muted, false) = false
      )
  loop
    perform public.enqueue_chat_notification(
      v_recipient.user_id,
      v_kind,
      v_title,
      v_body,
      v_href,
      jsonb_build_object(
        'chat_id', new.chat_id,
        'sender_id', new.sender_id,
        'message_id', new.id
      )
    );
  end loop;

  return new;
end;
$$;

