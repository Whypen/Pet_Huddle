-- Ensure authenticated can use QMS helper and touch quotas within SECURITY DEFINER context
GRANT SELECT, UPDATE ON public.user_quotas TO authenticated;
