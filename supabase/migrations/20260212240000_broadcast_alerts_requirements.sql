-- Broadcast alerts requirements: schema alignment, visibility function, and RLS select lockdown.

create extension if not exists postgis;

alter table public.map_alerts
  add column if not exists duration_hours integer,
  add column if not exists range_km numeric(6,2),
  add column if not exists post_on_social boolean not null default false,
  add column if not exists social_post_id text;

update public.map_alerts
set
  range_km = coalesce(range_km, range_meters / 1000.0),
  duration_hours = coalesce(duration_hours, greatest(1, round(extract(epoch from (expires_at - created_at)) / 3600.0)))
where (range_km is null or duration_hours is null)
  and expires_at is not null;

create index if not exists idx_map_alerts_location_geog on public.map_alerts using gist (location_geog);

-- Lock down direct SELECTs on map_alerts; reads must go through SECURITY DEFINER function.
revoke select on table public.map_alerts from anon;
revoke select on table public.map_alerts from authenticated;

-- Drop any existing SELECT policies to prevent bypass.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'map_alerts' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.map_alerts', r.policyname);
  end loop;
end $$;

-- Replace visibility function with broadcast-specific contract.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_visible_broadcast_alerts'
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

create function public.get_visible_broadcast_alerts(
  p_lat double precision,
  p_lng double precision
)
returns table (
  id uuid,
  latitude double precision,
  longitude double precision,
  alert_type text,
  title text,
  description text,
  photo_url text,
  support_count integer,
  report_count integer,
  created_at timestamptz,
  expires_at timestamptz,
  duration_hours integer,
  range_meters integer,
  range_km numeric,
  creator_id uuid,
  thread_id uuid,
  posted_to_threads boolean,
  post_on_social boolean,
  social_post_id text,
  social_status text,
  social_url text,
  media_urls text[],
  location_street text,
  location_district text,
  creator_display_name text,
  creator_avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    a.latitude,
    a.longitude,
    a.alert_type,
    a.title,
    a.description,
    a.photo_url,
    coalesce(a.support_count, 0) as support_count,
    coalesce(a.report_count, 0) as report_count,
    a.created_at,
    a.expires_at,
    a.duration_hours,
    a.range_meters,
    coalesce(a.range_km, a.range_meters / 1000.0) as range_km,
    a.creator_id,
    a.thread_id,
    coalesce(a.posted_to_threads, false) as posted_to_threads,
    coalesce(a.post_on_social, false) as post_on_social,
    a.social_post_id,
    a.social_status,
    a.social_url,
    a.media_urls,
    a.location_street,
    a.location_district,
    p.display_name as creator_display_name,
    p.avatar_url as creator_avatar_url
  from public.map_alerts a
  join public.profiles p on p.id = a.creator_id
  where a.is_active = true
    and (a.expires_at is null or a.expires_at > now())
    and coalesce(a.report_count, 0) < 10
    and a.location_geog is not null
    and st_dwithin(
      a.location_geog,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      greatest(0, least(coalesce(a.range_km, a.range_meters / 1000.0, 10) * 1000.0, 150000.0))
    )
  order by a.created_at desc
  limit 200;
$$;

revoke all on function public.get_visible_broadcast_alerts(double precision, double precision) from public, anon;
grant execute on function public.get_visible_broadcast_alerts(double precision, double precision) to authenticated;

grant execute on function public.get_visible_broadcast_alerts(double precision, double precision) to service_role;

-- Update map alert contract enforcement to match tier caps.
create or replace function public.enforce_map_alert_contract()
returns trigger
language plpgsql
security definer
as $$
declare
  u_id uuid := auth.uid();
  owner_id uuid;
  tier text;
  q public.user_quotas%rowtype;
  today date := current_date;
  wk date := date_trunc('week', now())::date;
  mo date;

  base_range int := 10000;
  base_dur interval := interval '12 hours';
  requested_dur interval;
  wants_extended boolean := false;
  used_extra boolean := false;
  limit_broadcast_week int := 5;
begin
  if u_id is null then
    if new.creator_id is null then
      raise exception 'unauthorized';
    end if;
    u_id := new.creator_id;
  end if;

  new.location_geog := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;

  if new.description is not null and length(new.description) > 1000 then
    raise exception 'description_too_long';
  end if;

  owner_id := public._qms_get_pool_owner(u_id);
  tier := public._qms_effective_tier(owner_id);
  if tier <> 'gold' then
    owner_id := u_id;
    tier := public._qms_effective_tier(owner_id);
  end if;

  perform public._qms_touch_row(owner_id);
  select * into q from public.user_quotas where user_id = owner_id for update;
  mo := public._qms_cycle_month_start(owner_id);

  if q.day_start <> today then
    q.day_start := today;
    q.thread_posts_today := 0;
    q.discovery_views_today := 0;
    q.discovery_profiles_today := 0;
    q.media_usage_today := 0;
    q.ai_vet_uploads_today := 0;
  end if;
  if q.week_start <> wk then
    q.week_start := wk;
    q.broadcast_alerts_week := 0;
    q.broadcast_week_used := 0;
  end if;
  if q.month_start <> mo then
    q.month_start := mo;
    q.stars_used_cycle := 0;
    q.stars_month_used := 0;
  end if;

  if tier = 'premium' then
    base_range := 25000;
    base_dur := interval '24 hours';
    limit_broadcast_week := 20;
  elsif tier = 'gold' then
    base_range := 50000;
    base_dur := interval '48 hours';
    limit_broadcast_week := 20;
  end if;

  if new.range_km is not null and new.range_meters is null then
    new.range_meters := round(new.range_km * 1000.0);
  end if;

  new.range_meters := coalesce(new.range_meters, base_range);
  if new.expires_at is null then
    if new.duration_hours is not null then
      new.expires_at := now() + make_interval(hours => new.duration_hours);
    else
      new.expires_at := now() + base_dur;
    end if;
  end if;
  requested_dur := new.expires_at - now();

  wants_extended := (new.range_meters > base_range) or (requested_dur > base_dur);

  if wants_extended then
    if q.extra_broadcast_72h > 0 then
      q.extra_broadcast_72h := q.extra_broadcast_72h - 1;
      used_extra := true;
      new.range_meters := 150000;
      new.expires_at := now() + interval '72 hours';
    else
      new.range_meters := base_range;
      new.expires_at := now() + base_dur;
    end if;
  else
    if new.range_meters > base_range then
      new.range_meters := base_range;
    end if;
    if requested_dur > base_dur then
      new.expires_at := now() + base_dur;
    end if;
  end if;

  if q.broadcast_alerts_week < limit_broadcast_week then
    q.broadcast_alerts_week := q.broadcast_alerts_week + 1;
    q.broadcast_week_used := q.broadcast_alerts_week;
  else
    if used_extra then
      null;
    elsif q.extra_broadcast_72h > 0 then
      q.extra_broadcast_72h := q.extra_broadcast_72h - 1;
      null;
    else
      raise exception 'quota_exceeded';
    end if;
  end if;

  update public.user_quotas
  set
    day_start = q.day_start,
    week_start = q.week_start,
    month_start = q.month_start,
    broadcast_alerts_week = q.broadcast_alerts_week,
    broadcast_week_used = q.broadcast_week_used,
    extra_broadcast_72h = q.extra_broadcast_72h,
    updated_at = now()
  where user_id = owner_id;

  new.range_km := round((new.range_meters::numeric) / 1000.0, 2);
  new.duration_hours := greatest(1, round(extract(epoch from (new.expires_at - now())) / 3600.0));

  return new;
end;
$$;

select pg_notify('pgrst', 'reload schema');
