-- Add social_id column to profiles with constraints
-- Social ID is REQUIRED, lowercase-only, 6-20 chars, alphanumeric + dot + underscore

-- Step 1: Add column as nullable first (for backfill)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS social_id TEXT;

-- Step 2: Backfill existing users with deterministic value
-- Format: 'u' + first 10 chars of UUID (no hyphens) = always lowercase, 11 chars total
UPDATE public.profiles
SET social_id = 'u' || SUBSTRING(REPLACE(id::TEXT, '-', ''), 1, 10)
WHERE social_id IS NULL;

-- Step 3: Add constraints
ALTER TABLE public.profiles
ADD CONSTRAINT social_id_length CHECK (LENGTH(social_id) >= 6 AND LENGTH(social_id) <= 20),
ADD CONSTRAINT social_id_format CHECK (social_id ~ '^[a-z0-9._]+$');

-- Step 4: Create unique index (case-insensitive via lower())
CREATE UNIQUE INDEX IF NOT EXISTS profiles_social_id_unique_idx
ON public.profiles (LOWER(social_id));

-- Step 5: Make NOT NULL after backfill
ALTER TABLE public.profiles
ALTER COLUMN social_id SET NOT NULL;

-- Step 6: Create RPC for availability check
CREATE OR REPLACE FUNCTION public.is_social_id_taken(candidate TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Normalize to lowercase
  -- Check if exists for any user OTHER than current user
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE LOWER(social_id) = LOWER(candidate)
      AND id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
  );
END;
$$;

COMMENT ON FUNCTION public.is_social_id_taken IS 'Check if a social_id is already taken by another user (case-insensitive)';
