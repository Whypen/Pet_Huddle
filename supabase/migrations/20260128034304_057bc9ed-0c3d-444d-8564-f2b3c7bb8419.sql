-- Add new profile fields for privacy toggles and social features
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS major text,
ADD COLUMN IF NOT EXISTS owns_pets boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS social_availability boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS availability_status text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS show_gender boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_age boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_height boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_weight boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_academic boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_affiliation boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_bio boolean DEFAULT true;

-- Add is_active field for pets
ALTER TABLE public.pets
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Update the profiles_public view to respect privacy toggles
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker=on) AS
SELECT 
  id,
  display_name,
  avatar_url,
  CASE WHEN show_bio THEN bio ELSE NULL END as bio,
  CASE WHEN show_gender THEN gender_genre ELSE NULL END as gender_genre,
  CASE WHEN show_age THEN dob ELSE NULL END as dob,
  CASE WHEN show_height THEN height ELSE NULL END as height,
  CASE WHEN show_weight THEN weight ELSE NULL END as weight,
  weight_unit,
  CASE WHEN show_academic THEN degree ELSE NULL END as degree,
  CASE WHEN show_academic THEN school ELSE NULL END as school,
  CASE WHEN show_academic THEN major ELSE NULL END as major,
  CASE WHEN show_affiliation THEN affiliation ELSE NULL END as affiliation,
  location_name,
  is_verified,
  has_car,
  user_role,
  pet_experience,
  experience_years,
  languages,
  relationship_status,
  owns_pets,
  social_availability,
  availability_status,
  created_at
FROM public.profiles;