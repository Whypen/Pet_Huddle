alter table public.broadcast_alerts
  add column if not exists range_meters int;

update public.broadcast_alerts
set range_meters = coalesce(range_meters, greatest(1, floor((coalesce(range_km, 5) * 1000.0))::int))
where range_meters is null;

create or replace function public.create_alert_thread_and_pin(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
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
  if v_type not in ('Stray', 'Lost', 'Caution', 'Others') then
    v_type := 'Stray';
  end if;

  v_title := nullif(payload->>'title', '');
  v_description := nullif(payload->>'description', '');
  v_photo_url := nullif(payload->>'photo_url', '');
  v_images := case jsonb_typeof(payload->'images')
    when 'array' then coalesce(array(
      select nullif(btrim(image_url.value), '')
      from jsonb_array_elements_text(payload->'images') as image_url(value)
      where nullif(btrim(image_url.value), '') is not null
    ), array[]::text[])
    when 'string' then array_remove(array[nullif(btrim(payload->>'images'), '')], null)
    else array[]::text[]
  end;
  if coalesce(array_length(v_images, 1), 0) = 0 and v_photo_url is not null then
    v_images := array[v_photo_url];
  end if;
  v_photo_url := coalesce(v_images[1], v_photo_url);

  v_range_meters := coalesce(nullif(payload->>'range_meters', '')::integer, 5000);
  v_range_meters := greatest(1000, least(50000, v_range_meters));
  v_range_km := round((v_range_meters::numeric / 1000.0), 2);
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
      v_images,
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
    range_meters,
    expires_at,
    latitude,
    longitude,
    geog,
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
    v_range_meters,
    v_expires_at,
    v_lat,
    v_lng,
    st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography,
    v_photo_url,
    v_images,
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
