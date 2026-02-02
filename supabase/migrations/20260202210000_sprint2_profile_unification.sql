-- SPRINT 2: Profile Form Unification
-- Adds missing fields used in EditProfile.tsx to match schema

-- Add missing profile fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS orientation TEXT,
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS show_orientation BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_occupation BOOLEAN DEFAULT TRUE;

-- Add missing pet field (neutered_spayed referenced in EditPetProfile.tsx)
ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS neutered_spayed BOOLEAN DEFAULT FALSE;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_social_availability ON profiles(social_availability) WHERE social_availability = TRUE;
CREATE INDEX IF NOT EXISTS idx_pets_species ON pets(species);

COMMENT ON COLUMN profiles.orientation IS 'Sexual orientation separate from gender identity';
COMMENT ON COLUMN profiles.occupation IS 'Current job title or occupation';
COMMENT ON COLUMN profiles.show_orientation IS 'Privacy toggle for sexual orientation';
COMMENT ON COLUMN profiles.show_occupation IS 'Privacy toggle for occupation';
COMMENT ON COLUMN pets.neutered_spayed IS 'Whether pet has been neutered or spayed';
