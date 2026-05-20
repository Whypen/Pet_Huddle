-- Service conversations are the durable source of truth for quoted/requested providers.
-- Keep active service providers out of Service browse and repair existing service room shapes.

update public.chats c
set type = 'service'
from public.service_chats sc
where sc.chat_id = c.id
  and c.type <> 'service';

insert into public.chat_room_members (chat_id, user_id)
select sc.chat_id, sc.requester_id
from public.service_chats sc
left join public.chat_room_members crm
  on crm.chat_id = sc.chat_id
 and crm.user_id = sc.requester_id
where sc.chat_id is not null
  and sc.requester_id is not null
  and crm.chat_id is null;

insert into public.chat_room_members (chat_id, user_id)
select sc.chat_id, sc.provider_id
from public.service_chats sc
left join public.chat_room_members crm
  on crm.chat_id = sc.chat_id
 and crm.user_id = sc.provider_id
where sc.chat_id is not null
  and sc.provider_id is not null
  and crm.chat_id is null;

create or replace function public.create_service_chat(p_provider_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id uuid := auth.uid();
  v_existing_chat_id uuid;
  v_chat_id uuid;
begin
  if v_requester_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_provider_id is null then
    raise exception 'provider_required';
  end if;
  if v_requester_id = p_provider_id then
    raise exception 'cannot_create_service_chat_with_self';
  end if;

  if public.is_user_restriction_active(v_requester_id, 'service_disabled', now()) then
    raise exception 'service_access_disabled';
  end if;

  if public.is_user_restriction_active(p_provider_id, 'marketplace_hidden', now()) then
    raise exception 'provider_marketplace_hidden';
  end if;

  if not exists (select 1 from public.profiles where id = v_requester_id) then
    raise exception 'requester_profile_missing';
  end if;

  if not exists (select 1 from public.profiles where id = p_provider_id) then
    raise exception 'provider_profile_missing';
  end if;

  if not public.can_request_service_from_provider(p_provider_id) then
    raise exception 'provider_not_requestable';
  end if;

  select sc.chat_id
  into v_existing_chat_id
  from public.service_chats sc
  where sc.requester_id = v_requester_id
    and sc.provider_id = p_provider_id
    and sc.status in ('pending', 'booked', 'in_progress')
  order by sc.updated_at desc nulls last, sc.created_at desc nulls last
  limit 1;

  if v_existing_chat_id is not null then
    insert into public.chats (id, type, created_by)
    values (v_existing_chat_id, 'service', v_requester_id)
    on conflict (id) do update
      set type = 'service',
          created_by = coalesce(public.chats.created_by, excluded.created_by);

    insert into public.chat_room_members (chat_id, user_id)
    values (v_existing_chat_id, v_requester_id)
    on conflict do nothing;

    insert into public.chat_room_members (chat_id, user_id)
    values (v_existing_chat_id, p_provider_id)
    on conflict do nothing;

    return v_existing_chat_id;
  end if;

  insert into public.chats (type, created_by)
  values ('service', v_requester_id)
  returning id into v_chat_id;

  insert into public.chat_room_members (chat_id, user_id)
  values (v_chat_id, v_requester_id), (v_chat_id, p_provider_id)
  on conflict do nothing;

  insert into public.service_chats (
    chat_id, requester_id, provider_id, status, request_opened_at
  )
  values (
    v_chat_id, v_requester_id, p_provider_id, 'pending', now()
  );

  return v_chat_id;
end;
$$;

revoke all on function public.create_service_chat(uuid) from public, anon;
grant execute on function public.create_service_chat(uuid) to authenticated, service_role;

create or replace function public.get_native_service_provider_cards(
  p_lat double precision default null,
  p_lng double precision default null,
  p_viewer_country text default null,
  p_viewer_scope jsonb default null
)
returns table(
  user_id uuid,
  story text,
  skills text[],
  proof_metadata jsonb,
  vet_license_found boolean,
  days text[],
  time_blocks text[],
  other_time_from text,
  other_time_to text,
  emergency_readiness boolean,
  min_notice_value integer,
  min_notice_unit text,
  location_styles text[],
  area_name text,
  services_offered text[],
  services_other text,
  pet_types text[],
  pet_types_other text,
  dog_sizes text[],
  currency text,
  starting_price numeric,
  rates text[],
  created_at timestamptz,
  updated_at timestamptz,
  display_name text,
  avatar_url text,
  has_car boolean,
  is_verified boolean,
  verification_status text,
  location_country text,
  is_bookmarked boolean,
  distance_km double precision
)
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select
      auth.uid() as user_id,
      case
        when p_lat is not null and p_lng is not null
        then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
        else null::geography
      end as geog,
      lower(nullif(btrim(coalesce(p_viewer_scope->>'district', '')), '')) as district,
      lower(nullif(btrim(coalesce(p_viewer_scope->>'city', '')), '')) as city
  ),
  hidden as (
    select r.user_id
    from public.user_moderation_restrictions r
    where r.restriction_key = 'marketplace_hidden'
      and (r.expires_at is null or r.expires_at > now())
  ),
  active_service_providers as (
    select distinct sc.provider_id as user_id
    from public.service_chats sc
    join viewer v on v.user_id = sc.requester_id
    where sc.status in ('pending', 'booked', 'in_progress')
  ),
  provider_source as (
    select
      pc.*,
      pp.display_name,
      pp.avatar_url,
      coalesce(pp.has_car, false) as has_car,
      coalesce(pp.is_verified, false) as is_verified,
      p.verification_status::text as verification_status,
      p.location_country,
      lower(nullif(btrim(coalesce(p.location_district, '')), '')) as provider_district,
      lower(nullif(btrim(coalesce(p.location_name, '')), '')) as provider_city,
      coalesce(p.location, p.location_geog) as provider_geog
    from public.pet_care_profiles pc
    join public.profiles_public pp on pp.id = pc.user_id
    join public.profiles p on p.id = pc.user_id
    join viewer v on true
    where pc.listed = true
      and pc.user_id <> v.user_id
      and not public.is_user_blocked(v.user_id, pc.user_id)
      and not exists (select 1 from hidden h where h.user_id = pc.user_id)
      and not exists (select 1 from active_service_providers asp where asp.user_id = pc.user_id)
  ),
  scoped as (
    select
      ps.*,
      exists (
        select 1
        from public.service_bookmarks sb
        join viewer v on v.user_id = sb.user_id
        where sb.provider_user_id = ps.user_id
      ) as is_bookmarked,
      case
        when v.geog is not null and ps.provider_geog is not null
        then st_distance(ps.provider_geog, v.geog) / 1000.0
        else null::double precision
      end as distance_km,
      case
        when v.district is not null and ps.provider_district = v.district then 0
        when v.city is not null and ps.provider_city = v.city then 1
        when v.geog is not null and ps.provider_geog is not null and st_dwithin(ps.provider_geog, v.geog, 50000) then 2
        else 9
      end as scope_priority
    from provider_source ps
    join viewer v on true
  )
  select
    s.user_id,
    s.story,
    s.skills,
    s.proof_metadata,
    s.vet_license_found,
    s.days,
    s.time_blocks,
    s.other_time_from,
    s.other_time_to,
    s.emergency_readiness,
    s.min_notice_value,
    s.min_notice_unit,
    s.location_styles,
    s.area_name,
    s.services_offered,
    s.services_other,
    s.pet_types,
    s.pet_types_other,
    s.dog_sizes,
    s.currency,
    s.starting_price,
    s.rates,
    s.created_at,
    s.updated_at,
    s.display_name,
    s.avatar_url,
    s.has_car,
    s.is_verified,
    s.verification_status,
    s.location_country,
    s.is_bookmarked,
    s.distance_km
  from scoped s
  where s.scope_priority in (0, 1, 2)
  order by s.scope_priority asc, s.distance_km asc nulls last, s.service_rank_weight desc nulls last, s.updated_at desc nulls last;
$$;

revoke all on function public.get_native_service_provider_cards(double precision, double precision, text, jsonb) from public, anon;
grant execute on function public.get_native_service_provider_cards(double precision, double precision, text, jsonb) to authenticated;

create or replace function public.get_active_service_provider_ids_for_viewer()
returns table(provider_id uuid, chat_id uuid, service_status text)
language sql
security definer
set search_path = public
as $$
  select distinct sc.provider_id, sc.chat_id, sc.status
  from public.service_chats sc
  join public.chats c on c.id = sc.chat_id and c.type = 'service'
  join public.chat_room_members requester_member
    on requester_member.chat_id = sc.chat_id
   and requester_member.user_id = sc.requester_id
  join public.chat_room_members provider_member
    on provider_member.chat_id = sc.chat_id
   and provider_member.user_id = sc.provider_id
  where sc.requester_id = auth.uid()
    and sc.status in ('pending', 'booked', 'in_progress');
$$;

revoke all on function public.get_active_service_provider_ids_for_viewer() from public, anon;
grant execute on function public.get_active_service_provider_ids_for_viewer() to authenticated, service_role;

do $$
declare
  v_function_oid oid;
  v_function_def text;
  v_previous text := 'and (p_only_with_activity is null
      or (p_only_with_activity = true and e.last_message_at is not null)
      or (p_only_with_activity = false and e.last_message_at is null))';
  v_next text := 'and (p_only_with_activity is null
      or (e.room_type = ''service'' and p_only_with_activity = false)
      or (p_only_with_activity = true and e.last_message_at is not null)
      or (p_only_with_activity = false and e.last_message_at is null))';
begin
  select p.oid
  into v_function_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_chat_inbox_summaries'
    and pg_get_function_identity_arguments(p.oid) = 'p_scope text, p_chat_ids uuid[], p_only_with_activity boolean, p_limit integer, p_cursor timestamp with time zone';

  if v_function_oid is null then
    raise exception 'get_chat_inbox_summaries_signature_missing';
  end if;

  v_function_def := pg_get_functiondef(v_function_oid);

  if position(v_next in v_function_def) > 0 then
    return;
  end if;

  if position(v_previous in v_function_def) = 0 then
    raise exception 'get_chat_inbox_summaries_activity_filter_shape_changed';
  end if;

  execute replace(v_function_def, v_previous, v_next);
end;
$$;
