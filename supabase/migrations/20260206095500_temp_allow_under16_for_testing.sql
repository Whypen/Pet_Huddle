-- TEMPORARY: Relax min age constraint for local testing only (set to 13)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_min_age') THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_min_age;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_min_age CHECK (dob < CURRENT_DATE - INTERVAL '13 years');
