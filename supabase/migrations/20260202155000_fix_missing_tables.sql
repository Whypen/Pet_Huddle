-- FIX MISSING TABLES
-- This migration ensures lost_pet_alerts table exists
-- It may have been missed in previous migrations

-- Ensure profiles table has required columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vouch_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fcm_token TEXT,
  ADD COLUMN IF NOT EXISTS emergency_mode BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS care_circle UUID[] DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Create spatial index for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_location
  ON profiles USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- Recreate lost_pet_alerts table if it doesn't exist
CREATE TABLE IF NOT EXISTS lost_pet_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  description TEXT,
  photo_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'found', 'cancelled')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create spatial index for lost pet alerts
CREATE INDEX IF NOT EXISTS idx_lost_pet_location
  ON lost_pet_alerts USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- Enable RLS
ALTER TABLE lost_pet_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lost_pet_alerts
DROP POLICY IF EXISTS "Anyone can view active lost pet alerts" ON lost_pet_alerts;
CREATE POLICY "Anyone can view active lost pet alerts"
  ON lost_pet_alerts
  FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS "Users can create their own alerts" ON lost_pet_alerts;
CREATE POLICY "Users can create their own alerts"
  ON lost_pet_alerts
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own alerts" ON lost_pet_alerts;
CREATE POLICY "Users can update their own alerts"
  ON lost_pet_alerts
  FOR UPDATE
  USING (auth.uid() = owner_id);

-- Recreate hazard_identifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS hazard_identifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  object_identified TEXT,
  is_hazard BOOLEAN,
  hazard_type TEXT CHECK (hazard_type IN ('TOXIC_PLANT', 'TOXIC_FOOD', 'CHEMICAL', 'INERT')),
  toxicity_level TEXT CHECK (toxicity_level IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')),
  ingested BOOLEAN DEFAULT FALSE,
  immediate_action TEXT,
  ai_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_hazard_user_id ON hazard_identifications(user_id);
CREATE INDEX IF NOT EXISTS idx_hazard_created_at ON hazard_identifications(created_at DESC);

-- Enable RLS
ALTER TABLE hazard_identifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hazard_identifications
DROP POLICY IF EXISTS "Users can view their own hazard scans" ON hazard_identifications;
CREATE POLICY "Users can view their own hazard scans"
  ON hazard_identifications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create hazard scans" ON hazard_identifications;
CREATE POLICY "Users can create hazard scans"
  ON hazard_identifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE lost_pet_alerts IS 'Lost pet alerts for Mesh-Alert system';
COMMENT ON TABLE hazard_identifications IS 'AI-powered hazard identification records';
