create or replace function public.enforce_map_alert_contract()
 returns trigger
 language plpgsql
 security definer
as $function$
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
$function$;
