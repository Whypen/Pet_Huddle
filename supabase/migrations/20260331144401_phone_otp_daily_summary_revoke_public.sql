-- Fix: Supabase's default GRANT ALL ON ALL TABLES applied to the view at
-- creation time, defeating the "service_role only" intent.
-- Explicitly revoke all privileges from anon and authenticated roles.
-- The view is for admin/ops monitoring only; access must go through a
-- security-definer RPC that validates profiles.is_admin = true.

REVOKE ALL ON public.phone_otp_daily_summary FROM anon, authenticated;
