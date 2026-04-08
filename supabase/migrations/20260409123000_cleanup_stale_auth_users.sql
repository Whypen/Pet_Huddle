-- Manual cleanup: remove stale auth identities that should not block re-registration.
-- 1) Remove auth users whose profile is explicitly removed.
-- 2) Remove orphan auth users with no profile and older than 24h.

with removed_profiles as (
  delete from auth.users u
  using public.profiles p
  where p.id = u.id
    and p.account_status = 'removed'
  returning u.id
)
select count(*) as removed_profile_auth_users_deleted from removed_profiles;

with stale_orphans as (
  delete from auth.users u
  where not exists (
      select 1 from public.profiles p where p.id = u.id
    )
    and u.created_at < now() - interval '24 hours'
  returning u.id
)
select count(*) as stale_orphan_auth_users_deleted from stale_orphans;
