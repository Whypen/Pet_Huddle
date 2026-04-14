-- Tighten execute grants for admin moderation RPC.
-- Remove anon/public execute access.

revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean) from public;
revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean) from anon;
revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean) from authenticated;
revoke all on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean) from service_role;

grant execute on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean) to authenticated;
grant execute on function public.admin_apply_report_moderation(uuid, text, text, jsonb, boolean) to service_role;
