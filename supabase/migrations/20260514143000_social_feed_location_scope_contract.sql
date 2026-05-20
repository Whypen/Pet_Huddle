-- Social location contract:
-- - feed discovery is location-scoped
-- - direct post access is public-link scoped
-- - comments inherit parent post access

create table if not exists public.social_feed_scope_fallback_audit (
  thread_id uuid primary key references public.threads(id) on delete cascade,
  fallback_reason text not null,
  fallback_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_viewer_id uuid,
  alert_context jsonb not null default '{}'::jsonb
);

alter table public.social_feed_scope_fallback_audit enable row level security;

drop policy if exists social_feed_scope_fallback_audit_service_all on public.social_feed_scope_fallback_audit;
create policy social_feed_scope_fallback_audit_service_all
  on public.social_feed_scope_fallback_audit
  for all
  to service_role
  using (true)
  with check (true);

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
        ma_by_map.location,
        ma_by_map.location_geog,
        case when ma_by_map.longitude is not null and ma_by_map.latitude is not null then st_setsrid(st_makepoint(ma_by_map.longitude, ma_by_map.latitude), 4326)::geography else null end,
        ma_by_thread.location,
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
        ma_by_map.location,
        ma_by_map.location_geog,
        case when ma_by_map.longitude is not null and ma_by_map.latitude is not null then st_setsrid(st_makepoint(ma_by_map.longitude, ma_by_map.latitude), 4326)::geography else null end,
        ma_by_thread.location,
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

create or replace function public.get_native_social_thread_by_id(p_thread_id uuid)
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
  author_social_id text,
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
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  return query
  with support_counts as (
    select ts.thread_id, count(*)::int as cnt
    from public.thread_supports ts
    where ts.thread_id = p_thread_id
    group by ts.thread_id
  )
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
    null::numeric as score,
    p.display_name as author_display_name,
    p.social_id as author_social_id,
    p.avatar_url as author_avatar_url,
    p.verification_status::text as author_verification_status,
    p.location_country as author_location_country,
    coalesce(p.non_social, false) as author_non_social,
    ac.map_id,
    ac.alert_type,
    ac.location_district as alert_district,
    (ac.map_id is not null or nullif(btrim(coalesce(ac.alert_type, '')), '') is not null or nullif(btrim(coalesce(ac.location_district, '')), '') is not null) as has_alert_link,
    t.video_provider,
    t.provider_video_id,
    t.video_playback_url,
    t.video_embed_url,
    t.video_thumbnail_url,
    t.video_preview_url,
    t.video_duration_seconds,
    t.video_status
  from public.threads t
  join public.profiles p on p.id = t.user_id
  left join support_counts sc on sc.thread_id = t.id
  left join lateral public.get_social_feed_alert_context(array[t.id]) ac on true
  where t.id = p_thread_id
    and coalesce(t.is_public, true) = true
    and coalesce(p.non_social, false) = false
    and not public.is_user_blocked(v_uid, t.user_id)
    and not public.is_user_restriction_active(t.user_id, 'social_hidden', now())
  limit 1;
end;
$$;

revoke all on function public.get_native_social_thread_by_id(uuid) from public, anon;
grant execute on function public.get_native_social_thread_by_id(uuid) to authenticated;
grant execute on function public.get_native_social_thread_by_id(uuid) to service_role;

create or replace function public.get_native_social_comments(
  p_thread_id uuid,
  p_before_created_at timestamptz default null,
  p_limit integer default 5
)
returns table(
  id uuid,
  thread_id uuid,
  parent_comment_id uuid,
  content text,
  images text[],
  created_at timestamptz,
  updated_at timestamptz,
  user_id uuid,
  author_display_name text,
  author_social_id text,
  author_avatar_url text,
  author_is_verified boolean,
  author_verification_status text,
  author_location_country text,
  reply_mentions jsonb
)
language sql
security definer
set search_path = public
as $$
  with visible_thread as (
    select t.id
    from public.threads t
    join public.profiles p on p.id = t.user_id
    where t.id = p_thread_id
      and auth.uid() is not null
      and coalesce(t.is_public, true) = true
      and coalesce(p.non_social, false) = false
      and not public.is_user_blocked(auth.uid(), t.user_id)
      and not public.is_user_restriction_active(t.user_id, 'social_hidden', now())
  ),
  target_comments as (
    select tc.*
    from public.thread_comments tc
    join visible_thread vt on vt.id = tc.thread_id
    where p_before_created_at is null or tc.created_at < p_before_created_at
    order by tc.created_at desc, tc.id desc
    limit greatest(1, least(coalesce(p_limit, 5), 25))
  ),
  comments_asc as (
    select *
    from target_comments
    order by created_at asc, id asc
  )
  select
    tc.id,
    tc.thread_id,
    tc.parent_comment_id,
    coalesce(tc.content, tc.text, '') as content,
    coalesce(tc.images, '{}'::text[]) as images,
    tc.created_at,
    coalesce(tc.updated_at, tc.created_at) as updated_at,
    tc.user_id,
    p.display_name as author_display_name,
    p.social_id as author_social_id,
    p.avatar_url as author_avatar_url,
    coalesce(p.is_verified, false) as author_is_verified,
    p.verification_status::text as author_verification_status,
    p.location_country as author_location_country,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'start', rm.start_idx,
            'end', rm.end_idx,
            'mentionedUserId', rm.mentioned_user_id,
            'socialIdAtTime', rm.social_id_at_time
          )
          order by rm.start_idx asc
        )
        from public.reply_mentions rm
        where rm.reply_id = tc.id
      ),
      '[]'::jsonb
    ) as reply_mentions
  from comments_asc tc
  left join public.profiles p on p.id = tc.user_id;
$$;

revoke all on function public.get_native_social_comments(uuid, timestamptz, integer) from public, anon;
grant execute on function public.get_native_social_comments(uuid, timestamptz, integer) to authenticated;

create or replace function public.create_native_social_comment(
  p_thread_id uuid,
  p_parent_comment_id uuid default null,
  p_content text default '',
  p_images text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment_id uuid;
begin
  if v_uid is null then raise exception 'missing_access_token'; end if;
  if not exists (
    select 1
    from public.threads t
    join public.profiles p on p.id = t.user_id
    where t.id = p_thread_id
      and coalesce(t.is_public, true) = true
      and coalesce(p.non_social, false) = false
      and not public.is_user_blocked(v_uid, t.user_id)
      and not public.is_user_restriction_active(t.user_id, 'social_hidden', now())
  ) then
    raise exception 'thread_unavailable';
  end if;

  insert into public.thread_comments (thread_id, parent_comment_id, user_id, content, text, images)
  values (p_thread_id, p_parent_comment_id, v_uid, coalesce(p_content, ''), coalesce(p_content, ''), coalesce(p_images, '{}'::text[]))
  returning id into v_comment_id;

  return v_comment_id;
end;
$$;

revoke all on function public.create_native_social_comment(uuid, uuid, text, text[]) from public, anon;
grant execute on function public.create_native_social_comment(uuid, uuid, text, text[]) to authenticated;
