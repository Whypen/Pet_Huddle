-- Enforce explicit denial for unauthenticated profile reads
REVOKE SELECT ON public.profiles FROM anon;
