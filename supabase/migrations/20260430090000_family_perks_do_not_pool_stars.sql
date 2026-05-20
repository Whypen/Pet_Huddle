-- Family sharing inherits higher membership feature access only.
-- Star quota and star add-ons remain owned by the acting user's own tier/quota row.

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

  if action_type = 'star' then
    owner_id := u_id;
    select lower(coalesce(p.tier, 'free')) into tier
    from public.profiles p
    where p.id = u_id;
    tier := coalesce(tier, 'free');

    if tier = 'premium' then
      tier := 'plus';
    end if;

    perform public._qms_touch_row(owner_id);
    select * into q from public.user_quotas where user_id = owner_id for update;
    mo := public._qms_cycle_month_start(owner_id);

    if q.month_start <> mo then
      q.month_start := mo;
      q.stars_used_cycle := 0;
      q.stars_month_used := 0;
    end if;

    if tier = 'plus' then
      limit_stars := 4;
    elsif tier = 'gold' then
      limit_stars := 10;
    else
      limit_stars := 0;
    end if;

    if q.stars_used_cycle < limit_stars then
      q.stars_used_cycle := q.stars_used_cycle + 1;
      q.stars_month_used := q.stars_used_cycle;
    elsif q.extra_stars > 0 then
      q.extra_stars := q.extra_stars - 1;
    else
      return false;
    end if;

    update public.user_quotas
    set
      month_start = q.month_start,
      stars_month_used = q.stars_month_used,
      stars_used_cycle = q.stars_used_cycle,
      extras_stars = q.extras_stars,
      extra_stars = q.extra_stars,
      updated_at = now()
    where user_id = owner_id;

    return true;
  end if;

  owner_id := public._qms_get_pool_owner(u_id);
  tier := public._qms_effective_tier(owner_id);

  -- Gold pools non-star quotas; others are per-user.
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

  -- Tier limits.
  if tier = 'plus' or tier = 'premium' then
    limit_threads := 5;
    limit_discovery := 2147483647;
    limit_media := 10;
    limit_broadcast_week := 20;
  elsif tier = 'gold' then
    limit_threads := 20;
    limit_discovery := 2147483647;
    limit_media := 50;
    limit_broadcast_week := 20;
  else
    -- free defaults already set
  end if;

  if action_type = 'thread_post' then
    if q.thread_posts_today < limit_threads then
      q.thread_posts_today := q.thread_posts_today + 1;
    else
      return false;
    end if;

  elsif action_type in ('discovery_profile', 'discovery_view') then
    if tier in ('plus','premium','gold') then
      null; -- unlimited
    else
      if q.discovery_views_today >= limit_discovery then
        return false;
      end if;
      q.discovery_views_today := q.discovery_views_today + 1;
      q.discovery_profiles_today := q.discovery_views_today;
    end if;

  elsif action_type in ('media', 'ai_vet_upload', 'thread_image', 'chat_image', 'broadcast_media', 'video_upload') then
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

  else
    -- Broadcast quotas are enforced by map_alerts trigger.
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
  update public.profiles
  set
    stars_count = greatest(0, coalesce(stars_count, 0) + coalesce(p_stars, 0)),
    mesh_alert_count = greatest(0, coalesce(mesh_alert_count, 0) + coalesce(p_mesh_alerts, 0)),
    media_credits = greatest(0, coalesce(media_credits, 0) + coalesce(p_media_credits, 0)),
    family_slots = greatest(0, coalesce(family_slots, 0) + coalesce(p_family_slots, 0)),
    updated_at = now()
  where id = p_user_id;

  perform public._qms_touch_row(p_user_id);

  update public.user_quotas
  set
    extra_stars = extra_stars + greatest(0, coalesce(p_stars, 0)),
    updated_at = now()
  where user_id = p_user_id;

  owner_id := public._qms_get_pool_owner(p_user_id);
  tier := public._qms_effective_tier(owner_id);
  if tier <> 'gold' then
    owner_id := p_user_id;
  end if;

  perform public._qms_touch_row(owner_id);

  update public.user_quotas
  set
    extra_media_10 = extra_media_10 + greatest(0, coalesce(p_media_credits, 0)),
    extra_broadcast_72h = extra_broadcast_72h + greatest(0, coalesce(p_mesh_alerts, 0)),
    updated_at = now()
  where user_id = owner_id;
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
    uq.extra_broadcast_72h
  from public.user_quotas uq
  left join own_quota own on true
  where uq.user_id = (select owner_id from quota_owner);
$$;

revoke all on function public.get_quota_snapshot() from anon;
grant execute on function public.get_quota_snapshot() to authenticated;
grant execute on function public.get_quota_snapshot() to service_role;
