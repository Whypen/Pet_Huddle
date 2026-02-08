-- v1.9 Final Override: consolidated algorithms + perks table changes.
-- This migration intentionally *overrides* previous quota logic to match MASTER_SPEC v1.9.
-- Key changes:
-- - Adds subscription_start for anniversary cycles.
-- - Adds v1.9 QMS columns (discovery_views_today, media_usage_today, stars_used_cycle, broadcast_alerts_week, extra_*).
-- - Overrides check_and_increment_quota() limits to: Threads 1/5/20 per day; Discovery 40/day (Free) else unlimited;
--   Media 0/10/50 per day; Stars 3/cycle (Gold only); Broadcast 5/20/20 per week.
-- - Updates map_alerts contract enforcement to clamp to 2/10/20km and 12/24/48h, with add-on (72h/20km) token.

-- 0) Subscription start (anniversary anchor)
alter table public.profiles
  add column if not exists subscription_start timestamptz;

comment on column public.profiles.subscription_start is
  'Subscription start timestamp used to anchor monthly quota cycle resets (anniversary-based).';

-- 1) Add v1.9 columns to QMS table (keep legacy v2 columns for backwards compatibility).
alter table public.user_quotas
  add column if not exists discovery_views_today int not null default 0,
  add column if not exists media_usage_today int not null default 0,
  add column if not exists stars_used_cycle int not null default 0,
  add column if not exists broadcast_alerts_week int not null default 0,
  add column if not exists extra_stars int not null default 0,
  add column if not exists extra_media_10 int not null default 0,
  add column if not exists extra_broadcast_72h int not null default 0;

-- 2) Anniversary cycle computation. Uses profiles.subscription_start when present; falls back to subscription_cycle_anchor_day.
create or replace function public._qms_cycle_month_start(p_owner_id uuid)
returns date
language plpgsql
stable
as $$
declare
  tier text;
  anchor_day int;
  anchor_ts timestamptz;
  today date := current_date;
  base_year int := extract(year from today)::int;
  base_month int := extract(month from today)::int;
  prev date := (date_trunc('month', today) - interval '1 month')::date;
  prev_year int := extract(year from prev)::int;
  prev_month int := extract(month from prev)::int;
  last_day_this_month int := extract(
    day from (date_trunc('month', today) + interval '1 month - 1 day')
  )::int;
  last_day_prev_month int := extract(
    day from (date_trunc('month', prev) + interval '1 month - 1 day')
  )::int;
  this_anchor date;
  prev_anchor date;
begin
  tier := public._qms_effective_tier(p_owner_id);

  -- Free uses calendar month (no subscription anniversary).
  if tier not in ('premium', 'gold') then
    return date_trunc('month', today)::date;
  end if;

  select p.subscription_start
  into anchor_ts
  from public.profiles p
  where p.id = p_owner_id;

  if anchor_ts is not null then
    anchor_day := extract(day from anchor_ts at time zone 'utc')::int;
  else
    select coalesce(p.subscription_cycle_anchor_day, 1)
    into anchor_day
    from public.profiles p
    where p.id = p_owner_id;
  end if;

  if anchor_day < 1 then anchor_day := 1; end if;
  if anchor_day > 31 then anchor_day := 31; end if;

  this_anchor := make_date(base_year, base_month, least(anchor_day, last_day_this_month));
  prev_anchor := make_date(prev_year, prev_month, least(anchor_day, last_day_prev_month));

  if today >= this_anchor then
    return this_anchor;
  end if;
  return prev_anchor;
end;
$$;

-- 3) Upgrade tier should set subscription_start on first activation (used for cycles).
create or replace function public.upgrade_user_tier(
  p_user_id uuid,
  p_tier text,
  p_subscription_status text,
  p_stripe_subscription_id text
)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set
    tier = p_tier,
    subscription_status = p_subscription_status,
    stripe_subscription_id = p_stripe_subscription_id,
    subscription_start = coalesce(subscription_start, now()),
    subscription_cycle_anchor_day = coalesce(subscription_cycle_anchor_day, extract(day from now())::int),
    updated_at = now()
  where id = p_user_id;
end;
$$;

-- 4) QMS: v1.9 override (keep signature; returns boolean).
create or replace function public.check_and_increment_quota(action_type text)
returns boolean
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

  limit_threads int := 1;
  limit_discovery int := 40;
  limit_media int := 0;
  limit_stars int := 0;
  limit_broadcast_week int := 5;
begin
  if u_id is null then
    return false;
  end if;

  owner_id := public._qms_get_pool_owner(u_id);
  tier := public._qms_effective_tier(owner_id);

  -- Gold pools; others are per-user.
  if tier <> 'gold' then
    owner_id := u_id;
    tier := public._qms_effective_tier(owner_id);
  end if;

  perform public._qms_touch_row(owner_id);
  select * into q from public.user_quotas where user_id = owner_id;
  mo := public._qms_cycle_month_start(owner_id);

  -- Period resets (idempotent).
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

  -- Tier limits (v1.9)
  if tier = 'premium' then
    limit_threads := 5;
    limit_discovery := 2147483647;
    limit_media := 10;
    limit_stars := 0;
    limit_broadcast_week := 20;
  elsif tier = 'gold' then
    limit_threads := 20;
    limit_discovery := 2147483647;
    limit_media := 50;
    limit_stars := 3;
    limit_broadcast_week := 20;
  else
    -- free defaults already set
  end if;

  -- Apply action rules
  if action_type = 'thread_post' then
    if q.thread_posts_today < limit_threads then
      q.thread_posts_today := q.thread_posts_today + 1;
    else
      return false;
    end if;

  elsif action_type in ('discovery_profile', 'discovery_view') then
    if tier in ('premium','gold') then
      null; -- unlimited
    else
      if q.discovery_views_today >= limit_discovery then
        return false;
      end if;
      q.discovery_views_today := q.discovery_views_today + 1;
      q.discovery_profiles_today := q.discovery_views_today;
    end if;

  elsif action_type in ('media', 'ai_vet_upload', 'thread_image', 'chat_image', 'broadcast_media', 'video_upload') then
    -- v1.9: Media quota applies to images across AI Vet/Chats/Threads/Broadcast.
    -- Gold video uploads are allowed; others are blocked.
    if action_type = 'video_upload' and tier <> 'gold' then
      return false;
    end if;

    if q.media_usage_today < limit_media then
      q.media_usage_today := q.media_usage_today + 1;
      q.ai_vet_uploads_today := q.media_usage_today;
    elsif q.extra_media_10 > 0 then
      q.extra_media_10 := q.extra_media_10 - 1;
    else
      return false;
    end if;

  elsif action_type = 'star' then
    if q.stars_used_cycle < limit_stars then
      q.stars_used_cycle := q.stars_used_cycle + 1;
      q.stars_month_used := q.stars_used_cycle;
    elsif q.extra_stars > 0 then
      q.extra_stars := q.extra_stars - 1;
    else
      return false;
    end if;

  else
    -- Broadcast quotas are enforced by map_alerts trigger (needs access to extension token semantics).
    return true;
  end if;

  update public.user_quotas
  set
    day_start = q.day_start,
    week_start = q.week_start,
    month_start = q.month_start,
    thread_posts_today = q.thread_posts_today,
    discovery_profiles_today = q.discovery_profiles_today,
    discovery_views_today = q.discovery_views_today,
    media_usage_today = q.media_usage_today,
    ai_vet_uploads_today = q.ai_vet_uploads_today,
    stars_month_used = q.stars_month_used,
    stars_used_cycle = q.stars_used_cycle,
    broadcast_week_used = q.broadcast_week_used,
    broadcast_alerts_week = q.broadcast_alerts_week,
    extras_stars = q.extras_stars,
    extra_stars = q.extra_stars,
    extras_ai_vet_uploads = q.extras_ai_vet_uploads,
    extra_media_10 = q.extra_media_10,
    extras_broadcasts = q.extras_broadcasts,
    extra_broadcast_72h = q.extra_broadcast_72h,
    updated_at = now()
  where user_id = owner_id;

  return true;
end;
$$;

-- 5) Mirror Stripe add-ons into v1.9 extras columns.
create or replace function public.increment_user_credits(
  p_user_id uuid,
  p_stars integer default 0,
  p_mesh_alerts integer default 0,
  p_media_credits integer default 0,
  p_family_slots integer default 0
)
returns void
language plpgsql
security definer
as $$
declare
  owner_id uuid;
  tier text;
begin
  -- Preserve legacy profile counters (some UI still reads them).
  update public.profiles
  set
    stars_count = greatest(0, coalesce(stars_count, 0) + coalesce(p_stars, 0)),
    mesh_alert_count = greatest(0, coalesce(mesh_alert_count, 0) + coalesce(p_mesh_alerts, 0)),
    media_credits = greatest(0, coalesce(media_credits, 0) + coalesce(p_media_credits, 0)),
    family_slots = greatest(0, coalesce(family_slots, 0) + coalesce(p_family_slots, 0)),
    updated_at = now()
  where id = p_user_id;

  -- Gold pooling: add extras to pool owner.
  owner_id := public._qms_get_pool_owner(p_user_id);
  tier := public._qms_effective_tier(owner_id);
  if tier <> 'gold' then
    owner_id := p_user_id;
  end if;

  perform public._qms_touch_row(owner_id);

  update public.user_quotas
  set
    extra_stars = extra_stars + greatest(0, coalesce(p_stars, 0)),
    extra_media_10 = extra_media_10 + greatest(0, coalesce(p_media_credits, 0)),
    extra_broadcast_72h = extra_broadcast_72h + greatest(0, coalesce(p_mesh_alerts, 0)),
    updated_at = now()
  where user_id = owner_id;
end;
$$;

-- 6) Quota snapshot RPC for UI (best-effort; expand safely).
drop function if exists public.get_quota_snapshot();

create function public.get_quota_snapshot()
returns table(
  user_id uuid,
  tier text,
  day_start date,
  week_start date,
  month_start date,
  thread_posts_today int,
  discovery_views_today int,
  media_usage_today int,
  stars_used_cycle int,
  broadcast_alerts_week int,
  extra_stars int,
  extra_media_10 int,
  extra_broadcast_72h int
)
language sql
security definer
as $$
  with me as (
    select auth.uid() as u
  ),
  owner as (
    select public._qms_get_pool_owner((select u from me)) as owner_id
  ),
  effective as (
    select
      case
        when public._qms_effective_tier((select owner_id from owner)) = 'gold'
          then (select owner_id from owner)
        else (select u from me)
      end as o
  )
  select
    uq.user_id,
    public._qms_effective_tier(uq.user_id) as tier,
    uq.day_start,
    uq.week_start,
    uq.month_start,
    uq.thread_posts_today,
    uq.discovery_views_today,
    uq.media_usage_today,
    uq.stars_used_cycle,
    uq.broadcast_alerts_week,
    uq.extra_stars,
    uq.extra_media_10,
    uq.extra_broadcast_72h
  from public.user_quotas uq
  where uq.user_id = (select o from effective);
$$;

revoke all on function public.get_quota_snapshot() from anon;
grant execute on function public.get_quota_snapshot() to authenticated;
grant execute on function public.get_quota_snapshot() to service_role;

-- 7) Map/Broadcast contract (v1.9): clamp to 2/10/20km and 12/24/48h, with add-on (72h/20km) token.
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

  base_range int := 2000;
  base_dur interval := interval '12 hours';
  requested_dur interval;
  wants_extended boolean := false;
  used_extra boolean := false;
  limit_broadcast_week int := 5;
begin
  if u_id is null then
    raise exception 'unauthorized';
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

  -- Reset windows if needed (mirror check_and_increment_quota behavior).
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
    base_range := 10000;
    base_dur := interval '24 hours';
    limit_broadcast_week := 20;
  elsif tier = 'gold' then
    base_range := 20000;
    base_dur := interval '48 hours';
    limit_broadcast_week := 20;
  end if;

  new.range_meters := coalesce(new.range_meters, base_range);
  if new.expires_at is null then
    new.expires_at := now() + base_dur;
  end if;
  requested_dur := new.expires_at - now();

  wants_extended := (new.range_meters > base_range) or (requested_dur > base_dur);

  -- If user wants extension, consume one add-on token (if available) and clamp to 72h/20km.
  if wants_extended then
    if q.extra_broadcast_72h > 0 then
      q.extra_broadcast_72h := q.extra_broadcast_72h - 1;
      used_extra := true;
      new.range_meters := 20000;
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

  -- Weekly broadcast quota. If exceeded, allow only if an extra token is available.
  if q.broadcast_alerts_week < limit_broadcast_week then
    q.broadcast_alerts_week := q.broadcast_alerts_week + 1;
    q.broadcast_week_used := q.broadcast_alerts_week;
  else
    if used_extra then
      -- The extension token also grants +1 broadcast when weekly limit is exceeded.
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

  return new;
end;
$$;

drop trigger if exists trg_map_alerts_contract on public.map_alerts;
create trigger trg_map_alerts_contract
before insert on public.map_alerts
for each row
execute function public.enforce_map_alert_contract();
