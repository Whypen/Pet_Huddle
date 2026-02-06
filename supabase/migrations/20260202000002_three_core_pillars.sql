-- THREE CORE PILLARS DATABASE SCHEMA
-- Mesh-Alert, AI Triage Scribe, Break-Glass Privacy

-- Enable PostGIS extension for spatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add columns to profiles for core pillars
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

-- Lost pet alerts table (Mesh-Alert)
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
CREATE INDEX idx_lost_pet_location
  ON lost_pet_alerts USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- Hazard identifications table (AI Triage Scribe)
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

-- Notice board likes table
CREATE TABLE IF NOT EXISTS notice_board_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES notice_board(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(post_id, user_id)
);

-- Add like count to notice_board
ALTER TABLE notice_board
  ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_hazard_user_id ON hazard_identifications(user_id);
CREATE INDEX IF NOT EXISTS idx_hazard_created_at ON hazard_identifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notice_likes_post_id ON notice_board_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_notice_likes_user_id ON notice_board_likes(user_id);

-- Enable RLS
ALTER TABLE lost_pet_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hazard_identifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_board_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lost_pet_alerts
CREATE POLICY "Anyone can view active lost pet alerts"
  ON lost_pet_alerts
  FOR SELECT
  USING (status = 'active');

CREATE POLICY "Users can create their own alerts"
  ON lost_pet_alerts
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own alerts"
  ON lost_pet_alerts
  FOR UPDATE
  USING (auth.uid() = owner_id);

-- RLS Policies for hazard_identifications
CREATE POLICY "Users can view their own hazard scans"
  ON hazard_identifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create hazard scans"
  ON hazard_identifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for notice_board_likes
CREATE POLICY "Anyone can view likes"
  ON notice_board_likes
  FOR SELECT
  USING (true);

CREATE POLICY "Users can like posts"
  ON notice_board_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike posts"
  ON notice_board_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Break-Glass Privacy: Location visibility based on emergency mode
DROP POLICY IF EXISTS "location_private_by_default" ON profiles;
CREATE POLICY "location_private_by_default"
  ON profiles
  FOR SELECT
  USING (
    auth.uid() = id OR
    (emergency_mode = TRUE AND (
      auth.uid() = ANY(care_circle) OR
      (
        latitude IS NOT NULL AND longitude IS NOT NULL AND
        ST_DWithin(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint(
            (SELECT longitude FROM profiles WHERE id = auth.uid()),
            (SELECT latitude FROM profiles WHERE id = auth.uid())
          ), 4326)::geography,
          CASE WHEN user_role = 'premium' THEN 5000 ELSE 1000 END
        )
      )
    ))
  );

-- PostgreSQL function for finding nearby users (Mesh-Alert)
CREATE OR REPLACE FUNCTION find_nearby_users(
  alert_lat DOUBLE PRECISION,
  alert_lng DOUBLE PRECISION,
  radius_meters INT DEFAULT 1000,
  min_vouch_score INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  fcm_token TEXT,
  vouch_score INT,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.fcm_token,
    p.vouch_score,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(alert_lng, alert_lat), 4326)::geography
    ) AS distance_meters
  FROM profiles p
  WHERE
    p.vouch_score >= min_vouch_score
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND p.fcm_token IS NOT NULL
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(alert_lng, alert_lat), 4326)::geography,
      radius_meters
    )
  ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update like count
CREATE OR REPLACE FUNCTION update_notice_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE notice_board SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE notice_board SET like_count = like_count - 1 WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for notice board likes
DROP TRIGGER IF EXISTS notice_like_count_trigger ON notice_board_likes;
CREATE TRIGGER notice_like_count_trigger
  AFTER INSERT OR DELETE ON notice_board_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_notice_like_count();

-- Comments
COMMENT ON TABLE lost_pet_alerts IS 'Lost pet alerts for Mesh-Alert system';
COMMENT ON TABLE hazard_identifications IS 'AI-powered hazard identification records';
COMMENT ON TABLE notice_board_likes IS 'Like interactions for notice board posts';
COMMENT ON FUNCTION find_nearby_users IS 'Finds verified users within radius for Mesh-Alert notifications';
COMMENT ON COLUMN profiles.vouch_score IS 'Community trust score (0-100)';
COMMENT ON COLUMN profiles.emergency_mode IS 'Break-Glass Privacy emergency mode toggle';
COMMENT ON COLUMN profiles.care_circle IS 'Trusted user IDs for emergency location sharing';
