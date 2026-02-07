-- Family quota sharing: count thread usage across family group

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
  family_ids uuid[];
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

    select array_agg(invitee_user_id)
      into family_ids
    from public.family_members
    where inviter_user_id = owner_id
      and status = 'accepted';

    family_ids := array_append(coalesce(family_ids, '{}'), owner_id);

    select count(*) into thread_count
    from public.threads
    where user_id = any(family_ids)
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
