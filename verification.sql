-- Ensure critical profiles columns exist to prevent 400 errors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN verification_status TEXT DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'verification_comment'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN verification_comment TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'media_credits'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN media_credits INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'tier'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN tier TEXT DEFAULT 'free';
  END IF;
END
$$;
