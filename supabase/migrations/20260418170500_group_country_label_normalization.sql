create or replace function public.extract_country_from_location_label(p_label text)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[];
  v_last text;
  v_norm text;
begin
  if nullif(btrim(coalesce(p_label, '')), '') is null then
    return null;
  end if;

  v_parts := regexp_split_to_array(p_label, '\s*,\s*');
  if v_parts is null or array_length(v_parts, 1) is null then
    return null;
  end if;

  v_last := nullif(btrim(v_parts[array_length(v_parts, 1)]), '');
  v_norm := lower(coalesce(v_last, ''));

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
      public.resolve_group_country_for_user(new.created_by)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_group_location_country on public.chats;
create trigger trg_sync_group_location_country
before insert or update of type, created_by, location_label
on public.chats
for each row
execute function public.sync_group_location_country();

update public.chats c
set location_country = coalesce(
  public.extract_country_from_location_label(c.location_label),
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
  select
    c.id,
    c.name,
    c.avatar_url,
    c.location_label,
    coalesce(
      nullif(btrim(public.extract_country_from_location_label(c.location_label)), ''),
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
          nullif(btrim(public.extract_country_from_location_label(c.location_label)), ''),
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
