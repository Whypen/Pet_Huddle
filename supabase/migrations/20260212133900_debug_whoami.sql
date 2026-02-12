-- Debug helper for UAT auth diagnosis
CREATE OR REPLACE FUNCTION public.debug_whoami()
RETURNS TABLE(current_user_name text, session_user_name text, auth_uid uuid)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT current_user::text, session_user::text, auth.uid();
$$;

REVOKE ALL ON FUNCTION public.debug_whoami() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.debug_whoami() TO authenticated;
