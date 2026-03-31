-- Provider public read: require verification_status = 'verified' at database layer.
--
-- The previous policy "pet_care_profiles_public_listed_read" allowed any
-- authenticated or anonymous client to read a pet_care_profiles row whenever
-- listed IS TRUE, with no verification check. This meant a listed-but-unverified
-- provider could appear in the public marketplace feed and provider-profile modal.
--
-- This migration replaces that policy with one that also requires the provider's
-- corresponding profiles row to have verification_status = 'verified'. The check
-- is performed via a correlated subquery so that no verification status column is needed on
-- pet_care_profiles itself.
--
-- Effect on read paths:
--   useServiceProviders      : DB returns only listed+verified rows; the
--                              app-layer filter in that hook becomes belt-and-suspenders.
--   PublicCarerProfileModal  : maybeSingle() returns null for unlisted or unverified
--                              providers; modal falls through to its existing
--                              "Provider is unavailable right now." error state.
--   useServiceChat           : reads counterpart stripe fields by user_id (no listed
--                              filter); covered by the owner-read policy if the
--                              counterpart is the authenticated user, and by this
--                              policy (listed+verified) for the other participant.
--                              The app already handles a null pcpRow gracefully.

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
        and p.verification_status = 'verified'
    )
  );
