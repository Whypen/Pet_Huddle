-- Social discovery RPC using PostGIS
CREATE OR REPLACE FUNCTION public.social_discovery(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_min_age integer,
  p_max_age integer
)
RETURNS TABLE(
  id uuid,
  display_name text,
  avatar_url text,
  is_verified boolean,
  has_car boolean,
  bio text,
  last_lat double precision,
  last_lng double precision
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.is_verified,
    p.has_car,
    p.bio,
    p.last_lat,
    p.last_lng
  FROM public.profiles p
  WHERE p.id <> p_user_id
    AND p.dob IS NOT NULL
    AND (EXTRACT(YEAR FROM age(current_date, p.dob)) BETWEEN p_min_age AND p_max_age)
    AND p.location_geog IS NOT NULL
    AND ST_DWithin(
      p.location_geog,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
  ORDER BY p.is_verified DESC, p.created_at DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.social_discovery(uuid, double precision, double precision, integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.social_discovery(uuid, double precision, double precision, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.social_discovery(uuid, double precision, double precision, integer, integer, integer) TO service_role;
