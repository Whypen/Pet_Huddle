-- MIGRATION: Safe public profile lookup by IDs (non-sensitive fields only)

CREATE OR REPLACE FUNCTION public.get_public_profiles_by_ids(p_ids uuid[])
RETURNS TABLE (id uuid, display_name text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY (p_ids)
    AND p.id <> auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks ub
      WHERE (ub.blocker_id = auth.uid() AND ub.blocked_id = p.id)
         OR (ub.blocker_id = p.id AND ub.blocked_id = auth.uid())
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profiles_by_ids(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_profile_by_id(p_id uuid)
RETURNS TABLE (
  display_name text,
  avatar_url text,
  bio text,
  relationship_status text,
  dob date,
  location_name text,
  occupation text,
  school text,
  major text,
  verification_status text,
  has_car boolean,
  tier text,
  effective_tier text,
  non_social boolean,
  hide_from_map boolean,
  social_album jsonb,
  show_occupation boolean,
  show_academic boolean,
  show_bio boolean,
  show_relationship_status boolean,
  show_age boolean,
  show_gender boolean,
  show_orientation boolean,
  show_height boolean,
  show_weight boolean,
  gender_genre text,
  orientation text,
  pet_species text[],
  pet_experience_years integer,
  languages text[],
  social_role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.display_name,
    p.avatar_url,
    p.bio,
    p.relationship_status,
    p.dob,
    p.location_name,
    p.occupation,
    p.school,
    p.major,
    p.verification_status,
    p.has_car,
    p.tier,
    p.effective_tier,
    p.non_social,
    p.hide_from_map,
    p.social_album,
    p.show_occupation,
    p.show_academic,
    p.show_bio,
    p.show_relationship_status,
    p.show_age,
    p.show_gender,
    p.show_orientation,
    p.show_height,
    p.show_weight,
    p.gender_genre,
    p.orientation,
    p.pet_species,
    p.pet_experience_years,
    p.languages,
    p.social_role
  FROM public.profiles p
  WHERE p.id = p_id
    AND p.id <> auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks ub
      WHERE (ub.blocker_id = auth.uid() AND ub.blocked_id = p.id)
         OR (ub.blocker_id = p.id AND ub.blocked_id = auth.uid())
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile_by_id(uuid) TO authenticated;
