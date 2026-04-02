
drop policy if exists "pet_care_profiles_public_listed_read" on public.pet_care_profiles;
drop policy if exists "pet_care_profiles_public_listed_verified_read" on public.pet_care_profiles;

create policy "pet_care_profiles_public_listed_verified_read"
  on public.pet_care_profiles
  for select
  using (
    listed is true
    and exists (
      select 1
      from public.profiles p
      where p.id = pet_care_profiles.user_id
        and p.is_verified = true
    )
  );
;
