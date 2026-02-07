-- Family quota sharing + monthly quota refresh (SPEC)

-- Refresh quotas on the 1st day of each month (subscription cycle baseline)
create or replace function public.refresh_subscription_quotas()
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set
    stars_count = case when tier = 'gold' then 3 else 0 end,
    mesh_alert_count = case when tier = 'premium' then 20 when tier = 'gold' then 999999 else 5 end,
    media_credits = case when tier = 'premium' then 10 when tier = 'gold' then 50 else 0 end,
    updated_at = now();
end;
$$;

-- Run quota refresh monthly on day 1 at 00:00
select
  case
    when not exists (select 1 from cron.job where jobname = 'refresh_subscription_quotas_monthly')
      then cron.schedule('refresh_subscription_quotas_monthly', '0 0 1 * *', 'select public.refresh_subscription_quotas();')
    else null
  end;

-- Upgrade/downgrade should reset tier-based quotas immediately
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
    stars_count = case when p_tier = 'gold' then 3 else 0 end,
    mesh_alert_count = case when p_tier = 'premium' then 20 when p_tier = 'gold' then 999999 else 5 end,
    media_credits = case when p_tier = 'premium' then 10 when p_tier = 'gold' then 50 else 0 end,
    updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.downgrade_user_tier(
  p_user_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set
    tier = 'free',
    subscription_status = 'canceled',
    stripe_subscription_id = null,
    stars_count = 0,
    mesh_alert_count = 5,
    media_credits = 0,
    updated_at = now()
  where id = p_user_id;
end;
$$;

-- Family-aware quota consumption across Social/Chats/AI Vet
create or replace function public.check_and_increment_quota(action_type text)
returns boolean
language plpgsql
security definer
as $$
declare
  u_id uuid := auth.uid();
  owner_id uuid;
  tier text;
  remaining_media int;
  remaining_alert int;
  remaining_star int;
  thread_count int;
  thread_limit int;
begin
  if u_id is null then
    return false;
  end if;

  select fm.inviter_user_id into owner_id
  from public.family_members fm
  where fm.invitee_user_id = u_id and fm.status = 'accepted'
  limit 1;

  owner_id := coalesce(owner_id, u_id);

  select p.tier, coalesce(p.media_credits,0), coalesce(p.mesh_alert_count,0), coalesce(p.stars_count,0)
    into tier, remaining_media, remaining_alert, remaining_star
  from public.profiles p
  where p.id = owner_id;

  if action_type = 'thread_post' then
    if tier = 'gold' then
      thread_limit := 30;
    elsif tier = 'premium' then
      thread_limit := 5;
    else
      thread_limit := 1;
    end if;

    select count(*) into thread_count
    from public.threads
    where user_id = owner_id
      and created_at > now() - interval '30 days';

    if thread_count >= thread_limit then
      return false;
    end if;
    return true;
  end if;

  if action_type in ('chat_image', 'ai_vision', 'thread_image', 'social_image') then
    if remaining_media <= 0 then
      return false;
    end if;
    update public.profiles
    set media_credits = greatest(coalesce(media_credits,0) - 1, 0)
    where id = owner_id;
    return true;
  end if;

  if action_type in ('mesh_alert', 'emergency_alert') then
    if tier = 'gold' then
      return true;
    end if;
    if remaining_alert <= 0 then
      return false;
    end if;
    update public.profiles
    set mesh_alert_count = greatest(coalesce(mesh_alert_count,0) - 1, 0)
    where id = owner_id;
    return true;
  end if;

  if action_type = 'star' then
    if remaining_star <= 0 then
      return false;
    end if;
    update public.profiles
    set stars_count = greatest(coalesce(stars_count,0) - 1, 0)
    where id = owner_id;
    return true;
  end if;

  return true;
end;
$$;
