alter table if exists public.broadcast_alerts
  drop constraint if exists broadcast_alerts_range_km_check;

alter table if exists public.broadcast_alerts
  add constraint broadcast_alerts_range_km_check
  check (range_km > 0 and range_km <= 50);

create or replace function public.enforce_map_alert_contract()
returns trigger
language plpgsql
security definer
as $function$
declare
  u_id uuid := auth.uid();
  owner_id uuid;
  tier text;
  q public.user_quotas%rowtype;
  today date := current_date;
  wk date := date_trunc('week', now())::date;
  mo date;

  base_range int := 5000;
  base_dur interval := interval '12 hours';
  requested_dur interval;
  wants_extended boolean := false;
  used_extra boolean := false;
  limit_broadcast_week int := 5;
begin
  if u_id is null then
    if new.creator_id is null then
      raise exception 'unauthorized';
    end if;
    u_id := new.creator_id;
  end if;

  new.location_geog := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;

  if new.description is not null and length(new.description) > 1000 then
    raise exception 'description_too_long';
  end if;

  owner_id := public._qms_get_pool_owner(u_id);
  tier := public._qms_effective_tier(owner_id);
  if tier <> 'gold' then
    owner_id := u_id;
    tier := public._qms_effective_tier(owner_id);
  end if;

  perform public._qms_touch_row(owner_id);
  select * into q from public.user_quotas where user_id = owner_id for update;
  mo := public._qms_cycle_month_start(owner_id);

  if q.day_start <> today then
    q.day_start := today;
    q.thread_posts_today := 0;
    q.discovery_views_today := 0;
    q.discovery_profiles_today := 0;
    q.media_usage_today := 0;
    q.ai_vet_uploads_today := 0;
  end if;
  if q.week_start <> wk then
    q.week_start := wk;
    q.broadcast_alerts_week := 0;
    q.broadcast_week_used := 0;
  end if;
  if q.month_start <> mo then
    q.month_start := mo;
    q.stars_used_cycle := 0;
    q.stars_month_used := 0;
  end if;

  if tier = 'plus' then
    base_range := 10000;
    base_dur := interval '24 hours';
    limit_broadcast_week := 20;
  elsif tier = 'gold' then
    base_range := 20000;
    base_dur := interval '48 hours';
    limit_broadcast_week := 20;
  end if;

  if new.range_km is not null and new.range_meters is null then
    new.range_meters := round(new.range_km * 1000.0);
  end if;

  new.range_meters := coalesce(new.range_meters, base_range);
  if new.expires_at is null then
    if new.duration_hours is not null then
      new.expires_at := now() + make_interval(hours => new.duration_hours);
    else
      new.expires_at := now() + base_dur;
    end if;
  end if;
  requested_dur := new.expires_at - now();

  wants_extended := (new.range_meters > base_range) or (requested_dur > base_dur);

  if wants_extended then
    if q.extra_broadcast_72h > 0 then
      q.extra_broadcast_72h := q.extra_broadcast_72h - 1;
      used_extra := true;
      new.range_meters := 50000;
      new.expires_at := now() + interval '72 hours';
    else
      new.range_meters := base_range;
      new.expires_at := now() + base_dur;
    end if;
  else
    if new.range_meters > base_range then
      new.range_meters := base_range;
    end if;
    if requested_dur > base_dur then
      new.expires_at := now() + base_dur;
    end if;
  end if;

  if q.broadcast_alerts_week < limit_broadcast_week then
    q.broadcast_alerts_week := q.broadcast_alerts_week + 1;
    q.broadcast_week_used := q.broadcast_alerts_week;
  else
    if used_extra then
      null;
    elsif q.extra_broadcast_72h > 0 then
      q.extra_broadcast_72h := q.extra_broadcast_72h - 1;
      null;
    else
      raise exception 'quota_exceeded';
    end if;
  end if;

  update public.user_quotas
  set
    day_start = q.day_start,
    week_start = q.week_start,
    month_start = q.month_start,
    broadcast_alerts_week = q.broadcast_alerts_week,
    broadcast_week_used = q.broadcast_week_used,
    extra_broadcast_72h = q.extra_broadcast_72h,
    updated_at = now()
  where user_id = owner_id;

  new.range_km := round((new.range_meters::numeric) / 1000.0, 2);
  new.duration_hours := greatest(1, round(extract(epoch from (new.expires_at - now())) / 3600.0));

  return new;
end;
$function$;

create or replace function public.create_alert_thread_and_pin(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_display_name text;
  v_legal_name text;
  v_phone text;
  v_lat double precision;
  v_lng double precision;
  v_type text;
  v_title text;
  v_description text;
  v_photo_url text;
  v_images text[];
  v_range_meters integer;
  v_range_km numeric;
  v_duration_hours integer;
  v_expires_at timestamptz;
  v_address text;
  v_thread_id uuid := null;
  v_alert_id uuid;
  v_post_to_threads boolean;
  v_is_sensitive boolean := coalesce((payload->>'is_sensitive')::boolean, false);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_lat := coalesce(nullif(payload->>'lat', '')::double precision, nullif(payload->>'latitude', '')::double precision);
  v_lng := coalesce(nullif(payload->>'lng', '')::double precision, nullif(payload->>'longitude', '')::double precision);
  if v_lat is null or v_lng is null then
    raise exception 'missing_coords' using errcode = '22023';
  end if;

  v_type := coalesce(nullif(payload->>'type', ''), nullif(payload->>'alert_type', ''), 'Stray');
  v_title := nullif(payload->>'title', '');
  v_description := nullif(payload->>'description', '');
  v_photo_url := nullif(payload->>'photo_url', '');
  v_images := case jsonb_typeof(payload->'images')
    when 'array' then coalesce(array(select jsonb_array_elements_text(payload->'images')), array[]::text[])
    when 'string' then array_remove(array[nullif(payload->>'images', '')], null)
    else array[]::text[]
  end;
  v_range_meters := coalesce(nullif(payload->>'range_meters', '')::integer, 5000);
  v_range_km := greatest(1.0::numeric, least(50.0::numeric, (v_range_meters::numeric / 1000.0)));
  v_expires_at := coalesce(nullif(payload->>'expires_at', '')::timestamptz, now() + interval '12 hours');
  v_duration_hours := greatest(1, least(72, ceil(extract(epoch from (v_expires_at - now())) / 3600.0)::int));
  v_address := nullif(payload->>'address', '');
  v_post_to_threads := coalesce((payload->>'post_on_threads')::boolean, (payload->>'posted_to_threads')::boolean, false);

  select
    coalesce(
      nullif(btrim(coalesce(
        u.raw_user_meta_data->>'display_name',
        u.raw_user_meta_data->>'full_name',
        split_part(u.email, '@', 1),
        'Huddle User'
      )), ''),
      'Huddle User'
    ),
    coalesce(
      nullif(btrim(coalesce(
        u.raw_user_meta_data->>'legal_name',
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'display_name',
        split_part(u.email, '@', 1),
        'Huddle User'
      )), ''),
      'Huddle User'
    ),
    nullif(btrim(coalesce(
      u.raw_user_meta_data->>'phone',
      u.phone,
      ''
    )), '')
  into v_display_name, v_legal_name, v_phone
  from auth.users u
  where u.id = v_uid;

  insert into public.profiles (id, display_name, legal_name, phone, updated_at)
  select v_uid, v_display_name, v_legal_name, v_phone, now()
  where not exists (
    select 1 from public.profiles p where p.id = v_uid
  );

  if v_post_to_threads then
    insert into public.threads (
      user_id,
      title,
      content,
      tags,
      hashtags,
      images,
      is_map_alert,
      is_public,
      is_sensitive,
      alert_type
    ) values (
      v_uid,
      coalesce(v_title, format('%s Alert: %s', v_type, coalesce(v_address, 'Pinned Location'))),
      coalesce(v_description, ''),
      array['News']::text[],
      array[]::text[],
      case when coalesce(array_length(v_images, 1), 0) > 0 then v_images else array_remove(array[v_photo_url], null) end,
      true,
      coalesce((payload->>'is_public')::boolean, true),
      v_is_sensitive,
      v_type
    )
    returning id into v_thread_id;
  end if;

  insert into public.broadcast_alerts (
    creator_id,
    type,
    title,
    description,
    address,
    duration_hours,
    range_km,
    latitude,
    longitude,
    photo_url,
    images,
    post_on_threads,
    thread_id,
    is_sensitive
  ) values (
    v_uid,
    v_type,
    v_title,
    v_description,
    coalesce(v_address, 'Pinned Location'),
    v_duration_hours,
    v_range_km,
    v_lat,
    v_lng,
    v_photo_url,
    case when coalesce(array_length(v_images, 1), 0) > 0 then v_images else array_remove(array[v_photo_url], null) end,
    v_post_to_threads,
    v_thread_id,
    v_is_sensitive
  )
  returning id into v_alert_id;

  if v_thread_id is not null then
    update public.threads
    set
      map_id = v_alert_id,
      alert_type = coalesce(nullif(btrim(coalesce(alert_type, '')), ''), v_type)
    where id = v_thread_id;
  end if;

  return jsonb_build_object(
    'alert_id', v_alert_id,
    'thread_id', v_thread_id
  );
end;
$$;

create or replace function public.get_visible_broadcast_alerts(
  p_lat double precision,
  p_lng double precision
)
returns table(
  id uuid,
  latitude double precision,
  longitude double precision,
  alert_type text,
  title text,
  description text,
  photo_url text,
  support_count int,
  report_count int,
  created_at timestamptz,
  expires_at timestamptz,
  duration_hours int,
  range_meters int,
  range_km numeric,
  creator_id uuid,
  thread_id uuid,
  posted_to_threads boolean,
  post_on_social boolean,
  social_post_id text,
  social_status text,
  social_url text,
  is_sensitive boolean,
  media_urls text[],
  location_street text,
  location_district text,
  creator_display_name text,
  creator_social_id text,
  creator_avatar_url text,
  marker_state text
)
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select
      auth.uid() as viewer_id,
      public.normalize_country_key(nullif(btrim(p.location_country), '')) as viewer_country,
      coalesce(p.location, p.location_geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as viewer_geog
    from public.profiles p
    where p.id = auth.uid()
  )
  select
    b.id,
    b.latitude,
    b.longitude,
    b.type as alert_type,
    b.title,
    b.description,
    coalesce(b.images[1], b.photo_url) as photo_url,
    coalesce(ai.support_count, 0)::int as support_count,
    coalesce(ai.report_count, 0)::int as report_count,
    b.created_at,
    (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours)))) as expires_at,
    b.duration_hours,
    greatest(1, floor((b.range_km * 1000.0))::int) as range_meters,
    b.range_km,
    b.creator_id,
    b.thread_id,
    coalesce(b.post_on_threads, false) as posted_to_threads,
    coalesce(b.post_on_threads, false) as post_on_social,
    case when b.thread_id is not null then b.thread_id::text else null end as social_post_id,
    case when b.thread_id is not null then 'posted' else null end as social_status,
    case when b.thread_id is not null then '/threads?focus=' || b.thread_id::text else null end as social_url,
    coalesce(b.is_sensitive, false) as is_sensitive,
    case
      when coalesce(array_length(b.images, 1), 0) > 0 then b.images
      else array_remove(array[b.photo_url], null)::text[]
    end as media_urls,
    b.address as location_street,
    p.location_district,
    p.display_name as creator_display_name,
    p.social_id as creator_social_id,
    p.avatar_url as creator_avatar_url,
    case
      when now() <= (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours)))) then 'active'
      when now() <= (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours))) + interval '7 days') then 'expired_dot'
      else 'hidden'
    end as marker_state
  from public.broadcast_alerts b
  join public.profiles p on p.id = b.creator_id
  left join viewer v on true
  left join lateral (
    select
      count(*) filter (where i.interaction_type = 'support') as support_count,
      count(*) filter (where i.interaction_type = 'report') as report_count
    from public.broadcast_alert_interactions i
    where i.alert_id = b.id
  ) ai on true
  where
    b.creator_id is not null
    and b.type in ('Stray', 'Lost', 'Caution', 'Others')
    and coalesce(ai.report_count, 0) < 10
    and (
      (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours)))) > now()
      or now() <= (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours))) + interval '7 days')
    )
    and (
      b.creator_id = auth.uid()
      or not public.is_user_restriction_active(b.creator_id, 'map_hidden', now())
    )
    and (
      b.creator_id = auth.uid()
      or (
        v.viewer_country is not null
        and public.normalize_country_key(nullif(btrim(p.location_country), '')) = v.viewer_country
      )
    )
    and (
      v.viewer_geog is null
      or st_dwithin(
        b.geog,
        v.viewer_geog,
        least(greatest(coalesce(b.range_km, 5) * 1000.0, 1000.0), 50000.0)
      )
    )
    and not public.is_user_blocked(auth.uid(), b.creator_id)
  order by b.created_at desc
  limit 200;
$$;

create or replace function public.get_friend_pins_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int default 50000
)
returns table(
  id uuid,
  display_name text,
  avatar_url text,
  dob date,
  relationship_status text,
  owns_pets boolean,
  pet_species text[],
  location_name text,
  last_lat double precision,
  last_lng double precision,
  location_pinned_until timestamptz,
  location_retention_until timestamptz,
  marker_state text
)
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select public.normalize_country_key(nullif(btrim(p.location_country), '')) as viewer_country
    from public.profiles p
    where p.id = auth.uid()
  ),
  pet_data as (
    select owner_id, array_remove(array_agg(distinct species), null) as pet_species
    from public.pets
    where is_active = true
    group by owner_id
  )
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.dob,
    p.relationship_status,
    p.owns_pets,
    pd.pet_species,
    p.location_name,
    p.last_lat,
    p.last_lng,
    p.location_pinned_until,
    p.location_retention_until,
    'active'::text as marker_state
  from public.profiles p
  left join pet_data pd on pd.owner_id = p.id
  left join viewer v on true
  where p.id <> auth.uid()
    and v.viewer_country is not null
    and public.normalize_country_key(nullif(btrim(p.location_country), '')) = v.viewer_country
    and coalesce(p.location, p.location_geog) is not null
    and p.location_pinned_until is not null
    and p.location_pinned_until > now()
    and ST_DWithin(
      coalesce(p.location, p.location_geog),
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      greatest(0, least(p_radius_m, 50000))
    )
  order by p.location_pinned_until desc
  limit 200;
$$;

create or replace function public.get_broadcast_alert_by_id(p_alert_id uuid)
returns table(
  id uuid,
  latitude double precision,
  longitude double precision,
  alert_type text,
  title text,
  description text,
  photo_url text,
  support_count integer,
  report_count integer,
  created_at timestamptz,
  expires_at timestamptz,
  duration_hours integer,
  range_meters integer,
  range_km numeric,
  creator_id uuid,
  thread_id uuid,
  posted_to_threads boolean,
  post_on_social boolean,
  social_post_id text,
  social_status text,
  social_url text,
  is_sensitive boolean,
  media_urls text[],
  location_street text,
  location_district text,
  creator_display_name text,
  creator_social_id text,
  creator_avatar_url text,
  marker_state text
)
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select public.normalize_country_key(nullif(btrim(p.location_country), '')) as viewer_country
    from public.profiles p
    where p.id = auth.uid()
  )
  select
    b.id,
    b.latitude,
    b.longitude,
    b.type as alert_type,
    b.title,
    b.description,
    coalesce(b.images[1], b.photo_url) as photo_url,
    coalesce(ai.support_count, 0)::int as support_count,
    coalesce(ai.report_count, 0)::int as report_count,
    b.created_at,
    (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours)))) as expires_at,
    b.duration_hours,
    greatest(1, floor((b.range_km * 1000.0))::int) as range_meters,
    b.range_km,
    b.creator_id,
    b.thread_id,
    coalesce(b.post_on_threads, false) as posted_to_threads,
    coalesce(b.post_on_threads, false) as post_on_social,
    case when b.thread_id is not null then b.thread_id::text else null end as social_post_id,
    case when b.thread_id is not null then 'posted' else null end as social_status,
    case when b.thread_id is not null then '/threads?focus=' || b.thread_id::text else null end as social_url,
    coalesce(b.is_sensitive, false) as is_sensitive,
    case
      when coalesce(array_length(b.images, 1), 0) > 0 then b.images
      else array_remove(array[b.photo_url], null)::text[]
    end as media_urls,
    b.address as location_street,
    p.location_district,
    p.display_name as creator_display_name,
    p.social_id as creator_social_id,
    p.avatar_url as creator_avatar_url,
    case
      when now() <= (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours)))) then 'active'
      when now() <= (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours))) + interval '7 days') then 'expired_dot'
      else 'hidden'
    end as marker_state
  from public.broadcast_alerts b
  join public.profiles p on p.id = b.creator_id
  left join viewer v on true
  left join lateral (
    select
      count(*) filter (where i.interaction_type = 'support') as support_count,
      count(*) filter (where i.interaction_type = 'report') as report_count
    from public.broadcast_alert_interactions i
    where i.alert_id = b.id
  ) ai on true
  where b.id = p_alert_id
    and b.creator_id is not null
    and b.type in ('Stray', 'Lost', 'Caution', 'Others')
    and coalesce(ai.report_count, 0) < 10
    and (
      (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours)))) > now()
      or now() <= (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours))) + interval '7 days')
    )
    and (
      b.creator_id = auth.uid()
      or (
        v.viewer_country is not null
        and public.normalize_country_key(nullif(btrim(p.location_country), '')) = v.viewer_country
      )
    )
    and not public.is_user_blocked(auth.uid(), b.creator_id)
  limit 1;
$$;
