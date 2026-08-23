-- Keep the public Social projection on the app's ranking contract without
-- aggregating every support/comment row before the feed limit is applied.
create index if not exists idx_thread_supports_thread_id
  on public.thread_supports (thread_id);

drop function if exists public.get_public_social_feed(integer, jsonb);

create or replace function public.get_public_social_feed(
  p_limit integer default 20,
  p_cursor jsonb default null
)
returns table(
  id uuid,
  title text,
  content text,
  images text[],
  likes integer,
  comment_count integer,
  share_count integer,
  created_at timestamptz,
  category text,
  tags text[],
  hashtags text[],
  author_name text,
  author_avatar_url text,
  author_social_id text,
  author_verification_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as materialized (
    select t.*, p.display_name, p.avatar_url, p.social_id, p.verification_status
    from public.threads t
    join public.profiles p on p.id = t.user_id
    where coalesce(t.is_public, true) = true
      and coalesce(t.is_sensitive, false) = false
      and coalesce(p.non_social, false) = false
      and lower(coalesce(p.account_status::text, 'active')) = 'active'
      and not public.is_user_restriction_active(t.user_id, 'social_hidden', now())
      and (
        nullif(btrim(coalesce(p_cursor->>'country', '')), '') is null
        or public.normalize_country_key(t.post_country) = public.normalize_country_key(p_cursor->>'country')
      )
      and (
        lower(coalesce(p_cursor->>'sort', 'latest')) <> 'trending'
        or t.created_at >= now() - interval '7 days'
      )
      and (
        nullif(p_cursor->>'created_at', '') is null
        or (t.created_at, t.id) < (
          (p_cursor->>'created_at')::timestamptz,
          coalesce(nullif(p_cursor->>'id', '')::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
        )
      )
  ),
  scored as (
    select
      c.id,
      c.title,
      c.content,
      coalesce(c.images, '{}'::text[]) as images,
      coalesce(sc.count, 0)::integer as support_count,
      coalesce(cc.count, 0)::integer as comment_count,
      greatest(coalesce(c.clicks, 0), 0)::integer as share_count,
      c.created_at,
      coalesce(nullif(btrim(c.tags[1]), ''), 'Social') as category,
      coalesce(c.tags, '{}'::text[]) as tags,
      coalesce(c.hashtags, '{}'::text[]) as hashtags,
      coalesce(nullif(btrim(c.display_name), ''), 'huddle member') as author_name,
      nullif(btrim(c.avatar_url), '') as author_avatar_url,
      nullif(btrim(c.social_id), '') as author_social_id,
      nullif(btrim(c.verification_status::text), '') as author_verification_status,
      (
        (coalesce(sc.count, 0) * 2) +
        (coalesce(cc.count, 0) * 3) +
        coalesce(sc.count, 0) -
        ((extract(epoch from (now() - c.created_at)) / 3600.0) * 0.10)
      )::numeric as computed_score
    from candidates c
    left join lateral (
      select count(*)::integer as count
      from public.thread_supports ts
      where ts.thread_id = c.id
    ) sc on true
    left join lateral (
      select count(*)::integer as count
      from public.thread_comments tc
      where tc.thread_id = c.id
    ) cc on true
  )
  select
    s.id, s.title, s.content, s.images, s.support_count, s.comment_count,
    s.share_count, s.created_at, s.category, s.tags, s.hashtags, s.author_name,
    s.author_avatar_url, s.author_social_id, s.author_verification_status
  from scored s
  order by
    case when lower(coalesce(p_cursor->>'sort', 'latest')) = 'trending' then s.computed_score end desc nulls last,
    s.created_at desc,
    s.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.get_public_social_feed(integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_social_feed(integer, jsonb)
  to anon, authenticated, service_role;
