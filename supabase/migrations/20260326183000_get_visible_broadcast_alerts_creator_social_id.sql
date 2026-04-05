-- Include creator_social_id in map alert visibility RPC so share headers can render
-- consistent `Name (@social_id)` metadata without per-click fallback queries.

drop function if exists public.get_visible_broadcast_alerts(double precision, double precision);
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
      nullif(btrim(p.location_country), '') as viewer_country,
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
    and b.type in ('Stray', 'Lost', 'Others')
    and coalesce(ai.report_count, 0) < 10
    and (
      (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours)))) > now()
      or now() <= (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours))) + interval '7 days')
    )
    and (
      b.creator_id = auth.uid()
      or (
        p.location_country is null
        or v.viewer_country is null
        or p.location_country = v.viewer_country
      )
    )
    and (
      v.viewer_geog is null
      or st_dwithin(
        b.geog,
        v.viewer_geog,
        least(greatest(coalesce(b.range_km, 10) * 1000.0, 1000.0), 100000.0)
      )
    )
    and not public.is_user_blocked(auth.uid(), b.creator_id)
  order by b.created_at desc
  limit 200;
$$;
