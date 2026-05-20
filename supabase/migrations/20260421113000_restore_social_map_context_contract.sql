-- Restore direct social feed map context and backfill legacy alert-thread linkage.

alter table public.threads
  add column if not exists alert_type text;

with latest_alert_per_thread as (
  select distinct on (ba.thread_id)
    ba.thread_id,
    ba.id as alert_id,
    ba.type as alert_type
  from public.broadcast_alerts ba
  where ba.thread_id is not null
  order by ba.thread_id, ba.created_at desc, ba.id desc
)
update public.threads t
set
  map_id = coalesce(t.map_id, lat.alert_id),
  alert_type = coalesce(nullif(btrim(coalesce(t.alert_type, '')), ''), lat.alert_type)
from latest_alert_per_thread lat
where lat.thread_id = t.id
  and (
    t.map_id is null
    or nullif(btrim(coalesce(t.alert_type, '')), '') is null
  );

drop function if exists public.get_social_feed(uuid, text, integer, jsonb);

create or replace function public.get_social_feed(
  p_viewer_id uuid,
  p_sort text default 'Latest',
  p_limit integer default 20,
  p_cursor jsonb default null
)
returns table(
  id uuid,
  user_id uuid,
  title text,
  content text,
  tags text[],
  hashtags text[],
  images text[],
  created_at timestamptz,
  like_count integer,
  support_count integer,
  comment_count integer,
  score numeric,
  author_display_name text,
  author_avatar_url text,
  author_verification_status text,
  author_location_country text,
  author_last_lat double precision,
  author_last_lng double precision,
  author_non_social boolean,
  map_id uuid,
  alert_type text,
  alert_district text,
  has_alert_link boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text := coalesce(auth.role(), '');
  v_uid uuid;
begin
  v_uid := case
    when v_caller_role = 'service_role' then coalesce(p_viewer_id, auth.uid())
    else auth.uid()
  end;

  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  if v_caller_role <> 'service_role' and p_viewer_id is not null and p_viewer_id <> v_uid then
    raise exception 'forbidden';
  end if;

  return query
  with viewer as (
    select p.id, p.location_country, coalesce(p.location, p.location_geog) as geog
    from public.profiles p
    where p.id = v_uid
  ),
  support_counts as (
    select ts.thread_id, count(*)::int as cnt
    from public.thread_supports ts
    group by ts.thread_id
  ),
  base as (
    select
      t.id,
      t.user_id,
      t.title,
      t.content,
      t.tags,
      t.hashtags,
      t.images,
      t.created_at,
      coalesce(sc.cnt, 0)::int as like_count,
      coalesce(sc.cnt, 0)::int as support_count,
      (
        select count(*)::int
        from public.thread_comments tc
        where tc.thread_id = t.id
      ) as comment_count,
      p.display_name as author_display_name,
      p.avatar_url as author_avatar_url,
      p.verification_status::text as author_verification_status,
      p.location_country as author_location_country,
      p.last_lat as author_last_lat,
      p.last_lng as author_last_lng,
      coalesce(p.non_social, false) as author_non_social
    from public.threads t
    join public.profiles p on p.id = t.user_id
    left join support_counts sc on sc.thread_id = t.id
    join viewer v on true
    where coalesce(p.non_social, false) = false
      and not public.is_user_blocked(v.id, t.user_id)
      and public.is_in_scope(v.id, t.user_id)
  ),
  ranked as (
    select
      b.*,
      (
        (coalesce(b.like_count, 0) * 2)
        + (coalesce(b.comment_count, 0) * 3)
        + (coalesce(b.support_count, 0) * 1)
        - ((extract(epoch from (now() - b.created_at)) / 3600.0) * 0.10)
      )::numeric as computed_score
    from base b
    where (
      lower(coalesce(p_sort, 'latest')) <> 'trending'
      or b.created_at >= now() - interval '7 days'
    )
      and (
        p_cursor is null
        or (b.created_at, b.id) < (
          coalesce((p_cursor->>'created_at')::timestamptz, 'infinity'::timestamptz),
          coalesce((p_cursor->>'id')::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
        )
      )
  )
  select
    r.id,
    r.user_id,
    r.title,
    r.content,
    r.tags,
    r.hashtags,
    r.images,
    r.created_at,
    r.like_count,
    r.support_count,
    r.comment_count,
    case when lower(coalesce(p_sort, 'latest')) = 'trending' then r.computed_score else null end as score,
    r.author_display_name,
    r.author_avatar_url,
    r.author_verification_status,
    r.author_location_country,
    r.author_last_lat,
    r.author_last_lng,
    r.author_non_social,
    ac.map_id,
    ac.alert_type,
    ac.location_district as alert_district,
    (
      ac.map_id is not null
      or nullif(btrim(coalesce(ac.alert_type, '')), '') is not null
      or nullif(btrim(coalesce(ac.location_district, '')), '') is not null
    ) as has_alert_link
  from ranked r
  left join lateral public.get_social_feed_alert_context(array[r.id]) ac on true
  order by
    case when lower(coalesce(p_sort, 'latest')) = 'trending' then r.computed_score end desc nulls last,
    r.created_at desc,
    r.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all on function public.get_social_feed(uuid, text, integer, jsonb) from public;
grant all on function public.get_social_feed(uuid, text, integer, jsonb) to authenticated;
grant all on function public.get_social_feed(uuid, text, integer, jsonb) to service_role;

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
  v_range_meters := coalesce(nullif(payload->>'range_meters', '')::integer, 10000);
  v_range_km := greatest(1.0::numeric, least(150.0::numeric, (v_range_meters::numeric / 1000.0)));
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
