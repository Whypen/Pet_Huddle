ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_comment TEXT;

COMMENT ON COLUMN public.profiles.verification_comment IS 'Admin review comment for verification (pending/approved/rejected).';
