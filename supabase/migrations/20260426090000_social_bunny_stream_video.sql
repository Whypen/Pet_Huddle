-- Social video: move feed video metadata to Bunny Stream while preserving image URLs.

alter table public.threads
  add column if not exists video_provider text,
  add column if not exists provider_video_id text,
  add column if not exists video_playback_url text,
  add column if not exists video_embed_url text,
  add column if not exists video_thumbnail_url text,
  add column if not exists video_preview_url text,
  add column if not exists video_duration_seconds numeric,
  add column if not exists video_status text;

alter table public.threads
  add constraint threads_social_video_provider_check
  check (video_provider is null or video_provider = 'bunny_stream')
  not valid;

alter table public.threads
  add constraint threads_social_video_status_check
  check (video_status is null or video_status in ('created', 'uploading', 'uploaded', 'processing', 'ready', 'failed', 'abandoned', 'deleted'))
  not valid;

create table if not exists public.social_video_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete set null,
  provider text not null default 'bunny_stream',
  provider_video_id text not null,
  playback_url text,
  embed_url text,
  thumbnail_url text,
  preview_url text,
  duration_seconds numeric,
  status text not null default 'created',
  title text,
  file_name text,
  file_type text,
  file_size bigint,
  upload_expires_at timestamptz,
  finalized_at timestamptz,
  attached_at timestamptz,
  deleted_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_video_uploads_provider_check check (provider = 'bunny_stream'),
  constraint social_video_uploads_status_check check (status in ('created', 'uploading', 'uploaded', 'processing', 'ready', 'failed', 'abandoned', 'deleted')),
  constraint social_video_uploads_duration_check check (duration_seconds is null or duration_seconds <= 15.5)
);

create unique index if not exists social_video_uploads_provider_video_id_idx
  on public.social_video_uploads(provider, provider_video_id);

create index if not exists social_video_uploads_orphan_cleanup_idx
  on public.social_video_uploads(status, upload_expires_at, created_at)
  where thread_id is null and deleted_at is null;

alter table public.social_video_uploads enable row level security;

drop policy if exists social_video_uploads_select_own on public.social_video_uploads;
create policy social_video_uploads_select_own
  on public.social_video_uploads for select
  using (auth.uid() = user_id);

drop policy if exists social_video_uploads_service_all on public.social_video_uploads;
create policy social_video_uploads_service_all
  on public.social_video_uploads for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.touch_social_video_uploads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_social_video_uploads_updated_at on public.social_video_uploads;
create trigger touch_social_video_uploads_updated_at
before update on public.social_video_uploads
for each row execute function public.touch_social_video_uploads_updated_at();

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
      coalesce(p.non_social, false) as author_non_social,
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
    ) as has_alert_link,
    r.video_provider,
    r.provider_video_id,
    r.video_playback_url,
    r.video_embed_url,
    r.video_thumbnail_url,
    r.video_preview_url,
    r.video_duration_seconds,
    r.video_status
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

drop function if exists public.get_social_feed_hydration(uuid[]);

create or replace function public.get_social_feed_hydration(
  p_thread_ids uuid[]
)
returns table(
  thread_id uuid,
  share_count integer,
  is_sensitive boolean,
  author_display_name text,
  author_social_id text,
  author_avatar_url text,
  author_is_verified boolean,
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
  video_status text,
  comments jsonb,
  thread_mentions jsonb,
  reply_mentions jsonb
)
language sql
security definer
set search_path = public
as $$
  with target_threads as (
    select
      t.id,
      coalesce(t.clicks, 0)::int as share_count,
      coalesce(t.is_sensitive, false) as is_sensitive,
      p.display_name as author_display_name,
      p.social_id as author_social_id,
      p.avatar_url as author_avatar_url,
      coalesce(p.is_verified, false) as author_is_verified,
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
    where t.id = any(coalesce(p_thread_ids, '{}'::uuid[]))
  ),
  alert_context as (
    select
      a.thread_id,
      a.map_id,
      a.alert_type,
      a.location_district as alert_district,
      (
        (a.map_id is not null)
        or nullif(trim(coalesce(a.alert_type, '')), '') is not null
        or nullif(trim(coalesce(a.location_district, '')), '') is not null
      ) as has_alert_link
    from public.get_social_feed_alert_context(p_thread_ids) a
  ),
  comments_with_author as (
    select
      tc.thread_id,
      jsonb_agg(
        jsonb_build_object(
          'id', tc.id,
          'thread_id', tc.thread_id,
          'content', coalesce(tc.content, ''),
          'images', tc.images,
          'created_at', tc.created_at,
          'user_id', tc.user_id,
          'author',
          case
            when pa.id is null then null
            else jsonb_build_object(
              'display_name', pa.display_name,
              'social_id', pa.social_id,
              'avatar_url', pa.avatar_url
            )
          end
        )
        order by tc.created_at asc
      ) as comments
    from public.thread_comments tc
    left join public.profiles pa on pa.id = tc.user_id
    where tc.thread_id = any(coalesce(p_thread_ids, '{}'::uuid[]))
    group by tc.thread_id
  ),
  post_mentions_agg as (
    select
      pm.post_id as thread_id,
      jsonb_agg(
        jsonb_build_object(
          'start', pm.start_idx,
          'end', pm.end_idx,
          'mentionedUserId', pm.mentioned_user_id,
          'socialIdAtTime', pm.social_id_at_time
        )
        order by pm.start_idx asc
      ) as thread_mentions
    from public.post_mentions pm
    where pm.post_id = any(coalesce(p_thread_ids, '{}'::uuid[]))
    group by pm.post_id
  ),
  reply_mentions_per_reply as (
    select
      tc.thread_id,
      rm.reply_id,
      jsonb_agg(
        jsonb_build_object(
          'start', rm.start_idx,
          'end', rm.end_idx,
          'mentionedUserId', rm.mentioned_user_id,
          'socialIdAtTime', rm.social_id_at_time
        )
        order by rm.start_idx asc
      ) as mentions
    from public.reply_mentions rm
    join public.thread_comments tc on tc.id = rm.reply_id
    where tc.thread_id = any(coalesce(p_thread_ids, '{}'::uuid[]))
    group by tc.thread_id, rm.reply_id
  ),
  reply_mentions_agg as (
    select
      thread_id,
      jsonb_object_agg(reply_id::text, mentions) as reply_mentions
    from reply_mentions_per_reply
    group by thread_id
  )
  select
    tt.id as thread_id,
    tt.share_count,
    tt.is_sensitive,
    tt.author_display_name,
    tt.author_social_id,
    tt.author_avatar_url,
    tt.author_is_verified,
    ac.map_id,
    ac.alert_type,
    ac.alert_district,
    coalesce(ac.has_alert_link, false) as has_alert_link,
    tt.video_provider,
    tt.provider_video_id,
    tt.video_playback_url,
    tt.video_embed_url,
    tt.video_thumbnail_url,
    tt.video_preview_url,
    tt.video_duration_seconds,
    tt.video_status,
    coalesce(cwa.comments, '[]'::jsonb) as comments,
    coalesce(pma.thread_mentions, '[]'::jsonb) as thread_mentions,
    coalesce(rma.reply_mentions, '{}'::jsonb) as reply_mentions
  from target_threads tt
  left join alert_context ac on ac.thread_id = tt.id
  left join comments_with_author cwa on cwa.thread_id = tt.id
  left join post_mentions_agg pma on pma.thread_id = tt.id
  left join reply_mentions_agg rma on rma.thread_id = tt.id;
$$;

revoke all on function public.get_social_feed_hydration(uuid[]) from public;
grant execute on function public.get_social_feed_hydration(uuid[]) to authenticated;
grant execute on function public.get_social_feed_hydration(uuid[]) to service_role;
