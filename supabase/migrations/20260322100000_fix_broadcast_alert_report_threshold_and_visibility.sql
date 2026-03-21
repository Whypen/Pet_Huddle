-- Fix 1: Off-by-one in report threshold.
-- AFTER INSERT trigger already counts new row, so = 9 fires at 9 reports.
-- Changed to = 10 so notification fires exactly when the 10th report is inserted.
create or replace function public.notify_broadcast_alert_hidden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_count integer;
  v_creator_id uuid;
begin
  if new.interaction_type <> 'report' then
    return new;
  end if;

  select creator_id into v_creator_id
  from public.broadcast_alerts
  where id = new.alert_id;

  if v_creator_id is null then
    return new;
  end if;

  -- Count includes current row (AFTER INSERT trigger)
  select count(*) into v_report_count
  from public.broadcast_alert_interactions
  where alert_id = new.alert_id
    and interaction_type = 'report';

  -- Fire exactly when threshold reaches 10 (AFTER INSERT already counted this row)
  if v_report_count = 10 then
    perform public.enqueue_notification(
      v_creator_id,
      'map',
      'broadcast_hidden',
      'Alert removed',
      'Your alert was removed after too many reports',
      '/map',
      jsonb_build_object('alert_id', new.alert_id)
    );
  end if;

  return new;
end;
$$;

-- Fix 2: get_visible_broadcast_alerts must exclude alerts with >= 10 reports.
-- The lateral join already computes report_count; add it to the WHERE clause.
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
  where b.archived_at is null
    and now() <= (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours))) + interval '7 days')
    -- Hide alerts that have reached 10 or more reports
    and coalesce(ai.report_count, 0) < 10
    and not public.is_user_blocked(auth.uid(), b.creator_id)
    and (
      b.creator_id = auth.uid()
      or (
        (
          v.viewer_country is not null
          and nullif(btrim(p.location_country), '') is not null
          and lower(v.viewer_country) = lower(nullif(btrim(p.location_country), ''))
        )
        or (
          v.viewer_geog is not null
          and b.geog is not null
          and st_dwithin(v.viewer_geog, b.geog, 150000)
        )
      )
    )
  order by b.created_at desc
  limit 200;
$$;
