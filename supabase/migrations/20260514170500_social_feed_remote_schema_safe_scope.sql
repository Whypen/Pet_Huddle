-- Remote-schema-safe repair for 20260514143000.
-- Verified remote columns before writing:
-- - map_alerts has location_geog, latitude, longitude, address, location_district, thread_id.
-- - map_alerts does not have location.
-- - broadcast_alerts has geog, latitude, longitude, address, thread_id.
-- Access modes:
-- - get_social_feed remains location-scoped list discovery.
-- - get_native_social_thread_by_id remains direct/deeplink public access.
-- - get_native_social_comments and create_native_social_comment inherit direct parent-thread access.

create or replace function public.get_social_feed_alert_context(p_thread_ids uuid[])
returns table(
  thread_id uuid,
  map_id uuid,
  alert_type text,
  location_district text
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select t.id as thread_id, t.map_id
    from public.threads t
    where t.id = any(coalesce(p_thread_ids, array[]::uuid[]))
  ),
  by_map_alert as (
    select
      b.thread_id,
      ma.id as alert_id,
      ma.alert_type,
      coalesce(
        nullif(btrim(ma.location_district), ''),
        nullif(btrim(split_part(coalesce(ma.address, ''), ',', 2)), ''),
        nullif(btrim(ma.address), '')
      ) as location_district
    from base b
    left join public.map_alerts ma on ma.id = b.map_id
  ),
  by_thread_map_alert as (
    select
      b.thread_id,
      ma.id as alert_id,
      ma.alert_type,
      coalesce(
        nullif(btrim(ma.location_district), ''),
        nullif(btrim(split_part(coalesce(ma.address, ''), ',', 2)), ''),
        nullif(btrim(ma.address), '')
      ) as location_district,
      row_number() over (partition by b.thread_id order by ma.created_at desc, ma.id desc) as rn
    from base b
    left join public.map_alerts ma on ma.thread_id = b.thread_id
  ),
  by_map_broadcast as (
    select
      b.thread_id,
      ba.id as alert_id,
      ba.type as alert_type,
      coalesce(
        nullif(btrim(split_part(coalesce(ba.address, ''), ',', 2)), ''),
        nullif(btrim(ba.address), '')
      ) as location_district
    from base b
    left join public.broadcast_alerts ba on ba.id = b.map_id
  ),
  by_thread_broadcast as (
    select
      b.thread_id,
      ba.id as alert_id,
      ba.type as alert_type,
      coalesce(
        nullif(btrim(split_part(coalesce(ba.address, ''), ',', 2)), ''),
        nullif(btrim(ba.address), '')
      ) as location_district,
      row_number() over (partition by b.thread_id order by ba.created_at desc, ba.id desc) as rn
    from base b
    left join public.broadcast_alerts ba on ba.thread_id = b.thread_id
  )
  select
    b.thread_id,
    coalesce(tba.alert_id, tma.alert_id, mba.alert_id, mma.alert_id) as map_id,
    coalesce(
      nullif(tba.alert_type, ''),
      nullif(tma.alert_type, ''),
      nullif(mba.alert_type, ''),
      nullif(mma.alert_type, '')
    ) as alert_type,
    coalesce(
      nullif(tba.location_district, ''),
      nullif(tma.location_district, ''),
      nullif(mba.location_district, ''),
      nullif(mma.location_district, '')
    ) as location_district
  from base b
  left join by_map_alert mma on mma.thread_id = b.thread_id
  left join by_thread_map_alert tma on tma.thread_id = b.thread_id and tma.rn = 1
  left join by_map_broadcast mba on mba.thread_id = b.thread_id
  left join by_thread_broadcast tba on tba.thread_id = b.thread_id and tba.rn = 1;
$$;

revoke all on function public.get_social_feed_alert_context(uuid[]) from public, anon;
grant execute on function public.get_social_feed_alert_context(uuid[]) to authenticated;
grant execute on function public.get_social_feed_alert_context(uuid[]) to service_role;

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
  updated_at timestamptz,
  like_count integer,
  support_count integer,
  comment_count integer,
  score numeric,
  author_display_name text,
  author_avatar_url text,
  author_verification_status text,
  author_location_country text,
  author_non_social boolean,
  map_id uuid,
  alert_type text,
  alert_district text,
  has_alert_link boolean,
  video_provider text,
  provider_video_id text,
  video_playback_url text,
  video_embed_url text,
  video_thumbnail_url text,
  video_preview_url text,
  video_duration_seconds numeric,
  video_status text
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

  insert into public.social_feed_scope_fallback_audit (
    thread_id,
    fallback_reason,
    last_viewer_id,
    alert_context
  )
  with alert_scope as (
    select
      t.id as thread_id,
      coalesce(t.map_id, ma_by_thread.id, ba_by_thread.id) as alert_id,
      coalesce(ma_by_map.alert_type, ma_by_thread.alert_type, ba_by_map.type, ba_by_thread.type) as alert_type,
      coalesce(
        ma_by_map.location_geog,
        case when ma_by_map.longitude is not null and ma_by_map.latitude is not null then st_setsrid(st_makepoint(ma_by_map.longitude, ma_by_map.latitude), 4326)::geography else null end,
        ma_by_thread.location_geog,
        case when ma_by_thread.longitude is not null and ma_by_thread.latitude is not null then st_setsrid(st_makepoint(ma_by_thread.longitude, ma_by_thread.latitude), 4326)::geography else null end,
        ba_by_map.geog,
        case when ba_by_map.longitude is not null and ba_by_map.latitude is not null then st_setsrid(st_makepoint(ba_by_map.longitude, ba_by_map.latitude), 4326)::geography else null end,
        ba_by_thread.geog,
        case when ba_by_thread.longitude is not null and ba_by_thread.latitude is not null then st_setsrid(st_makepoint(ba_by_thread.longitude, ba_by_thread.latitude), 4326)::geography else null end
      ) as scope_geog,
      coalesce(
        nullif(btrim(ma_by_map.location_district), ''),
        nullif(btrim(ma_by_thread.location_district), ''),
        nullif(btrim(split_part(coalesce(ma_by_map.address, ''), ',', 2)), ''),
        nullif(btrim(split_part(coalesce(ma_by_thread.address, ''), ',', 2)), ''),
        nullif(btrim(split_part(coalesce(ba_by_map.address, ''), ',', 2)), ''),
        nullif(btrim(split_part(coalesce(ba_by_thread.address, ''), ',', 2)), '')
      ) as scope_district,
      coalesce(
        nullif(btrim(split_part(coalesce(ma_by_map.address, ''), ',', 3)), ''),
        nullif(btrim(split_part(coalesce(ma_by_thread.address, ''), ',', 3)), ''),
        nullif(btrim(split_part(coalesce(ba_by_map.address, ''), ',', 3)), ''),
        nullif(btrim(split_part(coalesce(ba_by_thread.address, ''), ',', 3)), '')
      ) as scope_city,
      coalesce(
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ma_by_map.address, '')), ',', 1))), '')),
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ma_by_thread.address, '')), ',', 1))), '')),
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ba_by_map.address, '')), ',', 1))), '')),
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ba_by_thread.address, '')), ',', 1))), ''))
      ) as scope_country
    from public.threads t
    left join public.map_alerts ma_by_map on ma_by_map.id = t.map_id
    left join public.map_alerts ma_by_thread on ma_by_thread.thread_id = t.id
    left join public.broadcast_alerts ba_by_map on ba_by_map.id = t.map_id
    left join public.broadcast_alerts ba_by_thread on ba_by_thread.thread_id = t.id
    where coalesce(t.is_map_alert, false) = true
      or t.map_id is not null
      or ma_by_thread.id is not null
      or ba_by_thread.id is not null
  )
  select
    a.thread_id,
    'alert_location_missing_author_scope_fallback',
    v_uid,
    jsonb_build_object(
      'alert_id', a.alert_id,
      'alert_type', a.alert_type,
      'scope_district', a.scope_district,
      'scope_city', a.scope_city,
      'scope_country', a.scope_country
    )
  from alert_scope a
  where a.scope_geog is null
    and nullif(btrim(coalesce(a.scope_district, '')), '') is null
    and nullif(btrim(coalesce(a.scope_city, '')), '') is null
    and nullif(btrim(coalesce(a.scope_country, '')), '') is null
  on conflict (thread_id) do update
    set fallback_count = public.social_feed_scope_fallback_audit.fallback_count + 1,
        last_seen_at = now(),
        last_viewer_id = excluded.last_viewer_id,
        alert_context = excluded.alert_context;

  return query
  with viewer as (
    select
      p.id,
      public.normalize_country_key(nullif(btrim(p.location_country), '')) as country,
      lower(nullif(btrim(coalesce(p.location_district, '')), '')) as district,
      lower(nullif(btrim(coalesce(p.location_name, '')), '')) as city,
      coalesce(
        p.location,
        p.location_geog,
        case when p.last_lng is not null and p.last_lat is not null then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography else null end
      ) as geog
    from public.profiles p
    where p.id = v_uid
  ),
  support_counts as (
    select ts.thread_id, count(*)::int as cnt
    from public.thread_supports ts
    group by ts.thread_id
  ),
  alert_scope as (
    select
      t.id as thread_id,
      coalesce(t.map_id, ma_by_thread.id, ba_by_thread.id) as map_id,
      coalesce(ma_by_map.alert_type, ma_by_thread.alert_type, ba_by_map.type, ba_by_thread.type) as alert_type,
      coalesce(
        nullif(btrim(ma_by_map.location_district), ''),
        nullif(btrim(ma_by_thread.location_district), ''),
        nullif(btrim(split_part(coalesce(ma_by_map.address, ''), ',', 2)), ''),
        nullif(btrim(split_part(coalesce(ma_by_thread.address, ''), ',', 2)), ''),
        nullif(btrim(split_part(coalesce(ba_by_map.address, ''), ',', 2)), ''),
        nullif(btrim(split_part(coalesce(ba_by_thread.address, ''), ',', 2)), '')
      ) as location_district,
      coalesce(
        nullif(btrim(split_part(coalesce(ma_by_map.address, ''), ',', 3)), ''),
        nullif(btrim(split_part(coalesce(ma_by_thread.address, ''), ',', 3)), ''),
        nullif(btrim(split_part(coalesce(ba_by_map.address, ''), ',', 3)), ''),
        nullif(btrim(split_part(coalesce(ba_by_thread.address, ''), ',', 3)), '')
      ) as location_city,
      coalesce(
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ma_by_map.address, '')), ',', 1))), '')),
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ma_by_thread.address, '')), ',', 1))), '')),
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ba_by_map.address, '')), ',', 1))), '')),
        public.normalize_country_key(nullif(btrim(reverse(split_part(reverse(coalesce(ba_by_thread.address, '')), ',', 1))), ''))
      ) as location_country,
      coalesce(
        ma_by_map.location_geog,
        case when ma_by_map.longitude is not null and ma_by_map.latitude is not null then st_setsrid(st_makepoint(ma_by_map.longitude, ma_by_map.latitude), 4326)::geography else null end,
        ma_by_thread.location_geog,
        case when ma_by_thread.longitude is not null and ma_by_thread.latitude is not null then st_setsrid(st_makepoint(ma_by_thread.longitude, ma_by_thread.latitude), 4326)::geography else null end,
        ba_by_map.geog,
        case when ba_by_map.longitude is not null and ba_by_map.latitude is not null then st_setsrid(st_makepoint(ba_by_map.longitude, ba_by_map.latitude), 4326)::geography else null end,
        ba_by_thread.geog,
        case when ba_by_thread.longitude is not null and ba_by_thread.latitude is not null then st_setsrid(st_makepoint(ba_by_thread.longitude, ba_by_thread.latitude), 4326)::geography else null end
      ) as scope_geog,
      (
        coalesce(t.is_map_alert, false) = true
        or t.map_id is not null
        or ma_by_thread.id is not null
        or ba_by_thread.id is not null
      ) as is_alert_derived
    from public.threads t
    left join public.map_alerts ma_by_map on ma_by_map.id = t.map_id
    left join public.map_alerts ma_by_thread on ma_by_thread.thread_id = t.id
    left join public.broadcast_alerts ba_by_map on ba_by_map.id = t.map_id
    left join public.broadcast_alerts ba_by_thread on ba_by_thread.thread_id = t.id
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
      t.created_at as updated_at,
      coalesce(sc.cnt, 0)::int as like_count,
      coalesce(sc.cnt, 0)::int as support_count,
      (select count(*)::int from public.thread_comments tc where tc.thread_id = t.id) as comment_count,
      p.display_name as author_display_name,
      p.avatar_url as author_avatar_url,
      p.verification_status::text as author_verification_status,
      p.location_country as author_location_country,
      coalesce(p.non_social, false) as author_non_social,
      t.video_provider,
      t.provider_video_id,
      t.video_playback_url,
      t.video_embed_url,
      t.video_thumbnail_url,
      t.video_preview_url,
      t.video_duration_seconds,
      t.video_status,
      a.map_id,
      a.alert_type,
      a.location_district as alert_district,
      a.is_alert_derived,
      case
        when lower(nullif(btrim(coalesce(a.location_district, '')), '')) is not null
          and lower(nullif(btrim(coalesce(a.location_district, '')), '')) = v.district then 0
        when lower(nullif(btrim(coalesce(a.location_city, '')), '')) is not null
          and lower(nullif(btrim(coalesce(a.location_city, '')), '')) = v.city then 1
        when not coalesce(a.is_alert_derived, false)
          and lower(nullif(btrim(coalesce(p.location_district, '')), '')) is not null
          and lower(nullif(btrim(coalesce(p.location_district, '')), '')) = v.district then 0
        when not coalesce(a.is_alert_derived, false)
          and lower(nullif(btrim(coalesce(p.location_name, '')), '')) is not null
          and lower(nullif(btrim(coalesce(p.location_name, '')), '')) = v.city then 1
        else 2
      end as scope_priority
    from public.threads t
    join public.profiles p on p.id = t.user_id
    left join support_counts sc on sc.thread_id = t.id
    left join alert_scope a on a.thread_id = t.id
    join viewer v on true
    where coalesce(p.non_social, false) = false
      and coalesce(t.is_public, true) = true
      and not public.is_user_blocked(v.id, t.user_id)
      and not public.is_user_restriction_active(t.user_id, 'social_hidden', now())
      and (
        case
          when coalesce(a.is_alert_derived, false) = true and (
            a.scope_geog is not null
            or nullif(btrim(coalesce(a.location_district, '')), '') is not null
            or nullif(btrim(coalesce(a.location_city, '')), '') is not null
            or nullif(btrim(coalesce(a.location_country, '')), '') is not null
          ) then (
            (v.geog is not null and a.scope_geog is not null and st_dwithin(v.geog, a.scope_geog, 150000))
            or (
              v.district is not null
              and lower(nullif(btrim(coalesce(a.location_district, '')), '')) = v.district
            )
            or (
              v.city is not null
              and lower(nullif(btrim(coalesce(a.location_city, '')), '')) = v.city
            )
            or (
              v.country is not null
              and a.location_country = v.country
            )
          )
          when coalesce(a.is_alert_derived, false) = true then public.is_in_scope(v.id, t.user_id)
          else public.is_in_scope(v.id, t.user_id)
        end
      )
  ),
  ranked as (
    select
      b.*,
      ((coalesce(b.like_count, 0) * 2) + (coalesce(b.comment_count, 0) * 3) + (coalesce(b.support_count, 0) * 1) - ((extract(epoch from (now() - b.created_at)) / 3600.0) * 0.10))::numeric as computed_score
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
    r.updated_at,
    r.like_count,
    r.support_count,
    r.comment_count,
    case when lower(coalesce(p_sort, 'latest')) = 'trending' then r.computed_score else null end as score,
    r.author_display_name,
    r.author_avatar_url,
    r.author_verification_status,
    r.author_location_country,
    r.author_non_social,
    r.map_id,
    r.alert_type,
    r.alert_district,
    (r.map_id is not null or nullif(btrim(coalesce(r.alert_type, '')), '') is not null or nullif(btrim(coalesce(r.alert_district, '')), '') is not null) as has_alert_link,
    r.video_provider,
    r.provider_video_id,
    r.video_playback_url,
    r.video_embed_url,
    r.video_thumbnail_url,
    r.video_preview_url,
    r.video_duration_seconds,
    r.video_status
  from ranked r
  order by
    r.scope_priority asc,
    case when lower(coalesce(p_sort, 'latest')) = 'trending' then r.computed_score end desc nulls last,
    r.created_at desc,
    r.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all on function public.get_social_feed(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.get_social_feed(uuid, text, integer, jsonb) to authenticated;
grant execute on function public.get_social_feed(uuid, text, integer, jsonb) to service_role;
