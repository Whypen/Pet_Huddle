-- Provide direct alert fetch for map deep-links outside nearby alert query scope.

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
    and not public.is_user_blocked(auth.uid(), b.creator_id)
  limit 1;
$$;

revoke all on function public.get_broadcast_alert_by_id(uuid) from public;
grant execute on function public.get_broadcast_alert_by_id(uuid) to authenticated;
grant execute on function public.get_broadcast_alert_by_id(uuid) to service_role;
