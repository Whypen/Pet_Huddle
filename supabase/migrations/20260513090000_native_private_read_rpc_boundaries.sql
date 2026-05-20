create or replace function public.get_native_onboarding_snapshot()
returns table(
  profile_exists boolean,
  onboarding_completed boolean,
  owns_pets boolean,
  active_pet_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  profile_row as (
    select
      p.id,
      coalesce(p.onboarding_completed, false) as onboarding_completed,
      coalesce(p.owns_pets, false) as owns_pets
    from public.profiles p
    join viewer v on v.user_id = p.id
    limit 1
  ),
  active_pets as (
    select count(*)::int as active_pet_count
    from public.pets pet
    join viewer v on v.user_id = pet.owner_id
    where coalesce(pet.is_active, true) = true
  )
  select
    exists(select 1 from profile_row) as profile_exists,
    coalesce((select pr.onboarding_completed from profile_row pr), false) as onboarding_completed,
    coalesce((select pr.owns_pets from profile_row pr), false) as owns_pets,
    coalesce((select ap.active_pet_count from active_pets ap), 0) as active_pet_count
  from viewer
  where user_id is not null;
$$;

revoke all on function public.get_native_onboarding_snapshot() from public, anon;
grant execute on function public.get_native_onboarding_snapshot() to authenticated;

create or replace function public.get_native_chat_viewer_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'is_verified', p.is_verified,
    'verification_status', p.verification_status,
    'tier', p.tier,
    'effective_tier', coalesce(to_jsonb(p)->>'effective_tier', p.tier),
    'display_name', p.display_name
  )
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_native_chat_viewer_snapshot() from public, anon;
grant execute on function public.get_native_chat_viewer_snapshot() to authenticated;

create or replace function public.get_native_chat_profile_summaries(p_user_ids uuid[])
returns table (
  id uuid,
  display_name text,
  social_id text,
  avatar_url text,
  availability_status text[],
  user_role text,
  verification_status text,
  is_verified boolean,
  has_car boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  requested as (
    select distinct unnest(coalesce(p_user_ids, array[]::uuid[])) as user_id
    limit 100
  ),
  authorized_chats as (
    select coalesce(to_jsonb(crm)->>'chat_id', to_jsonb(crm)->>'room_id') as chat_id
    from public.chat_room_members crm
    join viewer v on v.user_id = crm.user_id
    where to_jsonb(crm)->>'deleted_at' is null
      and to_jsonb(crm)->>'left_at' is null
  ),
  allowed_users as (
    select v.user_id
    from viewer v
    where v.user_id is not null
    union
    select crm.user_id
    from public.chat_room_members crm
    join authorized_chats ac on ac.chat_id = coalesce(to_jsonb(crm)->>'chat_id', to_jsonb(crm)->>'room_id')
    where to_jsonb(crm)->>'deleted_at' is null
      and to_jsonb(crm)->>'left_at' is null
  )
  select
    p.id,
    p.display_name,
    to_jsonb(p)->>'social_id' as social_id,
    p.avatar_url,
    p.availability_status,
    p.user_role,
    p.verification_status,
    p.is_verified,
    p.has_car
  from requested r
  join allowed_users au on au.user_id = r.user_id
  join public.profiles p on p.id = r.user_id
  where not exists (
    select 1
    from public.user_blocks ub
    join viewer v on true
    where (ub.blocker_id = v.user_id and ub.blocked_id = p.id)
       or (ub.blocker_id = p.id and ub.blocked_id = v.user_id)
  );
$$;

revoke all on function public.get_native_chat_profile_summaries(uuid[]) from public, anon;
grant execute on function public.get_native_chat_profile_summaries(uuid[]) to authenticated;

create or replace function public.check_native_direct_relationship(p_target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  relationship as (
    select
      exists (
        select 1
        from public.user_blocks ub
        join viewer v on true
        where (ub.blocker_id = v.user_id and ub.blocked_id = p_target_user_id)
           or (ub.blocker_id = p_target_user_id and ub.blocked_id = v.user_id)
      ) as blocked,
      exists (
        select 1
        from public.user_unmatches uu
        join viewer v on true
        where (uu.actor_id = v.user_id and uu.target_id = p_target_user_id)
           or (uu.actor_id = p_target_user_id and uu.target_id = v.user_id)
      ) as unmatched
  )
  select jsonb_build_object(
    'allowed', (select user_id from viewer) is not null
      and p_target_user_id is not null
      and p_target_user_id <> (select user_id from viewer)
      and not blocked
      and not unmatched,
    'blocked', blocked,
    'unmatched', unmatched
  )
  from relationship;
$$;

revoke all on function public.check_native_direct_relationship(uuid) from public, anon;
grant execute on function public.check_native_direct_relationship(uuid) to authenticated;
