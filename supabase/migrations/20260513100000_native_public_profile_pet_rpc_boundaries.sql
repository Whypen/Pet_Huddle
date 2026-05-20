create or replace function public.get_native_public_profile_snapshot(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with target_profile as (
    select p.*
    from public.profiles p
    where p.id = p_user_id
      and auth.uid() is not null
      and (
        p.id = auth.uid()
        or (
          coalesce(p.non_social, false) = false
          and not public.is_user_blocked(auth.uid(), p.id)
          and public.is_in_scope(auth.uid(), p.id)
        )
      )
    limit 1
  ),
  pet_heads as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', pet.id,
      'name', pet.name,
      'species', pet.species,
      'dob', pet.dob,
      'photo_url', pet.photo_url,
      'is_active', pet.is_active,
      'is_public', pet.is_public
    ) order by pet.created_at asc nulls last), '[]'::jsonb) as pets
    from public.pets pet
    where pet.owner_id = p_user_id
      and coalesce(pet.is_active, true) = true
      and (
        p_user_id = auth.uid()
        or coalesce(pet.is_public, false) = true
      )
      and exists (select 1 from target_profile)
  ),
  profile_json as (
    select to_jsonb(tp) || jsonb_build_object('pet_heads', coalesce((select pets from pet_heads), '[]'::jsonb)) as profile
    from target_profile tp
  ),
  member_number as (
    select count(*)::integer as value
    from public.profiles p
    join target_profile tp on true
    where p.created_at < tp.created_at
       or (p.created_at = tp.created_at and p.id <= tp.id)
  )
  select jsonb_build_object(
    'profile', (select profile from profile_json),
    'member_number', (select value from member_number)
  )
  where exists (select 1 from target_profile);
$$;

revoke all on function public.get_native_public_profile_snapshot(uuid) from public, anon;
grant execute on function public.get_native_public_profile_snapshot(uuid) to authenticated, service_role;

create or replace function public.get_native_public_profile_pet(
  p_pet_id uuid default null,
  p_owner_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with target_pet as (
    select pet.*
    from public.pets pet
    where auth.uid() is not null
      and coalesce(pet.is_active, true) = true
      and (
        (p_pet_id is not null and pet.id = p_pet_id)
        or (p_pet_id is null and p_owner_id is not null and pet.owner_id = p_owner_id)
      )
      and (
        pet.owner_id = auth.uid()
        or (
          coalesce(pet.is_public, false) = true
          and not public.is_user_blocked(auth.uid(), pet.owner_id)
          and exists (
            select 1
            from public.profiles p
            where p.id = pet.owner_id
              and coalesce(p.non_social, false) = false
              and public.is_in_scope(auth.uid(), p.id)
          )
        )
      )
    order by pet.created_at asc nulls last
    limit 1
  )
  select to_jsonb(target_pet)
  from target_pet;
$$;

revoke all on function public.get_native_public_profile_pet(uuid, uuid) from public, anon;
grant execute on function public.get_native_public_profile_pet(uuid, uuid) to authenticated, service_role;

create or replace function public.get_native_public_profile_relationship(p_target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  )
  select jsonb_build_object(
    'blocked', exists (
      select 1
      from public.user_blocks ub
      join viewer v on v.user_id is not null
      where (ub.blocker_id = v.user_id and ub.blocked_id = p_target_user_id)
         or (ub.blocker_id = p_target_user_id and ub.blocked_id = v.user_id)
    ),
    'active_match', exists (
      select 1
      from public.matches m
      join viewer v on v.user_id is not null
      where coalesce(m.is_active, true) = true
        and (
          (m.user1_id = v.user_id and m.user2_id = p_target_user_id)
          or (m.user1_id = p_target_user_id and m.user2_id = v.user_id)
        )
    )
  )
  where (select user_id from viewer) is not null;
$$;

revoke all on function public.get_native_public_profile_relationship(uuid) from public, anon;
grant execute on function public.get_native_public_profile_relationship(uuid) to authenticated, service_role;
