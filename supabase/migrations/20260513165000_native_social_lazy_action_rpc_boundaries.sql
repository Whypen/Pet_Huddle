alter table public.thread_comments
  add column if not exists parent_comment_id uuid references public.thread_comments(id) on delete cascade,
  add column if not exists updated_at timestamptz default now();

-- Native Social lazy/action exact-token boundaries.

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
    where t.id = p_thread_id
      and auth.uid() is not null
      and not public.is_user_blocked(auth.uid(), t.user_id)
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

create or replace function public.create_native_social_thread(
  p_title text,
  p_content text,
  p_category text,
  p_images text[] default '{}'::text[],
  p_is_sensitive boolean default false,
  p_video jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_thread_id uuid;
begin
  if v_uid is null then raise exception 'missing_access_token'; end if;

  insert into public.threads (
    title,
    content,
    tags,
    images,
    user_id,
    is_sensitive,
    is_public,
    video_provider,
    provider_video_id,
    video_playback_url,
    video_embed_url,
    video_thumbnail_url,
    video_preview_url,
    video_duration_seconds,
    video_status
  )
  values (
    coalesce(nullif(trim(p_title), ''), 'Social'),
    coalesce(p_content, ''),
    array[coalesce(nullif(trim(p_category), ''), 'Social')],
    coalesce(p_images, '{}'::text[]),
    v_uid,
    coalesce(p_is_sensitive, false),
    true,
    nullif(p_video->>'provider', ''),
    nullif(p_video->>'providerVideoId', ''),
    nullif(p_video->>'playbackUrl', ''),
    nullif(p_video->>'embedUrl', ''),
    nullif(p_video->>'thumbnailUrl', ''),
    nullif(p_video->>'previewUrl', ''),
    nullif(p_video->>'duration', '')::numeric,
    nullif(p_video->>'status', '')
  )
  returning id into v_thread_id;

  return v_thread_id;
end;
$$;

revoke all on function public.create_native_social_thread(text, text, text, text[], boolean, jsonb) from public, anon;
grant execute on function public.create_native_social_thread(text, text, text, text[], boolean, jsonb) to authenticated;

create or replace function public.update_native_social_thread(
  p_thread_id uuid,
  p_title text,
  p_content text,
  p_category text,
  p_images text[] default null,
  p_is_sensitive boolean default false,
  p_video jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_thread_id uuid;
begin
  if v_uid is null then raise exception 'missing_access_token'; end if;

  update public.threads
  set
    title = coalesce(nullif(trim(p_title), ''), title),
    content = coalesce(p_content, content),
    tags = array[coalesce(nullif(trim(p_category), ''), 'Social')],
    images = coalesce(p_images, images),
    is_sensitive = coalesce(p_is_sensitive, false),
    video_provider = coalesce(nullif(p_video->>'provider', ''), video_provider),
    provider_video_id = coalesce(nullif(p_video->>'providerVideoId', ''), provider_video_id),
    video_playback_url = coalesce(nullif(p_video->>'playbackUrl', ''), video_playback_url),
    video_embed_url = coalesce(nullif(p_video->>'embedUrl', ''), video_embed_url),
    video_thumbnail_url = coalesce(nullif(p_video->>'thumbnailUrl', ''), video_thumbnail_url),
    video_preview_url = coalesce(nullif(p_video->>'previewUrl', ''), video_preview_url),
    video_duration_seconds = coalesce(nullif(p_video->>'duration', '')::numeric, video_duration_seconds),
    video_status = coalesce(nullif(p_video->>'status', ''), video_status)
  where id = p_thread_id
    and user_id = v_uid
  returning id into v_thread_id;

  if v_thread_id is null then raise exception 'thread_update_forbidden'; end if;
  return v_thread_id;
end;
$$;

revoke all on function public.update_native_social_thread(uuid, text, text, text, text[], boolean, jsonb) from public, anon;
grant execute on function public.update_native_social_thread(uuid, text, text, text, text[], boolean, jsonb) to authenticated;

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
    select 1 from public.threads t
    where t.id = p_thread_id
      and not public.is_user_blocked(v_uid, t.user_id)
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

create or replace function public.update_native_social_comment(p_comment_id uuid, p_content text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'missing_access_token'; end if;
  update public.thread_comments
  set content = coalesce(p_content, ''), text = coalesce(p_content, '')
  where id = p_comment_id and user_id = auth.uid();
  if not found then raise exception 'comment_update_forbidden'; end if;
  return true;
end;
$$;

revoke all on function public.update_native_social_comment(uuid, text) from public, anon;
grant execute on function public.update_native_social_comment(uuid, text) to authenticated;

create or replace function public.delete_native_social_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'missing_access_token'; end if;
  delete from public.thread_comments
  where id = p_comment_id and user_id = auth.uid();
  if not found then raise exception 'comment_delete_forbidden'; end if;
  return true;
end;
$$;

revoke all on function public.delete_native_social_comment(uuid) from public, anon;
grant execute on function public.delete_native_social_comment(uuid) to authenticated;

create or replace function public.replace_native_social_reply_mentions(p_reply_id uuid, p_mentions jsonb default '[]'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'missing_access_token'; end if;
  if not exists (select 1 from public.thread_comments where id = p_reply_id and user_id = auth.uid()) then
    raise exception 'reply_mentions_forbidden';
  end if;
  delete from public.reply_mentions where reply_id = p_reply_id;
  insert into public.reply_mentions (reply_id, mentioned_user_id, start_idx, end_idx, social_id_at_time)
  select
    p_reply_id,
    (entry->>'mentionedUserId')::uuid,
    coalesce((entry->>'start')::integer, 0),
    coalesce((entry->>'end')::integer, 0),
    coalesce(entry->>'socialIdAtTime', '')
  from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) entry
  where nullif(entry->>'mentionedUserId', '') is not null;
  return true;
end;
$$;

revoke all on function public.replace_native_social_reply_mentions(uuid, jsonb) from public, anon;
grant execute on function public.replace_native_social_reply_mentions(uuid, jsonb) to authenticated;

create or replace function public.replace_native_social_post_mentions(p_post_id uuid, p_mentions jsonb default '[]'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'missing_access_token'; end if;
  if not exists (select 1 from public.threads where id = p_post_id and user_id = auth.uid()) then
    raise exception 'post_mentions_forbidden';
  end if;
  delete from public.post_mentions where post_id = p_post_id;
  insert into public.post_mentions (post_id, mentioned_user_id, start_idx, end_idx, social_id_at_time)
  select
    p_post_id,
    (entry->>'mentionedUserId')::uuid,
    coalesce((entry->>'start')::integer, 0),
    coalesce((entry->>'end')::integer, 0),
    coalesce(entry->>'socialIdAtTime', '')
  from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) entry
  where nullif(entry->>'mentionedUserId', '') is not null;
  return true;
end;
$$;

revoke all on function public.replace_native_social_post_mentions(uuid, jsonb) from public, anon;
grant execute on function public.replace_native_social_post_mentions(uuid, jsonb) to authenticated;

create or replace function public.resolve_native_social_mentions(p_social_ids text[])
returns table(id uuid, social_id text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.social_id
  from public.profiles p
  where auth.uid() is not null
    and p.social_id = any(coalesce(p_social_ids, '{}'::text[]))
    and coalesce(p.non_social, false) = false;
$$;

revoke all on function public.resolve_native_social_mentions(text[]) from public, anon;
grant execute on function public.resolve_native_social_mentions(text[]) to authenticated;

create or replace function public.search_native_social_mentions(
  p_query text default '',
  p_exclude_user_id uuid default null,
  p_limit integer default 10
)
returns table(id uuid, social_id text, display_name text, avatar_url text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.social_id, p.display_name, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.social_id is not null
    and p.id <> coalesce(p_exclude_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(p.non_social, false) = false
    and (
      coalesce(trim(p_query), '') = ''
      or lower(p.social_id) like lower(trim(p_query)) || '%'
      or lower(coalesce(p.display_name, '')) like lower(trim(p_query)) || '%'
      or (length(trim(p_query)) >= 2 and lower(p.social_id) like '%' || lower(trim(p_query)) || '%')
      or (length(trim(p_query)) >= 2 and lower(coalesce(p.display_name, '')) like '%' || lower(trim(p_query)) || '%')
    )
  order by
    case when lower(p.social_id) = lower(trim(p_query)) then 0 else 1 end,
    p.display_name nulls last,
    p.social_id
  limit greatest(1, least(coalesce(p_limit, 10), 10));
$$;

revoke all on function public.search_native_social_mentions(text, uuid, integer) from public, anon;
grant execute on function public.search_native_social_mentions(text, uuid, integer) to authenticated;

create or replace function public.set_native_social_support(p_thread_id uuid, p_supported_before boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'missing_access_token'; end if;

  if coalesce(p_supported_before, false) then
    delete from public.thread_supports where thread_id = p_thread_id and user_id = v_uid;
  else
    insert into public.thread_supports (thread_id, user_id)
    values (p_thread_id, v_uid)
    on conflict do nothing;
  end if;

  select count(*)::integer into v_count
  from public.thread_supports
  where thread_id = p_thread_id;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.set_native_social_support(uuid, boolean) from public, anon;
grant execute on function public.set_native_social_support(uuid, boolean) to authenticated;

create or replace function public.get_native_social_block_relationship(p_target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks ub
    where auth.uid() is not null
      and (
        (ub.blocker_id = auth.uid() and ub.blocked_id = p_target_user_id)
        or (ub.blocker_id = p_target_user_id and ub.blocked_id = auth.uid())
      )
  );
$$;

revoke all on function public.get_native_social_block_relationship(uuid) from public, anon;
grant execute on function public.get_native_social_block_relationship(uuid) to authenticated;

create or replace function public.upsert_notification_window(
  p_actor_id uuid,
  p_actor_name text,
  p_category text,
  p_href text,
  p_kind text,
  p_owner_user_id uuid,
  p_subject_id uuid,
  p_subject_type text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_actor_id then raise exception 'notification_actor_forbidden'; end if;
  perform public.upsert_notification_window_internal(
    p_owner_user_id,
    p_subject_id,
    p_subject_type,
    p_kind,
    p_category,
    p_href,
    p_actor_id,
    coalesce(nullif(trim(p_actor_name), ''), 'Someone')
  );
  return true;
end;
$$;

revoke all on function public.upsert_notification_window(uuid, text, text, text, text, uuid, uuid, text) from public, anon;
grant execute on function public.upsert_notification_window(uuid, text, text, text, text, uuid, uuid, text) to authenticated;

drop function if exists public.create_thread_mention_notifications(uuid, uuid, uuid[]);

create or replace function public.create_thread_mention_notifications(
  p_actor_id uuid,
  p_thread_id uuid,
  p_recipient_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_actor_name text;
begin
  if auth.uid() is null or auth.uid() <> p_actor_id then raise exception 'mention_actor_forbidden'; end if;
  select coalesce(display_name, 'Someone') into v_actor_name from public.profiles where id = p_actor_id;
  foreach v_recipient in array coalesce(p_recipient_ids, '{}'::uuid[]) loop
    perform public.upsert_notification_window_internal(
      v_recipient,
      p_thread_id,
      'thread',
      'comment',
      'social',
      '/social?focus=' || p_thread_id,
      p_actor_id,
      coalesce(v_actor_name, 'Someone')
    );
  end loop;
  return true;
end;
$$;

revoke all on function public.create_thread_mention_notifications(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.create_thread_mention_notifications(uuid, uuid, uuid[]) to authenticated;

create or replace function public.send_native_social_share_to_chat(p_chat_id uuid, p_content text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'missing_access_token'; end if;
  if not exists (
    select 1 from public.chat_room_members crm
    where crm.chat_id = p_chat_id and crm.user_id = auth.uid()
  ) then
    raise exception 'share_target_forbidden';
  end if;

  insert into public.chat_messages (chat_id, sender_id, content)
  values (p_chat_id, auth.uid(), coalesce(p_content, ''));
  return true;
end;
$$;

revoke all on function public.send_native_social_share_to_chat(uuid, text) from public, anon;
grant execute on function public.send_native_social_share_to_chat(uuid, text) to authenticated;
