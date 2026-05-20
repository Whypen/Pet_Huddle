create or replace function public.get_native_matched_rail_summary(p_limit integer default 500)
returns table(
  peer_user_id uuid,
  display_name text,
  avatar_url text,
  social_id text,
  is_verified boolean,
  verification_status text,
  chat_id uuid,
  matched_at timestamptz
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
    raise exception 'not_authenticated';
  end if;

  return query
  select
    case when m.user1_id = v_uid then m.user2_id else m.user1_id end as peer_user_id,
    p.display_name,
    p.avatar_url,
    p.social_id,
    coalesce(p.is_verified, p.verification_status = 'verified'::public.verification_status_enum) as is_verified,
    p.verification_status::text,
    m.chat_id,
    coalesce(m.matched_at, m.last_interaction_at) as matched_at
  from public.matches m
  join public.profiles p
    on p.id = case when m.user1_id = v_uid then m.user2_id else m.user1_id end
  where coalesce(m.is_active, true) = true
    and (m.user1_id = v_uid or m.user2_id = v_uid)
    and coalesce(p.non_social, false) = false
    and not public.is_user_blocked(v_uid, p.id)
  order by coalesce(m.matched_at, m.last_interaction_at) desc nulls last
  limit greatest(1, least(coalesce(p_limit, 500), 500));
end;
$$;

revoke all on function public.get_native_matched_rail_summary(integer) from public, anon;
grant execute on function public.get_native_matched_rail_summary(integer) to authenticated;
grant execute on function public.get_native_matched_rail_summary(integer) to service_role;

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
    and coalesce(p.non_social, false) = false
    and not public.is_user_blocked(v_uid, t.user_id)
    and public.is_in_scope(v_uid, t.user_id)
  limit 1;
end;
$$;

revoke all on function public.get_native_social_thread_by_id(uuid) from public, anon;
grant execute on function public.get_native_social_thread_by_id(uuid) to authenticated;
grant execute on function public.get_native_social_thread_by_id(uuid) to service_role;

