-- UI/UX OVERHAUL - DATABASE SCHEMA UPDATES
-- Adds verification status, payment tracking, and other required fields

-- Add verification status to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_document_url TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected', 'not_submitted')),
  ADD COLUMN IF NOT EXISTS has_car BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT ARRAY['English']::TEXT[];

-- Add payment and subscription tracking
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free'
    CHECK (subscription_status IN ('free', 'premium_pending', 'premium_active', 'premium_cancelled')),
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMPTZ;

-- Update pets table for vaccination tracking
ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS vaccination_dates TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS next_vaccination_reminder DATE;

-- Create index for verification lookups
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status ON profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON profiles(subscription_status);

-- Update RLS policies to include is_verified
-- Users can always see their own profile
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;
CREATE POLICY "users_view_own_profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (including verification upload)
DROP POLICY IF EXISTS "users_update_own_profile_extended" ON profiles;
CREATE POLICY "users_update_own_profile_extended"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMENT ON COLUMN profiles.is_verified IS 'Gold badge - only true after manual admin approval';
COMMENT ON COLUMN profiles.verification_status IS 'Status of identity verification: pending, approved, rejected, not_submitted';
COMMENT ON COLUMN profiles.subscription_status IS 'Payment status: free, premium_pending, premium_active, premium_cancelled';
COMMENT ON COLUMN profiles.has_car IS 'Pet driver capability - can transport pets';
COMMENT ON COLUMN profiles.languages IS 'Languages spoken by user for social matching';
COMMENT ON COLUMN pets.vaccination_dates IS 'Vaccination dates stored as MM-YYYY format strings';
COMMENT ON COLUMN pets.next_vaccination_reminder IS 'Next scheduled vaccination reminder date';
