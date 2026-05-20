-- Retry actionable Security Advisor fixes after remote migration-history alignment.
-- 1) admin views must run as SECURITY INVOKER
-- 2) broadcast_alert_notification_queue must have RLS enabled
--
-- spatial_ref_sys is intentionally excluded here. It is a PostGIS system table
-- owned by supabase_admin, and the migration role cannot ALTER it. See
-- 20260401130000_security_advisor_crm_plan_spatial.sql.

alter view if exists public.view_admin_safety_audit_timeline
  set (security_invoker = true);

alter view if exists public.view_admin_safety_user_timeline
  set (security_invoker = true);

alter view if exists public.view_admin_reports_queue
  set (security_invoker = true);

alter view if exists public.view_admin_safety_users
  set (security_invoker = true);

alter view if exists public.view_admin_report_casefile
  set (security_invoker = true);

alter view if exists public.view_admin_service_disputes_queue
  set (security_invoker = true);

alter table if exists public.broadcast_alert_notification_queue enable row level security;

drop policy if exists "broadcast_alert_notification_queue_service_role_all"
  on public.broadcast_alert_notification_queue;
create policy "broadcast_alert_notification_queue_service_role_all"
on public.broadcast_alert_notification_queue
for all
to service_role
using (true)
with check (true);
