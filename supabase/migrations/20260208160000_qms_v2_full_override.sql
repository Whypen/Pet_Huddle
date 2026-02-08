-- v2.0 Full Override: QMS (Quota Management System)
-- Nuclear override per contract requirements:
-- - Quotas are enforced via public.user_quotas and public.check_and_increment_quota(action_type text)
-- - Extras are consumed first when base is exhausted.
-- - Gold family pooling applies to: threads, AI Vet uploads, stars, broadcasts, priority analyses.
-- - Resets: daily/weekly (UTC). Monthly resets are computed per-user based on subscription cycle anchor (anniversary),
--   and are applied via daily rollover; a fixed calendar-month cron reset is not correct for anniversary cycles.

-- 0) Subscription cycle anchor support (anniversary-based monthly counters)
alter table public.profiles
  add column if not exists subscription_cycle_anchor_day int,
  add column if not exists subscription_current_period_start timestamptz,
  add column if not exists subscription_current_period_end timestamptz;

comment on column public.profiles.subscription_cycle_anchor_day is
  'Day-of-month (1-31) used as billing cycle anchor for monthly quota resets (Stripe billing_cycle_anchor-derived).';
comment on column public.profiles.subscription_current_period_start is
  'Stripe subscription current_period_start (UTC) for auditing and support.';
comment on column public.profiles.subscription_current_period_end is
  'Stripe subscription current_period_end (UTC) for auditing and support.';

-- 1) Replace legacy user_quotas with contract-shaped table (single row per pool owner).
do $$
begin
  if to_regclass('public.user_quotas') is not null and to_regclass('public.user_quotas_legacy_20260208') is null then
    execute 'alter table public.user_quotas rename to user_quotas_legacy_20260208';
  end if;
exception when others then
  -- If rename fails (permissions or already renamed), continue; table creation below is idempotent.
  null;
end $$;

create table if not exists public.user_quotas (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  day_start date not null default current_date,
  week_start date not null default date_trunc('week', now())::date,
  month_start date not null default date_trunc('month', now())::date,

  thread_posts_today int not null default 0,
  discovery_profiles_today int not null default 0,
  ai_vet_uploads_today int not null default 0,

  stars_month_used int not null default 0,
  broadcast_week_used int not null default 0,
  broadcast_month_used int not null default 0,
  priority_analyses_month_used int not null default 0,

  extras_stars int not null default 0,
  extras_ai_vet_uploads int not null default 0,
  extras_broadcasts int not null default 0,

  updated_at timestamptz not null default now()
);

create index if not exists idx_user_quotas_day on public.user_quotas(day_start);

alter table public.user_quotas enable row level security;

drop policy if exists "user_quotas_read_own" on public.user_quotas;
create policy "user_quotas_read_own"
on public.user_quotas
for select
using (auth.uid() = user_id);

drop policy if exists "user_quotas_service_role_all" on public.user_quotas;
create policy "user_quotas_service_role_all"
on public.user_quotas
for all
using ((auth.jwt() ->> 'role') = 'service_role')
with check ((auth.jwt() ->> 'role') = 'service_role');

-- 2) Helpers
create or replace function public._qms_get_pool_owner(p_user_id uuid)
returns uuid
language sql
stable
as $$
  select coalesce(
    (
      select fm.inviter_user_id
      from public.family_members fm
      where fm.invitee_user_id = p_user_id
        and fm.status = 'accepted'
      limit 1
    ),
    p_user_id
  );
$$;

create or replace function public._qms_effective_tier(p_user_id uuid)
returns text
language sql
stable
as $$
  -- Some environments do not have a physical profiles.effective_tier column.
  -- Use row_to_json(...) access to tolerate absence while still honoring it when present.
  select coalesce(nullif((row_to_json(p)::jsonb->>'effective_tier'), ''), p.tier, 'free')
  from public.profiles p
  where p.id = p_user_id;
$$;

create or replace function public._qms_cycle_month_start(p_owner_id uuid)
returns date
language plpgsql
stable
as $$
declare
  tier text;
  anchor_day int;
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

  -- Free users use calendar-month counters (they do not have subscription cycles).
  if tier not in ('premium', 'gold') then
    return date_trunc('month', today)::date;
  end if;

  select coalesce(p.subscription_cycle_anchor_day, 1)
  into anchor_day
  from public.profiles p
  where p.id = p_owner_id;

  if anchor_day < 1 then anchor_day := 1; end if;
  if anchor_day > 31 then anchor_day := 31; end if;

  -- Clamp to month length.
  this_anchor := make_date(base_year, base_month, least(anchor_day, last_day_this_month));
  prev_anchor := make_date(prev_year, prev_month, least(anchor_day, last_day_prev_month));

  if today >= this_anchor then
    return this_anchor;
  end if;
  return prev_anchor;
end;
$$;

create or replace function public._qms_touch_row(p_owner_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.user_quotas(user_id)
  values (p_owner_id)
  on conflict (user_id) do nothing;
end;
$$;

-- 3) Resets (cron calls)
create or replace function public.qms_reset_daily()
returns void
language plpgsql
security definer
as $$
begin
  update public.user_quotas
  set
    day_start = current_date,
    thread_posts_today = 0,
    discovery_profiles_today = 0,
    ai_vet_uploads_today = 0,
    updated_at = now()
  where day_start <> current_date;
end;
$$;

create or replace function public.qms_reset_weekly()
returns void
language plpgsql
security definer
as $$
declare
  wk date := date_trunc('week', now())::date;
begin
  update public.user_quotas
  set
    week_start = wk,
    broadcast_week_used = 0,
    updated_at = now()
  where week_start <> wk;
end;
$$;

create or replace function public.qms_reset_monthly()
returns void
language plpgsql
security definer
as $$
begin
  -- Kept for backwards compatibility; monthly rollovers are applied per-user via qms_rollover_all().
  perform 1;
end;
$$;

create or replace function public.qms_rollover_all()
returns void
language plpgsql
security definer
as $$
declare
  wk date := date_trunc('week', now())::date;
begin
  -- Daily counters
  update public.user_quotas
  set
    day_start = current_date,
    thread_posts_today = 0,
    discovery_profiles_today = 0,
    ai_vet_uploads_today = 0,
    updated_at = now()
  where day_start <> current_date;

  -- Weekly counters (Free broadcast weekly)
  update public.user_quotas
  set
    week_start = wk,
    broadcast_week_used = 0,
    updated_at = now()
  where week_start <> wk;

  -- Monthly counters (anniversary-based for premium/gold; calendar month for free)
  update public.user_quotas uq
  set
    month_start = ms.cycle_start,
    stars_month_used = 0,
    broadcast_month_used = 0,
    priority_analyses_month_used = 0,
    updated_at = now()
  from (
    select
      user_id,
      public._qms_cycle_month_start(user_id) as cycle_start
    from public.user_quotas
  ) ms
  where uq.user_id = ms.user_id
    and uq.month_start <> ms.cycle_start;
end;
$$;

-- Schedule resets (UTC). (Daily 00:00, Weekly Monday 00:00, Monthly day 1 00:00)
do $$
begin
  perform 1 from pg_extension where extname = 'pg_cron';
exception when undefined_table then
  -- pg_cron not installed in some environments; skip scheduling.
  return;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'qms_rollover_all') then
      perform cron.schedule('qms_rollover_all', '0 0 * * *', 'select public.qms_rollover_all();');
    end if;
    if not exists (select 1 from cron.job where jobname = 'qms_reset_weekly') then
      perform cron.schedule('qms_reset_weekly', '0 0 * * 1', 'select public.qms_reset_weekly();');
    end if;
  end if;
end $$;

-- 4) Main contract function: check_and_increment_quota(action_type)
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

  limit_threads int := 3;
  limit_discovery int := 40;
  limit_ai int := 0;
  limit_stars int := 0;
  limit_broadcast_week int := 3;
  limit_broadcast_month int := 0; -- free uses weekly only
  limit_priority int := 0;
begin
  if u_id is null then
    return false;
  end if;

  owner_id := public._qms_get_pool_owner(u_id);

  -- Determine tier from owner. Only Gold pools; Premium/Free do not pool.
  tier := public._qms_effective_tier(owner_id);
  if tier <> 'gold' then
    owner_id := u_id;
    tier := public._qms_effective_tier(owner_id);
  end if;

  perform public._qms_touch_row(owner_id);
  select * into q from public.user_quotas where user_id = owner_id;
  mo := public._qms_cycle_month_start(owner_id);

  -- Period auto-resets (idempotent, cron also exists)
  if q.day_start <> today then
    q.day_start := today;
    q.thread_posts_today := 0;
    q.discovery_profiles_today := 0;
    q.ai_vet_uploads_today := 0;
  end if;
  if q.week_start <> wk then
    q.week_start := wk;
    q.broadcast_week_used := 0;
  end if;
  if q.month_start <> mo then
    q.month_start := mo;
    q.stars_month_used := 0;
    q.broadcast_month_used := 0;
    q.priority_analyses_month_used := 0;
  end if;

  -- Tier limits
  if tier = 'premium' then
    limit_threads := 15;
    limit_discovery := 2147483647;
    limit_ai := 10;
    limit_stars := 0;
    limit_broadcast_week := 0;
    limit_broadcast_month := 30;
    limit_priority := 0;
  elsif tier = 'gold' then
    limit_threads := 30;
    limit_discovery := 2147483647;
    limit_ai := 20;
    limit_stars := 10;
    limit_broadcast_week := 0;
    limit_broadcast_month := 50;
    limit_priority := 5;
  else
    -- free defaults already set
    limit_broadcast_month := 0;
  end if;

  -- Apply action rules
  if action_type = 'thread_post' then
    if q.thread_posts_today < limit_threads then
      q.thread_posts_today := q.thread_posts_today + 1;
    elsif q.extras_ai_vet_uploads > 0 then
      -- Do not use ai-vet extras for threads; threads have no add-on in contract.
      return false;
    else
      return false;
    end if;

  elsif action_type = 'discovery_profile' then
    if tier in ('premium','gold') then
      -- unlimited; do not increment
      null;
    else
      if q.discovery_profiles_today >= limit_discovery then
        return false;
      end if;
      q.discovery_profiles_today := q.discovery_profiles_today + 1;
    end if;

  elsif action_type = 'ai_vet_upload' then
    if q.ai_vet_uploads_today < limit_ai then
      q.ai_vet_uploads_today := q.ai_vet_uploads_today + 1;
    elsif q.extras_ai_vet_uploads > 0 then
      q.extras_ai_vet_uploads := q.extras_ai_vet_uploads - 1;
    else
      return false;
    end if;

  elsif action_type = 'ai_vet_priority' then
    if q.priority_analyses_month_used < limit_priority then
      q.priority_analyses_month_used := q.priority_analyses_month_used + 1;
    else
      return false;
    end if;

  elsif action_type = 'star' then
    if q.stars_month_used < limit_stars then
      q.stars_month_used := q.stars_month_used + 1;
    elsif q.extras_stars > 0 then
      q.extras_stars := q.extras_stars - 1;
    else
      return false;
    end if;

  elsif action_type = 'broadcast_alert' then
    if tier = 'free' then
      if q.broadcast_week_used < limit_broadcast_week then
        q.broadcast_week_used := q.broadcast_week_used + 1;
      elsif q.extras_broadcasts > 0 then
        q.extras_broadcasts := q.extras_broadcasts - 1;
      else
        return false;
      end if;
    else
      if q.broadcast_month_used < limit_broadcast_month then
        q.broadcast_month_used := q.broadcast_month_used + 1;
      elsif q.extras_broadcasts > 0 then
        q.extras_broadcasts := q.extras_broadcasts - 1;
      else
        return false;
      end if;
    end if;

  elsif action_type = 'video_upload' then
    return (tier = 'gold');

  else
    -- Unknown action type: allow without increment
    return true;
  end if;

  update public.user_quotas
  set
    day_start = q.day_start,
    week_start = q.week_start,
    month_start = q.month_start,
    thread_posts_today = q.thread_posts_today,
    discovery_profiles_today = q.discovery_profiles_today,
    ai_vet_uploads_today = q.ai_vet_uploads_today,
    stars_month_used = q.stars_month_used,
    broadcast_week_used = q.broadcast_week_used,
    broadcast_month_used = q.broadcast_month_used,
    priority_analyses_month_used = q.priority_analyses_month_used,
    extras_stars = q.extras_stars,
    extras_ai_vet_uploads = q.extras_ai_vet_uploads,
    extras_broadcasts = q.extras_broadcasts,
    updated_at = now()
  where user_id = owner_id;

  return true;
end;
$$;

-- 5) Add-on wiring: Stripe webhook uses increment_user_credits(). Mirror add-ons into QMS extras.
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
  -- Preserve legacy credit fields (some UI may still read them).
  update public.profiles
  set
    stars_count = greatest(0, coalesce(stars_count, 0) + coalesce(p_stars, 0)),
    mesh_alert_count = greatest(0, coalesce(mesh_alert_count, 0) + coalesce(p_mesh_alerts, 0)),
    media_credits = greatest(0, coalesce(media_credits, 0) + coalesce(p_media_credits, 0)),
    family_slots = greatest(0, coalesce(family_slots, 0) + coalesce(p_family_slots, 0)),
    updated_at = now()
  where id = p_user_id;

  -- Contract override: add-ons increase QMS extras.
  owner_id := public._qms_get_pool_owner(p_user_id);
  tier := public._qms_effective_tier(owner_id);
  if tier <> 'gold' then
    owner_id := p_user_id;
  end if;

  perform public._qms_touch_row(owner_id);

  update public.user_quotas
  set
    extras_stars = extras_stars + greatest(0, coalesce(p_stars, 0)),
    extras_ai_vet_uploads = extras_ai_vet_uploads + greatest(0, coalesce(p_media_credits, 0)),
    extras_broadcasts = extras_broadcasts + greatest(0, coalesce(p_mesh_alerts, 0)),
    updated_at = now()
  where user_id = owner_id;
end;
$$;
