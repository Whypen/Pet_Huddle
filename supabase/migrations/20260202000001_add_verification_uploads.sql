-- Create verification_uploads table for ID/Passport verification
CREATE TABLE IF NOT EXISTS verification_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('passport', 'id_card')),
  document_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')) NOT NULL,
  rejection_reason TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id)
);

-- Create index for faster queries
CREATE INDEX idx_verification_uploads_user_id ON verification_uploads(user_id);
CREATE INDEX idx_verification_uploads_status ON verification_uploads(status);

-- Enable RLS
ALTER TABLE verification_uploads ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own verification uploads
CREATE POLICY "Users can view own verification uploads"
  ON verification_uploads
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own verification uploads
CREATE POLICY "Users can upload verification documents"
  ON verification_uploads
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only admins can update verification status (simplified for MVP)
CREATE POLICY "Admins can update verification status"
  ON verification_uploads
  FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM profiles WHERE user_role = 'admin'));

-- Add has_car and languages columns to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_car BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT ARRAY['English']::TEXT[];

-- Add neutered_spayed column to pets table
ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS neutered_spayed BOOLEAN DEFAULT FALSE;

-- Comment
COMMENT ON TABLE verification_uploads IS 'Stores ID and passport verification documents';
COMMENT ON COLUMN profiles.has_car IS 'Indicates if user has a car (Pet Driver)';
COMMENT ON COLUMN profiles.languages IS 'Languages spoken by the user';
COMMENT ON COLUMN pets.neutered_spayed IS 'Whether the pet has been neutered or spayed';
