alter table public.broadcast_alerts
  add column if not exists expires_at timestamptz;

update public.broadcast_alerts
set expires_at = coalesce(
  expires_at,
  created_at + make_interval(hours => greatest(1, least(72, coalesce(duration_hours, 0))))
)
where expires_at is null
  and duration_hours is not null;

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

  -- Super-broadcast bypass: allow +1 over cap when consuming an extra_broadcast_72h token
  if active_used >= active_limit then
    if q.extra_broadcast_72h > 0 and wants_extended then
      -- will be allowed; token consumed below
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
$function$;

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
  extra_broadcast_72h int,
  broadcast_active_limit int,
  broadcast_active_used int
)
language sql
security definer
as $$
  with me as (
    select auth.uid() as u
  ),
  pool_owner as (
    select public._qms_get_pool_owner((select u from me)) as owner_id
  ),
  quota_owner as (
    select
      case
        when public._qms_effective_tier((select owner_id from pool_owner)) = 'gold'
          then (select owner_id from pool_owner)
        else (select u from me)
      end as owner_id
  ),
  own_quota as (
    select uq.*
    from public.user_quotas uq
    where uq.user_id = (select u from me)
  ),
  owner_profile as (
    select
      coalesce(p.is_verified, false) as is_verified,
      lower(coalesce(p.verification_status::text, '')) as verification_status
    from public.profiles p
    where p.id = (select owner_id from quota_owner)
  ),
  active_usage as (
    select count(*)::int as broadcast_active_used
    from public.broadcast_alerts b
    where b.creator_id = (select owner_id from quota_owner)
      and coalesce(b.expires_at, b.created_at + make_interval(hours => greatest(1, least(72, coalesce(b.duration_hours, 0))))) > now()
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
    coalesce(own.stars_used_cycle, 0) as stars_used_cycle,
    uq.broadcast_alerts_week,
    coalesce(own.extra_stars, 0) as extra_stars,
    uq.extra_media_10,
    uq.extra_broadcast_72h,
    (case
      when public._qms_effective_tier(uq.user_id) in ('plus', 'premium') then 5
      when public._qms_effective_tier(uq.user_id) = 'gold' then 10
      else 3
    end +
      case
        when coalesce((select is_verified from owner_profile), false) or
          (select verification_status from owner_profile) = 'verified' then 10
        else 0
      end
    ) as broadcast_active_limit,
    coalesce((select broadcast_active_used from active_usage), 0) as broadcast_active_used
  from public.user_quotas uq
  left join own_quota own on true
  where uq.user_id = (select owner_id from quota_owner);
$$;

revoke all on function public.get_quota_snapshot() from anon;
grant execute on function public.get_quota_snapshot() to authenticated;
grant execute on function public.get_quota_snapshot() to service_role;
