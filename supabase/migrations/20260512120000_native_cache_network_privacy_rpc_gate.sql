-- Native cache/network/privacy hard gate.
-- Forward-only repair: current filesystem is source of truth; do not rely on git restore.

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
      t.updated_at,
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
    ac.map_id,
    ac.alert_type,
    ac.location_district as alert_district,
    (ac.map_id is not null or nullif(btrim(coalesce(ac.alert_type, '')), '') is not null or nullif(btrim(coalesce(ac.location_district, '')), '') is not null) as has_alert_link,
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

revoke all on function public.get_social_feed(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.get_social_feed(uuid, text, integer, jsonb) to authenticated;
grant execute on function public.get_social_feed(uuid, text, integer, jsonb) to service_role;

drop function if exists public.get_social_feed_hydration(uuid[]);

create or replace function public.get_social_feed_hydration(p_thread_ids uuid[])
returns table(
  thread_id uuid,
  share_count integer,
  is_sensitive boolean,
  author_display_name text,
  author_social_id text,
  author_avatar_url text,
  author_is_verified boolean,
  author_verification_status text,
  author_location_country text,
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
      p.verification_status::text as author_verification_status,
      p.location_country as author_location_country,
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
      and auth.uid() is not null
      and not public.is_user_blocked(auth.uid(), t.user_id)
  ),
  alert_context as (
    select
      a.thread_id,
      a.map_id,
      a.alert_type,
      a.location_district as alert_district,
      ((a.map_id is not null) or nullif(trim(coalesce(a.alert_type, '')), '') is not null or nullif(trim(coalesce(a.location_district, '')), '') is not null) as has_alert_link
    from public.get_social_feed_alert_context(p_thread_ids) a
  ),
  comments_limited as (
    select *
    from (
      select
        tc.*,
        row_number() over (partition by tc.thread_id order by tc.created_at desc, tc.id desc) as rn
      from public.thread_comments tc
      where tc.thread_id = any(coalesce(p_thread_ids, '{}'::uuid[]))
    ) ranked_comments
    where rn <= 5
  ),
  comments_with_author as (
    select
      tc.thread_id,
      jsonb_agg(
        jsonb_build_object(
          'id', tc.id,
          'thread_id', tc.thread_id,
          'parent_comment_id', tc.parent_comment_id,
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
              'avatar_url', pa.avatar_url,
              'is_verified', coalesce(pa.is_verified, false),
              'verification_status', pa.verification_status::text,
              'location_country', pa.location_country
            )
          end
        )
        order by tc.created_at asc
      ) as comments
    from comments_limited tc
    left join public.profiles pa on pa.id = tc.user_id
    group by tc.thread_id
  ),
  post_mentions_agg as (
    select
      pm.post_id as thread_id,
      jsonb_agg(jsonb_build_object('start', pm.start_idx, 'end', pm.end_idx, 'mentionedUserId', pm.mentioned_user_id, 'socialIdAtTime', pm.social_id_at_time) order by pm.start_idx asc) as thread_mentions
    from public.post_mentions pm
    where pm.post_id = any(coalesce(p_thread_ids, '{}'::uuid[]))
    group by pm.post_id
  ),
  reply_mentions_per_reply as (
    select
      tc.thread_id,
      rm.reply_id,
      jsonb_agg(jsonb_build_object('start', rm.start_idx, 'end', rm.end_idx, 'mentionedUserId', rm.mentioned_user_id, 'socialIdAtTime', rm.social_id_at_time) order by rm.start_idx asc) as mentions
    from public.reply_mentions rm
    join comments_limited tc on tc.id = rm.reply_id
    group by tc.thread_id, rm.reply_id
  ),
  reply_mentions_agg as (
    select thread_id, jsonb_object_agg(reply_id::text, mentions) as reply_mentions
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
    tt.author_verification_status,
    tt.author_location_country,
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

revoke all on function public.get_social_feed_hydration(uuid[]) from public, anon;
grant execute on function public.get_social_feed_hydration(uuid[]) to authenticated;
grant execute on function public.get_social_feed_hydration(uuid[]) to service_role;

create table if not exists public.storage_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  object_path text not null,
  reason text not null,
  requested_by uuid,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.storage_cleanup_queue enable row level security;

drop policy if exists "storage_cleanup_queue_service_role_only" on public.storage_cleanup_queue;
create policy "storage_cleanup_queue_service_role_only"
on public.storage_cleanup_queue
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace function public.request_storage_cleanup(
  p_bucket text,
  p_object_path text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bucket text := lower(btrim(coalesce(p_bucket, '')));
  v_path text := btrim(coalesce(p_object_path, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_bucket not in ('notices', 'social_album', 'alerts', 'chat_attachments', 'profile_photos', 'profiles') then
    raise exception 'invalid_bucket';
  end if;

  v_path := regexp_replace(split_part(v_path, '?', 1), '^/+', '');
  if v_path = '' or v_path like '%..%' then
    raise exception 'invalid_object_path';
  end if;

  if v_path not like v_uid::text || '/%' then
    raise exception 'object_path_owner_mismatch';
  end if;

  insert into public.storage_cleanup_queue(bucket, object_path, reason, requested_by)
  values (v_bucket, v_path, nullif(v_reason, ''), v_uid)
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.request_storage_cleanup(text, text, text) from public, anon;
grant execute on function public.request_storage_cleanup(text, text, text) to authenticated;

create or replace function public.delete_social_thread(p_thread_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_media text[];
  v_path text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select t.user_id into v_owner_id
  from public.threads t
  where t.id = p_thread_id
  for update;

  if v_owner_id is null then
    return false;
  end if;

  if v_owner_id <> v_uid then
    raise exception 'forbidden';
  end if;

  select coalesce(array_agg(distinct media_url), '{}'::text[])
  into v_media
  from (
    select unnest(coalesce(t.images, '{}'::text[])) as media_url
    from public.threads t
    where t.id = p_thread_id
    union all
    select unnest(coalesce(tc.images, '{}'::text[])) as media_url
    from public.thread_comments tc
    where tc.thread_id = p_thread_id
  ) media
  where nullif(btrim(media_url), '') is not null;

  delete from public.reply_mentions rm
  using public.thread_comments tc
  where rm.reply_id = tc.id
    and tc.thread_id = p_thread_id;

  delete from public.post_mentions where post_id = p_thread_id;
  delete from public.thread_supports where thread_id = p_thread_id;
  delete from public.thread_comments where thread_id = p_thread_id;
  delete from public.threads where id = p_thread_id and user_id = v_uid;

  foreach v_path in array coalesce(v_media, '{}'::text[]) loop
    v_path := regexp_replace(split_part(v_path, '?', 1), '^.*/storage/v1/object/public/(notices|social_album|social-album)/', '');
    v_path := regexp_replace(v_path, '^/+', '');
    if v_path <> '' and v_path not like '%..%' and v_path like v_uid::text || '/%' then
      insert into public.storage_cleanup_queue(bucket, object_path, reason, requested_by)
      values ('notices', v_path, 'delete_social_thread', v_uid);
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.delete_social_thread(uuid) from public, anon;
grant execute on function public.delete_social_thread(uuid) to authenticated;

create or replace function public.get_share_targets()
returns table(
  chat_id uuid,
  room_type text,
  name text,
  avatar text,
  social_id text,
  user_id uuid,
  last_message_preview text,
  last_message_at timestamptz,
  interaction_score numeric
)
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  my_rooms as (
    select c.*
    from public.chats c
    join public.chat_room_members crm on crm.chat_id = c.id
    join viewer v on v.user_id = crm.user_id
    where v.user_id is not null
  ),
  room_peers as (
    select
      r.id as chat_id,
      r.type as room_type,
      peer.user_id as peer_user_id,
      coalesce(r.last_message_at, r.created_at) as activity_at,
      case when sc.chat_id is not null then true else false end as is_service,
      r.name as room_name,
      r.avatar_url as room_avatar,
      null::text as last_message_preview
    from my_rooms r
    left join public.service_chats sc on sc.chat_id = r.id
    left join lateral (
      select crm.user_id
      from public.chat_room_members crm
      join viewer v on true
      where crm.chat_id = r.id and crm.user_id <> v.user_id
      order by crm.created_at asc nulls last
      limit 1
    ) peer on true
  )
  select
    rp.chat_id,
    case when rp.room_type = 'group' then 'group' when rp.is_service then 'service' else 'direct' end as room_type,
    case when rp.room_type = 'group' then coalesce(rp.room_name, 'Group chat') else coalesce(p.display_name, rp.room_name, 'Conversation') end as name,
    case when rp.room_type = 'group' then rp.room_avatar else coalesce(p.avatar_url, rp.room_avatar) end as avatar,
    case when rp.room_type = 'group' then null else p.social_id end as social_id,
    case when rp.room_type = 'group' then null else rp.peer_user_id end as user_id,
    nullif(left(coalesce(rp.last_message_preview, ''), 160), '') as last_message_preview,
    rp.activity_at as last_message_at,
    extract(epoch from coalesce(rp.activity_at, now()))::numeric as interaction_score
  from room_peers rp
  left join public.profiles p on p.id = rp.peer_user_id
  join viewer v on true
  where (
    rp.room_type = 'group'
    or rp.is_service
    or (
      rp.peer_user_id is not null
      and exists (
        select 1 from public.matches m
        where m.is_active = true
          and ((m.user1_id = v.user_id and m.user2_id = rp.peer_user_id) or (m.user2_id = v.user_id and m.user1_id = rp.peer_user_id))
      )
      and not public.is_user_blocked(v.user_id, rp.peer_user_id)
      and not exists (
        select 1 from public.user_unmatches uu
        where (uu.actor_id = v.user_id and uu.target_id = rp.peer_user_id)
           or (uu.actor_id = rp.peer_user_id and uu.target_id = v.user_id)
      )
    )
  )
  order by rp.activity_at desc nulls last
  limit 80;
$$;

revoke all on function public.get_share_targets() from public, anon;
grant execute on function public.get_share_targets() to authenticated;

drop function if exists public.get_discovery_cards(jsonb);

create or replace function public.get_discovery_cards(p_filters jsonb default '{}'::jsonb)
returns table(
  id uuid,
  display_name text,
  avatar_url text,
  photos text[],
  is_verified boolean,
  verification_status text,
  has_car boolean,
  relationship_status text,
  age_years integer,
  location_name text,
  location_country text,
  gender_genre text,
  height numeric,
  effective_tier text,
  tier text,
  pet_species text[],
  pet_size text,
  pet_experience text[],
  pet_experience_years numeric,
  experience_years numeric,
  availability_status text,
  last_active_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz,
  score numeric,
  waved_at_viewer boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lat double precision := nullif(p_filters->>'lat', '')::double precision;
  v_lng double precision := nullif(p_filters->>'lng', '')::double precision;
  v_anchor geography;
  v_viewer_age integer;
  v_radius_m integer := greatest(1000, least(coalesce(nullif(p_filters->>'radius_m', '')::integer, 150000), 500000));
  v_min_age integer := greatest(16, coalesce(nullif(p_filters->>'min_age', '')::integer, 16));
  v_max_age integer := greatest(v_min_age, coalesce(nullif(p_filters->>'max_age', '')::integer, 99));
  v_gender text := nullif(p_filters->>'gender', '');
  v_orientations text[] := case
    when jsonb_typeof(p_filters->'orientations') = 'array'
      then array(select jsonb_array_elements_text(p_filters->'orientations'))
    else null
  end;
  v_degrees text[] := case
    when jsonb_typeof(p_filters->'degrees') = 'array'
      then array(select jsonb_array_elements_text(p_filters->'degrees'))
    else null
  end;
  v_species text[] := case
    when jsonb_typeof(p_filters->'species') = 'array'
      then array(select jsonb_array_elements_text(p_filters->'species'))
    else null
  end;
  v_languages text[] := case
    when jsonb_typeof(p_filters->'languages') = 'array'
      then array(select jsonb_array_elements_text(p_filters->'languages'))
    else null
  end;
  v_height_min numeric := nullif(p_filters->>'height_min', '')::numeric;
  v_height_max numeric := nullif(p_filters->>'height_max', '')::numeric;
  v_only_waved boolean := coalesce((p_filters->>'only_waved')::boolean, false);
  v_active_only boolean := coalesce((p_filters->>'active_only')::boolean, false);
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select case when p.dob is null then null else date_part('year', age(p.dob))::integer end
  into v_viewer_age
  from public.profiles p
  where p.id = v_uid;

  if v_viewer_age is not null and v_viewer_age < 16 then
    raise exception 'age_blocked';
  end if;

  if v_lat is not null and v_lng is not null then
    v_anchor := st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography;
  else
    select coalesce(
      (
        select ul.location
        from public.user_locations ul
        where ul.user_id = v_uid
          and ul.is_public = true
        order by ul.updated_at desc nulls last
        limit 1
      ),
      p.location,
      p.location_geog
    )
    into v_anchor
    from public.profiles p
    where p.id = v_uid;
  end if;

  if v_anchor is null then
    raise exception 'location_required';
  end if;

  return query
  with viewer as (
    select v_uid as id, v_anchor as geog
  ),
  viewer_waves_out as (
    select coalesce(w.to_user_id, w.receiver_id) as target_id
    from public.waves w
    join viewer v on true
    where coalesce(w.from_user_id, w.sender_id) = v.id
  ),
  viewer_waves_in as (
    select coalesce(w.from_user_id, w.sender_id) as source_id
    from public.waves w
    join viewer v on true
    where coalesce(w.to_user_id, w.receiver_id) = v.id
  ),
  active_matches as (
    select case when m.user1_id = v.id then m.user2_id else m.user1_id end as target_id
    from public.matches m
    join viewer v on true
    where m.is_active = true
      and (m.user1_id = v.id or m.user2_id = v.id)
  ),
  pets_by_owner as (
    select
      p.owner_id,
      array_remove(array_agg(distinct p.species), null) as species
    from public.pets p
    where coalesce(p.is_active, true) = true
    group by p.owner_id
  )
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.photos,
    coalesce(p.is_verified, false) as is_verified,
    p.verification_status::text,
    coalesce(p.has_car, false) as has_car,
    p.relationship_status,
    case when p.dob is null then null else date_part('year', age(p.dob))::integer end as age_years,
    p.location_name,
    p.location_country,
    p.gender_genre,
    p.height,
    p.effective_tier::text,
    p.tier::text,
    coalesce(p.pet_species, pbo.species, '{}'::text[]) as pet_species,
    p.pet_size,
    p.pet_experience,
    p.pet_experience_years,
    p.experience_years,
    p.availability_status::text,
    p.last_active_at,
    p.updated_at,
    p.created_at,
    (
      case when coalesce(p.is_verified, false) then 100 else 0 end
      + case when p.effective_tier::text = 'gold' then 50 when p.effective_tier::text in ('plus', 'premium') then 25 else 0 end
      - (st_distance(coalesce(p.location, p.location_geog), v.geog) / 10000.0)
    )::numeric as score,
    exists(select 1 from viewer_waves_in wi where wi.source_id = p.id) as waved_at_viewer
  from public.profiles p
  join viewer v on true
  left join pets_by_owner pbo on pbo.owner_id = p.id
  where p.id <> v.id
    and coalesce(p.non_social, false) = false
    and coalesce(p.location, p.location_geog) is not null
    and st_dwithin(coalesce(p.location, p.location_geog), v.geog, v_radius_m)
    and (p.dob is null or date_part('year', age(p.dob)) between v_min_age and v_max_age)
    and (v_gender is null or p.gender_genre = v_gender)
    and (v_orientations is null or coalesce(array_length(v_orientations, 1), 0) = 0 or p.orientation = any(v_orientations))
    and (v_degrees is null or coalesce(array_length(v_degrees, 1), 0) = 0 or p.degree = any(v_degrees))
    and (v_height_min is null or p.height >= v_height_min)
    and (v_height_max is null or p.height <= v_height_max)
    and (v_languages is null or coalesce(array_length(v_languages, 1), 0) = 0 or coalesce(p.languages, '{}'::text[]) && v_languages)
    and (
      v_species is null
      or coalesce(array_length(v_species, 1), 0) = 0
      or coalesce(p.pet_species, pbo.species, '{}'::text[]) && v_species
    )
    and (not v_active_only or p.last_active_at >= now() - interval '30 days')
    and (not v_only_waved or exists(select 1 from viewer_waves_in wi where wi.source_id = p.id))
    and not exists(select 1 from viewer_waves_out wo where wo.target_id = p.id)
    and not exists(select 1 from active_matches am where am.target_id = p.id)
    and not public.is_user_blocked(v.id, p.id)
    and not exists (
      select 1
      from public.user_unmatches uu
      where (uu.actor_id = v.id and uu.target_id = p.id)
         or (uu.actor_id = p.id and uu.target_id = v.id)
    )
  order by score desc nulls last, p.updated_at desc nulls last, p.created_at desc nulls last
  limit 80;
end;
$$;

revoke all on function public.get_discovery_cards(jsonb) from public, anon;
grant execute on function public.get_discovery_cards(jsonb) to authenticated;

drop function if exists public.mark_room_read(uuid);
drop function if exists public.mark_room_read(uuid, uuid, timestamptz);

create or replace function public.mark_room_read(
  p_chat_id uuid,
  p_visible_message_id uuid default null,
  p_visible_before timestamptz default null
)
returns table(
  id uuid,
  chat_id uuid,
  message_id uuid,
  user_id uuid,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.chat_room_members crm
    where crm.chat_id = p_chat_id
      and crm.user_id = v_uid
  ) then
    raise exception 'chat_membership_required';
  end if;

  return query
  insert into public.message_reads(chat_id, message_id, user_id, read_at)
  select cm.chat_id, cm.id, v_uid, now()
  from public.chat_messages cm
  where cm.chat_id = p_chat_id
    and cm.sender_id <> v_uid
    and (
      p_visible_message_id is null
      or cm.created_at <= coalesce(
        (select cutoff.created_at from public.chat_messages cutoff where cutoff.id = p_visible_message_id and cutoff.chat_id = p_chat_id),
        cm.created_at
      )
    )
    and (p_visible_before is null or cm.created_at <= p_visible_before)
  on conflict (message_id, user_id)
  do update set read_at = excluded.read_at, chat_id = excluded.chat_id
  returning message_reads.id, message_reads.chat_id, message_reads.message_id, message_reads.user_id, message_reads.read_at;
end;
$$;

revoke all on function public.mark_room_read(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.mark_room_read(uuid, uuid, timestamptz) to authenticated;

alter table public.chat_room_members
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists left_at timestamptz;

alter table public.chats
  add column if not exists deleted_at timestamptz,
  add column if not exists both_deleted_at timestamptz,
  add column if not exists last_active_at timestamptz,
  add column if not exists last_opened_at timestamptz,
  add column if not exists retention_status text,
  add column if not exists report_freeze_status text;

alter table public.chat_messages
  add column if not exists text_expires_at timestamptz,
  add column if not exists media_expires_at timestamptz,
  add column if not exists retention_frozen_until timestamptz;

create table if not exists public.chat_retention_locks (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null,
  message_id uuid,
  media_path text,
  reason text not null,
  status text not null default 'active' check (status in ('active', 'released')),
  locked_by uuid,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  expires_at timestamptz
);

create index if not exists idx_chat_retention_locks_chat_active
  on public.chat_retention_locks(chat_id, status)
  where status = 'active';

create table if not exists public.chat_report_freezes (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null,
  report_id uuid,
  reported_message_id uuid,
  status text not null default 'whole_chat' check (status in ('whole_chat', 'context_only', 'released')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  expires_at timestamptz
);

create index if not exists idx_chat_report_freezes_chat_status
  on public.chat_report_freezes(chat_id, status);

create or replace function public.archive_chat_for_current_user(p_chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.chats%rowtype;
  v_remaining_visible int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_room
  from public.chats
  where id = p_chat_id
  for update;

  if v_room.id is null then
    raise exception 'chat_not_found';
  end if;

  if not exists (
    select 1
    from public.chat_room_members crm
    where crm.chat_id = p_chat_id
      and crm.user_id = v_uid
  ) then
    raise exception 'chat_membership_required';
  end if;

  if v_room.type = 'group' then
    update public.chat_room_members
    set left_at = coalesce(left_at, now()), archived_at = coalesce(archived_at, now())
    where chat_id = p_chat_id and user_id = v_uid;

    return jsonb_build_object('mode', 'group_left', 'chat_id', p_chat_id);
  end if;

  update public.chat_room_members
  set deleted_at = coalesce(deleted_at, now()), archived_at = coalesce(archived_at, now())
  where chat_id = p_chat_id and user_id = v_uid;

  select count(*)::int into v_remaining_visible
  from public.chat_room_members crm
  where crm.chat_id = p_chat_id
    and crm.deleted_at is null;

  if v_room.type = 'direct' and v_remaining_visible = 0 then
    insert into public.storage_cleanup_queue(bucket, object_path, reason, requested_by)
    select distinct 'chat_attachments', media.object_path, 'direct_hard_delete_chat', v_uid
    from public.chat_messages cm
    cross join lateral public.chat_message_attachment_paths(cm.content) media
    where cm.chat_id = p_chat_id
      and media.object_path is not null
    on conflict do nothing;
    delete from public.message_reads where chat_id = p_chat_id;
    delete from public.chat_messages where chat_id = p_chat_id;
    delete from public.chat_room_members where chat_id = p_chat_id;
    delete from public.chats where id = p_chat_id;
    return jsonb_build_object('mode', 'direct_hard_deleted', 'chat_id', p_chat_id);
  end if;

  return jsonb_build_object('mode', 'archived_for_user', 'chat_id', p_chat_id);
end;
$$;

revoke all on function public.archive_chat_for_current_user(uuid) from public, anon;
grant execute on function public.archive_chat_for_current_user(uuid) to authenticated;

create or replace function public.freeze_chat_for_report(
  p_chat_id uuid,
  p_report_id uuid default null,
  p_reported_message_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.chat_room_members crm
    where crm.chat_id = p_chat_id and crm.user_id = v_uid
  ) then
    raise exception 'chat_membership_required';
  end if;

  insert into public.chat_report_freezes(chat_id, report_id, reported_message_id, status)
  values (p_chat_id, p_report_id, p_reported_message_id, 'whole_chat')
  returning id into v_id;

  insert into public.chat_retention_locks(chat_id, reason, locked_by)
  values (p_chat_id, 'report_whole_chat', v_uid);

  update public.chats
  set report_freeze_status = 'whole_chat',
      retention_status = 'frozen'
  where id = p_chat_id;

  return v_id;
end;
$$;

revoke all on function public.freeze_chat_for_report(uuid, uuid, uuid) from public, anon;
grant execute on function public.freeze_chat_for_report(uuid, uuid, uuid) to authenticated;

create or replace function public.resolve_chat_report_freeze(
  p_freeze_id uuid,
  p_valid boolean,
  p_keep_message_ids uuid[] default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_freeze public.chat_report_freezes%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(is_admin, false) into v_is_admin
  from public.profiles
  where id = v_uid;

  if not coalesce(v_is_admin, false) then
    raise exception 'admin_required';
  end if;

  select * into v_freeze
  from public.chat_report_freezes
  where id = p_freeze_id
  for update;

  if v_freeze.id is null then
    raise exception 'freeze_not_found';
  end if;

  update public.chat_retention_locks
  set status = 'released', released_at = now()
  where chat_id = v_freeze.chat_id
    and status = 'active'
    and reason = 'report_whole_chat';

  if p_valid then
    update public.chat_report_freezes
    set status = 'context_only', resolved_at = now(), expires_at = now() + interval '90 days'
    where id = p_freeze_id;

    insert into public.chat_retention_locks(chat_id, message_id, reason, locked_by, expires_at)
    select v_freeze.chat_id, unnest(coalesce(p_keep_message_ids, array[v_freeze.reported_message_id]::uuid[])), 'report_context', v_uid, now() + interval '90 days'
    where coalesce(array_length(coalesce(p_keep_message_ids, array[v_freeze.reported_message_id]::uuid[]), 1), 0) > 0;

    update public.chats
    set report_freeze_status = 'context_only',
        retention_status = 'normal'
    where id = v_freeze.chat_id;
  else
    update public.chat_report_freezes
    set status = 'released', resolved_at = now(), expires_at = now()
    where id = p_freeze_id;

    update public.chats
    set report_freeze_status = 'released',
        retention_status = 'normal'
    where id = v_freeze.chat_id;
  end if;

  return true;
end;
$$;

revoke all on function public.resolve_chat_report_freeze(uuid, boolean, uuid[]) from public, anon;
grant execute on function public.resolve_chat_report_freeze(uuid, boolean, uuid[]) to authenticated;

create or replace function public.chat_message_attachment_paths(p_content text)
returns table(bucket text, object_path text)
language plpgsql
stable
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  begin
    v_payload := p_content::jsonb;
  exception when others then
    return;
  end;

  if jsonb_typeof(v_payload->'attachments') <> 'array' then
    return;
  end if;

  return query
  select
    coalesce(nullif(btrim(item->>'bucket'), ''), 'chat_attachments') as bucket,
    nullif(btrim(item->>'path'), '') as object_path
  from jsonb_array_elements(v_payload->'attachments') item
  where nullif(btrim(item->>'path'), '') is not null
    and coalesce(nullif(btrim(item->>'bucket'), ''), 'chat_attachments') = 'chat_attachments'
    and item->>'path' not like '%..%';
end;
$$;

revoke all on function public.chat_message_attachment_paths(text) from public, anon;
grant execute on function public.chat_message_attachment_paths(text) to authenticated;
grant execute on function public.chat_message_attachment_paths(text) to service_role;

drop function if exists public.chat_retention_cleanup_preview(timestamptz);

create or replace function public.chat_retention_cleanup_preview(p_now timestamptz default now())
returns table(item_type text, chat_id uuid, message_id uuid, media_path text, delete_reason text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      cm.chat_id,
      cm.id as message_id,
      cm.created_at,
      cm.text_expires_at,
      cm.media_expires_at,
      row_number() over (partition by cm.chat_id order by cm.created_at desc, cm.id desc) as newest_rank,
      c.deleted_at,
      c.last_active_at,
      c.type as room_type,
      sc.status as service_status,
      sc.updated_at as service_updated_at,
      c.report_freeze_status,
      exists (
        select 1 from public.chat_retention_locks crl
        where crl.chat_id = cm.chat_id
          and crl.status = 'active'
          and (crl.message_id is null or crl.message_id = cm.id)
          and (crl.expires_at is null or crl.expires_at > p_now)
      ) as frozen
    from public.chat_messages cm
    join public.chats c on c.id = cm.chat_id
    left join public.service_chats sc on sc.chat_id = c.id
  ),
  text_due as (
    select
      'text'::text as item_type,
      r.chat_id,
      r.message_id,
      null::text as media_path,
      case
        when r.deleted_at is not null and r.created_at < p_now - interval '30 days' then 'deleted_conversation_30d'
        when r.room_type = 'service' and r.service_status in ('completed', 'cancelled', 'canceled') and coalesce(r.service_updated_at, r.last_active_at, r.created_at) < p_now - interval '90 days' then 'service_chat_90d_after_close'
        when coalesce(r.text_expires_at, p_now + interval '100 years') <= p_now then 'text_expires_at_due'
        when coalesce(r.last_active_at, r.created_at) < p_now - interval '120 days' then 'inactive_90d_plus_30d'
        else 'not_due'
      end as delete_reason,
      r.created_at
    from ranked r
    where r.newest_rank > 50
      and not r.frozen
      and (
        (r.deleted_at is not null and r.created_at < p_now - interval '30 days')
        or (r.room_type = 'service' and r.service_status in ('completed', 'cancelled', 'canceled') and coalesce(r.service_updated_at, r.last_active_at, r.created_at) < p_now - interval '90 days')
        or coalesce(r.text_expires_at, p_now + interval '100 years') <= p_now
        or coalesce(r.last_active_at, r.created_at) < p_now - interval '120 days'
      )
  ),
  media_due as (
    select
      'media'::text as item_type,
      r.chat_id,
      r.message_id,
      media.object_path as media_path,
      case
        when r.deleted_at is not null and r.created_at < p_now - interval '30 days' then 'deleted_conversation_media_30d'
        when coalesce(r.media_expires_at, r.created_at + interval '90 days') <= p_now then 'media_90d'
        else 'not_due'
      end as delete_reason,
      r.created_at
    from ranked r
    cross join lateral public.chat_message_attachment_paths((select cm.content from public.chat_messages cm where cm.id = r.message_id)) media
    where not r.frozen
      and (
        (r.deleted_at is not null and r.created_at < p_now - interval '30 days')
        or coalesce(r.media_expires_at, r.created_at + interval '90 days') <= p_now
      )
  )
  select * from text_due
  union all
  select * from media_due;
$$;

revoke all on function public.chat_retention_cleanup_preview(timestamptz) from public, anon;
grant execute on function public.chat_retention_cleanup_preview(timestamptz) to authenticated;
grant execute on function public.chat_retention_cleanup_preview(timestamptz) to service_role;

create or replace function public.chat_retention_cleanup_apply(p_now timestamptz default now())
returns table(item_type text, chat_id uuid, message_id uuid, media_path text, delete_reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), '');
  rec record;
begin
  if v_role <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  for rec in select * from public.chat_retention_cleanup_preview(p_now) loop
    if rec.item_type = 'media' and rec.media_path is not null then
      insert into public.storage_cleanup_queue(bucket, object_path, reason, requested_by)
      values ('chat_attachments', rec.media_path, rec.delete_reason, auth.uid())
      on conflict do nothing;
    elsif rec.item_type = 'text' then
      delete from public.message_reads where message_id = rec.message_id;
      delete from public.chat_messages where id = rec.message_id;
    end if;

    item_type := rec.item_type;
    chat_id := rec.chat_id;
    message_id := rec.message_id;
    media_path := rec.media_path;
    delete_reason := rec.delete_reason;
    return next;
  end loop;
end;
$$;

revoke all on function public.chat_retention_cleanup_apply(timestamptz) from public, anon, authenticated;
grant execute on function public.chat_retention_cleanup_apply(timestamptz) to service_role;

drop function if exists public.chat_retention_cleanup_run(timestamptz);

create or replace function public.chat_retention_cleanup_run(p_now timestamptz default now())
returns table(item_type text, chat_id uuid, message_id uuid, media_path text, delete_reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  for rec in select * from public.chat_retention_cleanup_preview(p_now) loop
    if rec.item_type = 'media' and rec.media_path is not null then
      insert into public.storage_cleanup_queue(bucket, object_path, reason, requested_by)
      values ('chat_attachments', rec.media_path, rec.delete_reason, auth.uid())
      on conflict do nothing;
    elsif rec.item_type = 'text' then
      delete from public.message_reads where message_id = rec.message_id;
      delete from public.chat_messages where id = rec.message_id;
    end if;

    item_type := rec.item_type;
    chat_id := rec.chat_id;
    message_id := rec.message_id;
    media_path := rec.media_path;
    delete_reason := rec.delete_reason;
    return next;
  end loop;
end;
$$;

revoke all on function public.chat_retention_cleanup_run(timestamptz) from public, anon;
grant execute on function public.chat_retention_cleanup_run(timestamptz) to service_role;

do $$
declare
  v_job record;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    for v_job in
      select jobid from cron.job where jobname = 'chat_retention_cleanup_daily'
    loop
      perform cron.unschedule(v_job.jobid);
    end loop;

    perform cron.schedule(
      'chat_retention_cleanup_daily',
      '0 3 * * *',
      $cron$select public.chat_retention_cleanup_run();$cron$
    );
  else
    raise notice 'pg_cron not available; schedule public.chat_retention_cleanup_run() via Scheduled Edge Function.';
  end if;
end
$$;
