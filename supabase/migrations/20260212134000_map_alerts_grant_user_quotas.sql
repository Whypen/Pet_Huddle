-- Ensure authenticated can access user_quotas used in enforce_map_alert_contract()
GRANT SELECT, UPDATE ON public.user_quotas TO authenticated;
