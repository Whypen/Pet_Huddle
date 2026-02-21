-- CRITICAL: Force update live DB function to fix ambiguous legal_name error
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.finalize_identity_submission(
  p_doc_type TEXT,
  p_doc_path TEXT,
  p_selfie_path TEXT,
  p_country TEXT,
  p_legal_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_doc_type NOT IN ('passport', 'drivers_license', 'id_card') THEN
    RAISE EXCEPTION 'Invalid doc type';
  END IF;
  INSERT INTO public.verification_uploads
    (user_id, document_type, document_url, selfie_url, country, legal_name, status, uploaded_at)
  VALUES
    (v_user, p_doc_type, p_doc_path, p_selfie_path, p_country, p_legal_name, 'pending', NOW());
  UPDATE public.profiles AS prof
  SET
    verification_status = 'pending',
    is_verified = false,
    legal_name = COALESCE(p_legal_name, prof.legal_name),
    location_country = COALESCE(p_country, prof.location_country),
    verification_comment = NULL
  WHERE prof.id = v_user;
END;
$$;

-- Verify the function was updated correctly
SELECT pg_get_functiondef(
  'public.finalize_identity_submission(text,text,text,text,text)'::regprocedure
);
