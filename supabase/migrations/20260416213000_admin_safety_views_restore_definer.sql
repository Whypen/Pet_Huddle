-- Restore admin safety queues to run with definer context.
-- security_invoker=true caused base-table RLS (own-only/participant-only) to hide
-- global admin queue rows in /admin/safety.

alter view if exists public.view_admin_reports_queue
  set (security_invoker = false);

alter view if exists public.view_admin_report_casefile
  set (security_invoker = false);

alter view if exists public.view_admin_service_disputes_queue
  set (security_invoker = false);

alter view if exists public.view_admin_safety_audit_timeline
  set (security_invoker = false);

alter view if exists public.view_admin_safety_users
  set (security_invoker = false);

alter view if exists public.view_admin_safety_user_timeline
  set (security_invoker = false);
