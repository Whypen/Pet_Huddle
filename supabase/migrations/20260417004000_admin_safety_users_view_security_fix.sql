-- Fix live admin users queue access.
-- This view must run with definer context so authenticated admins can read the
-- aggregate queue without base-table RLS causing 403 responses.

alter view if exists public.view_admin_safety_users
  set (security_invoker = false);

revoke all on public.view_admin_safety_users from anon;
revoke all on public.view_admin_safety_users from authenticated;
revoke all on public.view_admin_safety_users from service_role;

grant select on public.view_admin_safety_users to authenticated;
grant select on public.view_admin_safety_users to service_role;
