-- Keep profiles.effective_tier synchronized with current family truth.
-- Regression fix: users with no accepted family links must resolve to base tier.

create or replace function public._qms_refresh_effective_tier_for_seed(p_seed_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed uuid := p_seed_user_id;
begin
  if v_seed is null then
    return;
  end if;

  with recursive owner_chain(member_id, depth, path) as (
    select v_seed, 0, array[v_seed]::uuid[]
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
    select v_seed as member_id
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
-- One-time repair/backfill so stale rows stop overriding current truth.
update public.profiles p
set effective_tier = public._qms_effective_tier(p.id)::public.tier_enum
where coalesce(p.effective_tier::text, '') is distinct from public._qms_effective_tier(p.id);
