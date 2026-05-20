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
