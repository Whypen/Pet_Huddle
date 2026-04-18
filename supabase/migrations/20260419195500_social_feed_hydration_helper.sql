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
      coalesce(p.is_verified, false) as author_is_verified
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
