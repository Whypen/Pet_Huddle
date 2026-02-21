begin;

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
  monthly_quota int := 10;
  active_slots int := 7;
  active_count int := 0;
  allow_slot_overflow boolean := false;
begin
  if u_id is null then
    if new.creator_id is null then
      raise exception 'unauthorized';
    end if;
    u_id := new.creator_id;
  end if;

  new.location_geog := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;

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
    q.broadcast_month_used := 0;
  end if;

  if tier = 'plus' then
    base_range := 25000;
    base_dur := interval '24 hours';
    monthly_quota := 40;
  elsif tier = 'gold' then
    base_range := 50000;
    base_dur := interval '48 hours';
    monthly_quota := 80;
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
      allow_slot_overflow := true;
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

  select count(*) into active_count
  from public.map_alerts
  where creator_id = owner_id
    and is_active = true
    and (expires_at is null or expires_at > now());

  if active_count >= active_slots and not allow_slot_overflow then
    raise exception 'active_slots_full';
  end if;

  if q.broadcast_month_used < monthly_quota then
    q.broadcast_month_used := q.broadcast_month_used + 1;
  else
    if used_extra then
      null;
    elsif q.extra_broadcast_72h > 0 then
      q.extra_broadcast_72h := q.extra_broadcast_72h - 1;
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
    broadcast_month_used = q.broadcast_month_used,
    extra_broadcast_72h = q.extra_broadcast_72h,
    updated_at = now()
  where user_id = owner_id;

  new.range_km := round((new.range_meters::numeric) / 1000.0, 2);
  new.duration_hours := greatest(1, round(extract(epoch from (new.expires_at - now())) / 3600.0));

  return new;
end;
$$;

drop function if exists public.get_quota_snapshot();

create function public.get_quota_snapshot()
returns table(
  user_id uuid,
  tier text,
  day_start date,
  week_start date,
  month_start date,
  thread_posts_today integer,
  discovery_views_today integer,
  media_usage_today integer,
  stars_used_cycle integer,
  broadcast_alerts_week integer,
  broadcast_month_used integer,
  extra_stars integer,
  extra_media_10 integer,
  extra_broadcast_72h integer
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
    uq.broadcast_month_used,
    uq.extra_stars,
    uq.extra_media_10,
    uq.extra_broadcast_72h
  from public.user_quotas uq
  where uq.user_id = (select o from effective);
$$;

commit;
