-- Tighten marketplace_bookings grants and rely on RLS + service role for mutations
REVOKE ALL ON TABLE public.marketplace_bookings FROM anon;
REVOKE ALL ON TABLE public.marketplace_bookings FROM authenticated;
GRANT SELECT ON TABLE public.marketplace_bookings TO authenticated;
GRANT ALL ON TABLE public.marketplace_bookings TO service_role;
