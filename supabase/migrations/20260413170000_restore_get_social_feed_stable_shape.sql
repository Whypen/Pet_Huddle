-- Emergency restore: revert get_social_feed to previous stable return shape.
-- NoticeBoard hydrates map_id/alert_type from threads separately.

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
    r.author_non_social
  from ranked r
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
