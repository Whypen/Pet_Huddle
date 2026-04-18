create table if not exists public.social_feed_events (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'impression',
      'dwell_10s',
      'expand_post',
      'open_comments',
      'profile_view',
      'like',
      'comment',
      'save',
      'share',
      'hide',
      'block'
    )
  ),
  session_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.social_feed_events enable row level security;

revoke all on public.social_feed_events from public;
revoke all on public.social_feed_events from anon;
revoke all on public.social_feed_events from authenticated;

create index if not exists social_feed_events_viewer_created_idx
  on public.social_feed_events(viewer_id, created_at desc);

create index if not exists social_feed_events_thread_created_idx
  on public.social_feed_events(thread_id, created_at desc);

create index if not exists social_feed_events_author_created_idx
  on public.social_feed_events(author_id, created_at desc);

create index if not exists social_feed_events_viewer_author_created_idx
  on public.social_feed_events(viewer_id, author_id, created_at desc);

create unique index if not exists social_feed_events_session_dedupe_idx
  on public.social_feed_events(viewer_id, thread_id, session_id, event_type)
  where session_id is not null and event_type in ('impression', 'dwell_10s');

drop function if exists public.record_social_feed_event(uuid, text, uuid, jsonb);

create or replace function public.record_social_feed_event(
  p_thread_id uuid,
  p_event_type text,
  p_session_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_author_id uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  if v_event_type not in (
    'impression',
    'dwell_10s',
    'expand_post',
    'open_comments',
    'profile_view',
    'like',
    'comment',
    'save',
    'share',
    'hide',
    'block'
  ) then
    raise exception 'invalid_event_type';
  end if;

  select t.user_id
  into v_author_id
  from public.threads t
  join public.profiles p on p.id = t.user_id
  where t.id = p_thread_id
    and coalesce(p.non_social, false) = false;

  if v_author_id is null then
    return false;
  end if;

  begin
    insert into public.social_feed_events (
      viewer_id,
      thread_id,
      author_id,
      event_type,
      session_id,
      metadata
    )
    values (
      v_uid,
      p_thread_id,
      v_author_id,
      v_event_type,
      p_session_id,
      coalesce(p_metadata, '{}'::jsonb)
    );
    return true;
  exception
    when unique_violation then
      return false;
  end;
end;
$$;

revoke all on function public.record_social_feed_event(uuid, text, uuid, jsonb) from public;
grant execute on function public.record_social_feed_event(uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.record_social_feed_event(uuid, text, uuid, jsonb) to service_role;

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
  author_non_social boolean
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
    select
      p.id,
      p.location_country
    from public.profiles p
    where p.id = v_uid
  ),
  viewer_hidden as (
    select distinct sfe.thread_id
    from public.social_feed_events sfe
    where sfe.viewer_id = v_uid
      and sfe.event_type = 'hide'
  ),
  support_counts as (
    select ts.thread_id, count(*)::int as cnt
    from public.thread_supports ts
    group by ts.thread_id
  ),
  comment_counts as (
    select tc.thread_id, count(*)::int as cnt
    from public.thread_comments tc
    group by tc.thread_id
  ),
  author_affinity as (
    select
      sfe.author_id,
      sum(
        (
          case sfe.event_type
            when 'comment' then 1.00
            when 'share' then 0.90
            when 'like' then 0.45
            when 'profile_view' then 0.30
            when 'open_comments' then 0.25
            when 'expand_post' then 0.15
            when 'dwell_10s' then 0.12
            when 'impression' then 0.02
            else 0.00
          end
        ) *
        (
          case
            when sfe.created_at >= now() - interval '7 days' then 1.00
            when sfe.created_at >= now() - interval '21 days' then 0.70
            else 0.40
          end
        )
      )::numeric as affinity_score
    from public.social_feed_events sfe
    where sfe.viewer_id = v_uid
      and sfe.created_at >= now() - interval '45 days'
      and sfe.event_type in (
        'comment',
        'share',
        'like',
        'profile_view',
        'open_comments',
        'expand_post',
        'dwell_10s',
        'impression'
      )
    group by sfe.author_id
  ),
  thread_event_totals as (
    select
      sfe.thread_id,
      count(*) filter (where sfe.event_type = 'impression')::int as impression_count,
      sum(
        case sfe.event_type
          when 'comment' then 1.00
          when 'share' then 0.90
          when 'like' then 0.40
          when 'open_comments' then 0.20
          when 'expand_post' then 0.15
          when 'dwell_10s' then 0.10
          else 0.00
        end
      )::numeric as weighted_interactions
    from public.social_feed_events sfe
    where sfe.created_at >= now() - interval '30 days'
      and sfe.event_type in (
        'impression',
        'comment',
        'share',
        'like',
        'open_comments',
        'expand_post',
        'dwell_10s'
      )
    group by sfe.thread_id
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
      coalesce(cc.cnt, 0)::int as comment_count,
      coalesce(t.clicks, 0)::int as share_count,
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
    left join comment_counts cc on cc.thread_id = t.id
    join viewer v on true
    where coalesce(p.non_social, false) = false
      and not public.is_user_blocked(v.id, t.user_id)
      and public.is_in_scope(v.id, t.user_id)
      and not exists (
        select 1
        from viewer_hidden vh
        where vh.thread_id = t.id
      )
  ),
  ranked as (
    select
      b.*,
      coalesce(aa.affinity_score, 0)::numeric as author_affinity_score,
      (
        (
          coalesce(tet.weighted_interactions, 0)
          + (coalesce(b.comment_count, 0)::numeric * 0.08)
          + (coalesce(b.share_count, 0)::numeric * 0.07)
          + (coalesce(b.like_count, 0)::numeric * 0.03)
        )
        / greatest(coalesce(tet.impression_count, 0) + 10, 10)::numeric
      )::numeric as post_quality_score,
      (
        (greatest(0, 168 - (extract(epoch from (now() - b.created_at)) / 3600.0)) / 168.0) * 10.0
      )::numeric as recency_score,
      (
        least(
          4.0,
          (coalesce(b.like_count, 0)::numeric * 0.08)
          + (coalesce(b.comment_count, 0)::numeric * 0.16)
          + (coalesce(b.share_count, 0)::numeric * 0.18)
        )
      )::numeric as legacy_signal_score,
      (
        case
          when coalesce(aa.affinity_score, 0) < 0.20
            and b.created_at >= now() - interval '72 hours'
            and (
              (
                coalesce(tet.weighted_interactions, 0)
                + (coalesce(b.comment_count, 0)::numeric * 0.08)
                + (coalesce(b.share_count, 0)::numeric * 0.07)
                + (coalesce(b.like_count, 0)::numeric * 0.03)
              ) / greatest(coalesce(tet.impression_count, 0) + 10, 10)::numeric
            ) >= 0.05
          then case
            when lower(coalesce((select location_country from viewer), '')) = lower(coalesce(b.author_location_country, '')) then 0.08
            else 0.03
          end
          else 0.00
        end
      )::numeric as exploration_bonus
    from base b
    left join author_affinity aa on aa.author_id = b.user_id
    left join thread_event_totals tet on tet.thread_id = b.id
    where (
      lower(coalesce(p_sort, 'latest')) <> 'trending'
      or b.created_at >= now() - interval '7 days'
    )
  ),
  scored as (
    select
      r.*,
      (
        r.recency_score
        + (least(r.author_affinity_score, 6.0) * 0.20)
        + (least(r.post_quality_score, 6.0) * 0.18)
        + (r.legacy_signal_score * 0.12)
        + r.exploration_bonus
      )::numeric as computed_score
    from ranked r
  ),
  filtered as (
    select *
    from scored r
    where (
      lower(coalesce(p_sort, 'latest')) <> 'trending'
      and (
        p_cursor is null
        or (r.created_at, r.id) < (
          coalesce((p_cursor->>'created_at')::timestamptz, 'infinity'::timestamptz),
          coalesce((p_cursor->>'id')::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
        )
      )
    ) or (
      lower(coalesce(p_sort, 'latest')) = 'trending'
      and (
        p_cursor is null
        or (
          r.computed_score,
          r.created_at,
          r.id
        ) < (
          coalesce((p_cursor->>'score')::numeric, 1000000000::numeric),
          coalesce((p_cursor->>'created_at')::timestamptz, 'infinity'::timestamptz),
          coalesce((p_cursor->>'id')::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
        )
      )
    )
  )
  select
    s.id,
    s.user_id,
    s.title,
    s.content,
    s.tags,
    s.hashtags,
    s.images,
    s.created_at,
    s.like_count,
    s.support_count,
    s.comment_count,
    case when lower(coalesce(p_sort, 'latest')) = 'trending' then s.computed_score else null end as score,
    s.author_display_name,
    s.author_avatar_url,
    s.author_verification_status,
    s.author_location_country,
    s.author_last_lat,
    s.author_last_lng,
    s.author_non_social
  from filtered s
  order by
    case when lower(coalesce(p_sort, 'latest')) = 'trending' then s.computed_score end desc nulls last,
    s.created_at desc,
    s.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all on function public.get_social_feed(uuid, text, integer, jsonb) from public;
grant all on function public.get_social_feed(uuid, text, integer, jsonb) to authenticated;
grant all on function public.get_social_feed(uuid, text, integer, jsonb) to service_role;
