-- Enforce family-linked entitlement by highest tier in owner-rooted accepted family tree.
-- This removes directional inviter-only inheritance while keeping strict owner-root scope.
create or replace function public._qms_effective_tier(p_user_id uuid)
returns text
language sql
stable
as $$
  with recursive owner_chain(member_id, depth, path) as (
    select p_user_id, 0, array[p_user_id]::uuid[]
    union
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
    union
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
  ranked as (
    select
      case
        when lower(coalesce(p.tier, 'free')) = 'gold' then 3
        when lower(coalesce(p.tier, 'free')) in ('premium','plus') then 2
        else 1
      end as rank
    from public.profiles p
    join family_memberset fm on fm.member_id = p.id
  )
  select case coalesce(max(rank), 1)
    when 3 then 'gold'
    when 2 then 'plus'
    else 'free'
  end
  from ranked;
$$;
