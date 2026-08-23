-- Narrow, read-only projections for the logged-out web surfaces.
--
-- These functions are the only anonymous database surface added by the web
-- build. They preserve the app's canonical source tables/RPCs while removing
-- the Vercel service-role bypass that previously hand-built parallel queries.
-- Every return column is intentional; raw profile IDs, creator IDs, join
-- credentials, messages, precise profile locations and viewer-relative state
-- never leave these functions.

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
  created_at timestamptz,
  category text,
  author_name text,
  author_avatar_url text,
  author_social_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  with support_counts as (
    select ts.thread_id, count(*)::integer as count
    from public.thread_supports ts
    group by ts.thread_id
  )
  select
    t.id,
    t.title,
    t.content,
    coalesce(t.images, '{}'::text[]),
    coalesce(sc.count, 0),
    t.created_at,
    coalesce(nullif(btrim(t.tags[1]), ''), 'Social'),
    coalesce(nullif(btrim(p.display_name), ''), 'huddle member'),
    nullif(btrim(p.avatar_url), ''),
    nullif(btrim(p.social_id), '')
  from public.threads t
  join public.profiles p on p.id = t.user_id
  left join support_counts sc on sc.thread_id = t.id
  where coalesce(t.is_public, true) = true
    and coalesce(t.is_sensitive, false) = false
    and coalesce(p.non_social, false) = false
    and lower(coalesce(p.account_status::text, 'active')) = 'active'
    and not public.is_user_restriction_active(t.user_id, 'social_hidden', now())
    and (
      nullif(btrim(coalesce(p_cursor->>'country', '')), '') is null
      or public.normalize_country_key(t.post_country) =
         public.normalize_country_key(p_cursor->>'country')
    )
    and (
      nullif(p_cursor->>'created_at', '') is null
      or (t.created_at, t.id) < (
        (p_cursor->>'created_at')::timestamptz,
        coalesce(
          nullif(p_cursor->>'id', '')::uuid,
          'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
        )
      )
    )
  order by t.created_at desc, t.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.get_public_social_feed(integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_social_feed(integer, jsonb)
  to anon, authenticated;
grant execute on function public.get_public_social_feed(integer, jsonb)
  to service_role;


create or replace function public.get_public_map_alerts(
  p_bbox jsonb default '{}'::jsonb
)
returns table(
  id uuid,
  latitude double precision,
  longitude double precision,
  alert_type text,
  area text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.latitude,
    a.longitude,
    coalesce(nullif(btrim(a.alert_type), ''), 'Stray'),
    coalesce(nullif(btrim(a.location_district), ''), ''),
    a.created_at
  from public.get_visible_broadcast_alerts(
    greatest(-90, least(90, coalesce((p_bbox->>'lat')::double precision, 22.3193))),
    greatest(-180, least(180, coalesce((p_bbox->>'lng')::double precision, 114.1694))),
    greatest(1000, least(coalesce((p_bbox->>'radius_m')::integer, 10000), 100000))
  ) a
  where coalesce(a.is_sensitive, false) = false
    and a.latitude is not null
    and a.longitude is not null
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce((p_bbox->>'limit')::integer, 100), 200));
$$;

revoke all on function public.get_public_map_alerts(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_map_alerts(jsonb)
  to anon, authenticated;
grant execute on function public.get_public_map_alerts(jsonb)
  to service_role;


create or replace function public.get_public_groups_nearby(
  p_country text,
  p_district text default null
)
returns table(
  id uuid,
  name text,
  cover_url text,
  area text,
  country text,
  pet_focus text[],
  description text,
  member_count bigint,
  next_event_title text,
  next_event_starts_at timestamptz,
  next_event_ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.name,
    g.avatar_url,
    g.location_label,
    g.location_country,
    coalesce(g.pet_focus, '{}'::text[]),
    coalesce(g.description, ''),
    greatest(coalesce(g.member_count, 0), 0),
    g.next_event_title,
    g.next_event_starts_at,
    g.next_event_ends_at
  from public.get_public_groups_for_country(
    null::uuid,
    p_country,
    jsonb_build_object('country', p_country, 'district', coalesce(p_district, ''))
  ) g
  order by coalesce(g.last_message_at, g.created_at) desc, g.created_at desc
  limit 60;
$$;

revoke all on function public.get_public_groups_nearby(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_groups_nearby(text, text)
  to anon, authenticated;
grant execute on function public.get_public_groups_nearby(text, text)
  to service_role;


create or replace function public.get_public_area_stats(p_district text)
returns table(alert_count integer, group_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(distinct b.id)::integer as alert_count,
    count(distinct c.id)::integer as group_count
  from (select 1) seed
  left join public.broadcast_alerts b
    on lower(btrim(coalesce(b.incident_district, ''))) =
       lower(btrim(coalesce(p_district, '')))
   and (b.expires_at is null or b.expires_at > now())
   and b.archived_at is null
   and coalesce(b.verified_only, false) = false
   and coalesce(b.is_sensitive, false) = false
  left join public.chats c
    on lower(btrim(coalesce(c.location_label, ''))) =
       lower(btrim(coalesce(p_district, '')))
   and c.type = 'group'
   and c.visibility = 'public'
   and c.deleted_at is null;
$$;

revoke all on function public.get_public_area_stats(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_area_stats(text)
  to anon, authenticated;
grant execute on function public.get_public_area_stats(text)
  to service_role;
