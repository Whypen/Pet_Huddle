-- Sync backend quota enforcement with src/config/quotaConfig.ts and quotaConfig_v1.ts.
-- Native uses this RPC for discovery/star gates; web remains the source of truth for caps.

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

  limit_threads int := 10;
  limit_discovery int := 100;
  limit_media int := 5;
  limit_stars int := 0;
  limit_broadcast_week int := 10;
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

  -- Gold pools non-star quotas; other tiers are per-user.
  if tier <> 'gold' then
    owner_id := u_id;
    tier := public._qms_effective_tier(owner_id);
  end if;

  if tier = 'premium' then
    tier := 'plus';
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

  if tier = 'plus' then
    limit_threads := 30;
    limit_discovery := 250;
    limit_media := 20;
    limit_broadcast_week := 40;
  elsif tier = 'gold' then
    limit_threads := 60;
    limit_discovery := 400;
    limit_media := 40;
    limit_broadcast_week := 80;
  end if;

  if action_type = 'thread_post' then
    if q.thread_posts_today < limit_threads then
      q.thread_posts_today := q.thread_posts_today + 1;
    else
      return false;
    end if;

  elsif action_type in ('discovery', 'discovery_profile', 'discovery_view') then
    if q.discovery_views_today >= limit_discovery then
      return false;
    end if;
    q.discovery_views_today := q.discovery_views_today + 1;
    q.discovery_profiles_today := q.discovery_views_today;

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
    -- Broadcast create/update enforcement is handled by map_alerts triggers.
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
