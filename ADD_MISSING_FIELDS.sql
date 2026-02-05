-- ============================================================================
-- ADD MISSING FIELDS TO MATCH LOVABLE REQUIREMENTS
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add missing fields to PROFILES table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS orientation TEXT,
  ADD COLUMN IF NOT EXISTS show_occupation BOOLEAN DEFAULT TRUE;

-- Add missing field to PETS table
ALTER TABLE public.pets 
  ADD COLUMN IF NOT EXISTS neutered_spayed BOOLEAN DEFAULT FALSE;

-- Verify fields were added
SELECT 'Profiles table columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
ORDER BY ordinal_position;

SELECT 'Pets table columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'pets'
ORDER BY ordinal_position;

SELECT '✅ Missing fields added successfully!' as status;
