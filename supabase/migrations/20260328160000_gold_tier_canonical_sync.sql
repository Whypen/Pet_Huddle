-- Canonical GOLD support sync
-- Ensures backend canonical tier keys are free/plus/gold and effective_tier recompute is non-circular.

-- 1) Ensure enum supports gold.
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'tier_enum'
  ) and not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'tier_enum'
      and e.enumlabel = 'gold'
  ) then
    alter type public.tier_enum add value 'gold';
  end if;
end$$;

-- 2) Canonicalize persisted legacy values.
update public.profiles
set tier = 'plus'
where lower(coalesce(tier, '')) = 'premium';

-- 3) Non-circular effective tier resolution:
--    derive from base profile tier + linked accepted family tiers only.
create or replace function public._qms_effective_tier(p_user_id uuid)
returns text
language sql
stable
as $$
  with recursive owner_chain(member_id, depth, path) as (
    select p_user_id, 0, array[p_user_id]::uuid[]
    union all
    select
      parent.inviter_user_id,
      oc.depth + 1,
      oc.path || parent.inviter_user_id
    from owner_chain oc
    join lateral (
      select fm.inviter_user_id
      from public.family_members fm
      where fm.status = 'accepted'
        and fm.invitee_user_id = oc.member_id
      order by fm.created_at asc, fm.id asc
      limit 1
    ) parent on true
    where oc.depth < 8
      and parent.inviter_user_id is not null
      and not (parent.inviter_user_id = any(oc.path))
  ),
  owner_root as (
    select oc.member_id as owner_id
    from owner_chain oc
    order by oc.depth desc
    limit 1
  ),
  recursive_family(owner_id, member_id, depth, path) as (
    select oroot.owner_id, oroot.owner_id, 0, array[oroot.owner_id]::uuid[]
    from owner_root oroot
    union all
    select
      rf.owner_id,
      fm.invitee_user_id,
      rf.depth + 1,
      rf.path || fm.invitee_user_id
    from recursive_family rf
    join public.family_members fm
      on fm.status = 'accepted'
     and fm.inviter_user_id = rf.member_id
    where rf.depth < 8
      and not (fm.invitee_user_id = any(rf.path))
  ),
  family_memberset as (
    select distinct member_id from recursive_family
  ),
  fallback_self as (
    select p_user_id as member_id
    where not exists (select 1 from family_memberset)
  ),
  target_users as (
    select member_id from family_memberset
    union
    select member_id from fallback_self
  ),
  ranked as (
    select
      case
        when lower(coalesce(p.tier, 'free')) = 'gold' then 3
        when lower(coalesce(p.tier, 'free')) in ('plus','premium') then 2
        else 1
      end as rank
    from public.profiles p
    join target_users tu on tu.member_id = p.id
  )
  select case coalesce(max(rank), 1)
    when 3 then 'gold'
    when 2 then 'plus'
    else 'free'
  end
  from ranked;
$$;

-- 4) Keep effective_tier synchronized with current family truth.
create or replace function public._qms_refresh_effective_tier_for_seed(p_seed_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_seed_user_id is null then
    return;
  end if;

  with recursive owner_chain(member_id, depth, path) as (
    select p_seed_user_id, 0, array[p_seed_user_id]::uuid[]
    union all
    select
      parent.inviter_user_id,
      oc.depth + 1,
      oc.path || parent.inviter_user_id
    from owner_chain oc
    join lateral (
      select fm.inviter_user_id
      from public.family_members fm
      where fm.status = 'accepted'
        and fm.invitee_user_id = oc.member_id
      order by fm.created_at asc, fm.id asc
      limit 1
    ) parent on true
    where oc.depth < 8
      and parent.inviter_user_id is not null
      and not (parent.inviter_user_id = any(oc.path))
  ),
  owner_root as (
    select member_id as owner_id
    from owner_chain
    order by depth desc
    limit 1
  ),
  recursive_family(owner_id, member_id, depth, path) as (
    select oroot.owner_id, oroot.owner_id, 0, array[oroot.owner_id]::uuid[]
    from owner_root oroot
    union all
    select
      rf.owner_id,
      fm.invitee_user_id,
      rf.depth + 1,
      rf.path || fm.invitee_user_id
    from recursive_family rf
    join public.family_members fm
      on fm.status = 'accepted'
     and fm.inviter_user_id = rf.member_id
    where rf.depth < 8
      and not (fm.invitee_user_id = any(rf.path))
  ),
  family_memberset as (
    select distinct member_id from recursive_family
  ),
  fallback_self as (
    select p_seed_user_id as member_id
    where not exists (select 1 from family_memberset)
  ),
  target_users as (
    select member_id from family_memberset
    union
    select member_id from fallback_self
  )
  update public.profiles p
  set effective_tier = public._qms_effective_tier(p.id)::public.tier_enum
  where p.id in (select member_id from target_users)
    and coalesce(p.effective_tier::text, '') is distinct from public._qms_effective_tier(p.id);
end;
$$;

create or replace function public.trg_qms_refresh_effective_tier_on_family_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'accepted' then
      perform public._qms_refresh_effective_tier_for_seed(new.inviter_user_id);
      perform public._qms_refresh_effective_tier_for_seed(new.invitee_user_id);
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status = 'accepted' or new.status = 'accepted'
       or old.inviter_user_id is distinct from new.inviter_user_id
       or old.invitee_user_id is distinct from new.invitee_user_id then
      perform public._qms_refresh_effective_tier_for_seed(old.inviter_user_id);
      perform public._qms_refresh_effective_tier_for_seed(old.invitee_user_id);
      perform public._qms_refresh_effective_tier_for_seed(new.inviter_user_id);
      perform public._qms_refresh_effective_tier_for_seed(new.invitee_user_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.status = 'accepted' then
      perform public._qms_refresh_effective_tier_for_seed(old.inviter_user_id);
      perform public._qms_refresh_effective_tier_for_seed(old.invitee_user_id);
    end if;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_qms_refresh_effective_tier_on_family_members on public.family_members;
create trigger trg_qms_refresh_effective_tier_on_family_members
after insert or update or delete on public.family_members
for each row
execute function public.trg_qms_refresh_effective_tier_on_family_members();

create or replace function public.trg_qms_refresh_effective_tier_on_profile_tier_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.tier, 'free') is distinct from coalesce(old.tier, 'free') then
    perform public._qms_refresh_effective_tier_for_seed(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_qms_refresh_effective_tier_on_profile_tier_change on public.profiles;
create trigger trg_qms_refresh_effective_tier_on_profile_tier_change
after update of tier on public.profiles
for each row
execute function public.trg_qms_refresh_effective_tier_on_profile_tier_change();

-- 5) Canonical map entitlement tiers (free/plus/gold).
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

  base_range int := 10000;
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
    base_range := 25000;
    base_dur := interval '24 hours';
    limit_broadcast_week := 20;
  elsif tier = 'gold' then
    base_range := 50000;
    base_dur := interval '48 hours';
    limit_broadcast_week := 20;
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

  if q.broadcast_alerts_week < limit_broadcast_week then
    q.broadcast_alerts_week := q.broadcast_alerts_week + 1;
    q.broadcast_week_used := q.broadcast_alerts_week;
  else
    if used_extra then
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

  new.range_km := round((new.range_meters::numeric) / 1000.0, 2);
  new.duration_hours := greatest(1, round(extract(epoch from (new.expires_at - now())) / 3600.0));

  return new;
end;
$function$;

-- 6) Repair stale rows to current truth.
update public.profiles p
set effective_tier = public._qms_effective_tier(p.id)::public.tier_enum
where coalesce(p.effective_tier::text, '') is distinct from public._qms_effective_tier(p.id);
