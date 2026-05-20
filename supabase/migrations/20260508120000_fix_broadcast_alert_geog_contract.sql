create or replace function public.enforce_broadcast_alert_contract()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  u_id uuid := auth.uid();
  owner_id uuid;
  tier text;
  q public.user_quotas%rowtype;
  today date := current_date;
  mo date;

  base_range int := 5000;
  base_dur interval := interval '12 hours';
  requested_dur interval;
  wants_extended boolean := false;
  active_limit int := 3;
  active_used int := 0;
  profile_is_verified boolean := false;
  profile_verification_status text;
begin
  if u_id is null then
    if new.creator_id is null then
      raise exception 'unauthorized';
    end if;
    u_id := new.creator_id;
  end if;

  new.geog := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;

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
  if q.month_start <> mo then
    q.month_start := mo;
    q.stars_used_cycle := 0;
    q.stars_month_used := 0;
  end if;

  if tier = 'plus' or tier = 'premium' then
    base_range := 10000;
    base_dur := interval '24 hours';
    active_limit := 5;
  elsif tier = 'gold' then
    base_range := 20000;
    base_dur := interval '48 hours';
    active_limit := 10;
  end if;

  select
    coalesce(p.is_verified, false),
    lower(coalesce(p.verification_status::text, ''))
  into profile_is_verified, profile_verification_status
  from public.profiles p
  where p.id = owner_id;

  if not found then
    profile_is_verified := false;
    profile_verification_status := '';
  end if;

  if profile_verification_status = 'verified' then
    profile_is_verified := true;
  end if;

  if profile_is_verified then
    active_limit := active_limit + 10;
  end if;

  select count(*)::int into active_used
  from public.broadcast_alerts b
  where b.creator_id = owner_id
    and coalesce(b.expires_at, b.created_at + make_interval(hours => greatest(1, least(72, coalesce(b.duration_hours, 0))))) > now();

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

  if active_used >= active_limit then
    if q.extra_broadcast_72h > 0 and wants_extended then
      null;
    else
      raise exception 'active_broadcast_limit_reached';
    end if;
  end if;

  if wants_extended then
    if q.extra_broadcast_72h > 0 then
      q.extra_broadcast_72h := q.extra_broadcast_72h - 1;
      new.range_meters := 50000;
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

  update public.user_quotas
  set
    day_start = q.day_start,
    month_start = q.month_start,
    extra_broadcast_72h = q.extra_broadcast_72h,
    updated_at = now()
  where user_id = owner_id;

  new.range_km := round((new.range_meters::numeric) / 1000.0, 2);
  new.duration_hours := greatest(1, round(extract(epoch from (new.expires_at - now())) / 3600.0));

  return new;
end;
$$;
