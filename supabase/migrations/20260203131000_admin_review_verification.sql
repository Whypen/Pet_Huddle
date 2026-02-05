CREATE OR REPLACE FUNCTION public.admin_review_verification(
  p_user_id uuid,
  p_status text,
  p_comment text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('pending', 'approved', 'rejected', 'not_submitted') THEN
    RAISE EXCEPTION 'Invalid verification status';
  END IF;

  UPDATE public.profiles
  SET
    verification_status = p_status,
    verification_comment = p_comment,
    is_verified = (p_status = 'approved')
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.admin_review_verification IS 'Admin-only helper to set verification status/comment.';
