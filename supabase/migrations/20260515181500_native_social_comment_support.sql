create table if not exists public.thread_comment_supports (
  comment_id uuid not null references public.thread_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.thread_comment_supports enable row level security;

create index if not exists idx_thread_comment_supports_user_id
  on public.thread_comment_supports(user_id);

revoke all on table public.thread_comment_supports from public, anon, authenticated;
grant all on table public.thread_comment_supports to service_role;

drop function if exists public.get_native_social_comments(uuid, timestamptz, integer);

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
  reply_mentions jsonb,
  support_count integer,
  viewer_supported boolean
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
    ) as reply_mentions,
    (select count(*)::integer from public.thread_comment_supports tcs where tcs.comment_id = tc.id) as support_count,
    exists (
      select 1
      from public.thread_comment_supports tcs
      where tcs.comment_id = tc.id
        and tcs.user_id = auth.uid()
    ) as viewer_supported
  from comments_asc tc
  left join public.profiles p on p.id = tc.user_id;
$$;

revoke all on function public.get_native_social_comments(uuid, timestamptz, integer) from public, anon;
grant execute on function public.get_native_social_comments(uuid, timestamptz, integer) to authenticated, service_role;

create or replace function public.set_native_social_comment_support(p_comment_id uuid, p_supported boolean)
returns table(support_count integer, supported boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_thread_author_id uuid;
  v_comment_author_id uuid;
begin
  if v_uid is null then
    raise exception 'missing_access_token';
  end if;

  select t.user_id, tc.user_id
  into v_thread_author_id, v_comment_author_id
  from public.thread_comments tc
  join public.threads t on t.id = tc.thread_id
  where tc.id = p_comment_id;

  if v_thread_author_id is null then
    raise exception 'comment_not_found';
  end if;

  if public.is_user_blocked(v_uid, v_thread_author_id) or public.is_user_blocked(v_uid, v_comment_author_id) then
    raise exception 'comment_not_visible';
  end if;

  if coalesce(p_supported, false) then
    insert into public.thread_comment_supports (comment_id, user_id)
    values (p_comment_id, v_uid)
    on conflict do nothing;
  else
    delete from public.thread_comment_supports
    where comment_id = p_comment_id
      and user_id = v_uid;
  end if;

  return query
  select
    (select count(*)::integer from public.thread_comment_supports tcs where tcs.comment_id = p_comment_id),
    exists (
      select 1
      from public.thread_comment_supports tcs
      where tcs.comment_id = p_comment_id
        and tcs.user_id = v_uid
    );
end;
$$;

revoke all on function public.set_native_social_comment_support(uuid, boolean) from public, anon;
grant execute on function public.set_native_social_comment_support(uuid, boolean) to authenticated, service_role;
