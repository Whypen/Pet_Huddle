-- Pass 1: use app-resolved viewer scope for native Social feed discovery.
-- Direct/deeplink thread access stays on get_native_social_thread_by_id.

drop function if exists public.get_social_feed(uuid, text, integer, jsonb);
drop function if exists public.get_social_feed(uuid, text, integer, jsonb, jsonb);

create or replace function public.get_social_feed(
  p_viewer_id uuid,
  p_sort text default 'Latest',
  p_limit integer default 20,
  p_cursor jsonb default null,
  p_viewer_scope jsonb default null
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

  return query
  with viewer_scope as (
    select
      nullif(btrim(p_viewer_scope->>'country'), '') as scope_country,
      lower(nullif(btrim(p_viewer_scope->>'district'), '')) as scope_district,
      case
        when nullif(btrim(p_viewer_scope->>'lat'), '') is not null
          and nullif(btrim(p_viewer_scope->>'lng'), '') is not null
          and (p_viewer_scope->>'lat')::double precision between -90 and 90
          and (p_viewer_scope->>'lng')::double precision between -180 and 180
        then st_setsrid(
          st_makepoint((p_viewer_scope->>'lng')::double precision, (p_viewer_scope->>'lat')::double precision),
          4326
        )::geography
        else null
      end as scope_geog,
      p_viewer_scope is not null as has_app_scope
  ),
  viewer as (
    select
      p.id,
      case
        when vs.has_app_scope then public.normalize_country_key(vs.scope_country)
        else public.normalize_country_key(nullif(btrim(p.location_country), ''))
      end as country,
      case
        when vs.has_app_scope then vs.scope_district
        else lower(nullif(btrim(coalesce(p.location_district, '')), ''))
      end as district,
      case
        when vs.has_app_scope then null
        else lower(nullif(btrim(coalesce(p.location_name, '')), ''))
      end as city,
      case
        when vs.has_app_scope and vs.scope_geog is not null then vs.scope_geog
        when vs.has_app_scope then null
        else coalesce(
          p.location,
          p.location_geog,
          case when p.last_lng is not null and p.last_lat is not null then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography else null end
        )
      end as geog
    from public.profiles p
    cross join viewer_scope vs
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
          when coalesce(a.is_alert_derived, false) = true
            then v.geog is not null and a.scope_geog is not null and st_dwithin(v.geog, a.scope_geog, 150000)
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

revoke all on function public.get_social_feed(uuid, text, integer, jsonb, jsonb) from public, anon;
grant execute on function public.get_social_feed(uuid, text, integer, jsonb, jsonb) to authenticated;
grant execute on function public.get_social_feed(uuid, text, integer, jsonb, jsonb) to service_role;
