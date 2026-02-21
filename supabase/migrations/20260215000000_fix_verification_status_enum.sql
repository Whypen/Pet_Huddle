-- COMPREHENSIVE FIX: Align verification_status enum to spec
-- Spec requires: unverified, pending, verified
-- Current enum: pending, approved, rejected
-- This migration fixes the enum and all dependent functions

-- STEP 1: Create new enum with correct values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status_enum_new') THEN
    CREATE TYPE public.verification_status_enum_new AS ENUM ('unverified', 'pending', 'verified');
  END IF;
END $$;

-- STEP 2: Migrate profiles table column
-- Map old values to new values:
--   not_submitted -> unverified
--   pending -> pending
--   approved -> verified
--   rejected -> unverified
--   any other -> unverified

-- PRE-STEP: Drop dependent trigger before altering verification_status type
DROP TRIGGER IF EXISTS trg_queue_identity_cleanup ON public.profiles;
DROP TRIGGER IF EXISTS trg_prevent_non_admin_verification ON public.profiles;

ALTER TABLE public.profiles
ALTER COLUMN verification_status DROP DEFAULT;

ALTER TABLE public.profiles
ALTER COLUMN verification_status TYPE public.verification_status_enum_new
USING (
  CASE
    WHEN verification_status::text = 'pending' THEN 'pending'::public.verification_status_enum_new
    WHEN verification_status::text IN ('approved', 'verified') THEN 'verified'::public.verification_status_enum_new
    WHEN verification_status::text IN ('rejected', 'not_submitted', 'unverified') THEN 'unverified'::public.verification_status_enum_new
    ELSE 'unverified'::public.verification_status_enum_new
  END
);

ALTER TABLE public.profiles
ALTER COLUMN verification_status SET DEFAULT 'unverified'::public.verification_status_enum_new;

-- STEP 3: Drop old enum and rename new one
DROP TYPE IF EXISTS public.verification_status_enum CASCADE;

ALTER TYPE public.verification_status_enum_new RENAME TO verification_status_enum;

-- RECREATE: trigger dropped before enum alteration
CREATE TRIGGER trg_queue_identity_cleanup
AFTER UPDATE OF verification_status ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.queue_identity_cleanup();

-- RECREATE: prevent non-admin verification trigger dropped before enum alteration
CREATE TRIGGER trg_prevent_non_admin_verification
BEFORE UPDATE OF verification_status, is_verified ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_non_admin_verification();

-- STEP 4: Fix handle_new_user trigger to use 'unverified'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name text;
  v_legal_name text;
  v_phone text;
  v_social_id text;
BEGIN
  IF NEW.raw_user_meta_data IS NULL THEN
    RAISE EXCEPTION 'Missing signup metadata';
  END IF;

  v_display_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
    'User'
  );

  v_legal_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'legal_name'), ''),
    v_display_name
  );

  v_phone := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, '')), '');

  -- REQUIRED: social_id must never be NULL
  v_social_id := NULLIF(BTRIM(LOWER(COALESCE(NEW.raw_user_meta_data->>'social_id', ''))), '');
  IF v_social_id IS NULL THEN
    v_social_id := 'u' || SUBSTR(REPLACE(NEW.id::TEXT, '-', ''), 1, 10);
  END IF;

  INSERT INTO public.profiles (
    id,
    display_name,
    legal_name,
    phone,
    dob,
    social_id,
    verification_status,
    is_verified,
    onboarding_completed
  )
  VALUES (
    NEW.id,
    v_display_name,
    v_legal_name,
    v_phone,
    (NEW.raw_user_meta_data->>'dob')::date,
    v_social_id,
    'unverified'::public.verification_status_enum,
    false,
    false
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        legal_name = EXCLUDED.legal_name,
        phone = EXCLUDED.phone,
        dob = EXCLUDED.dob;
    -- NOTE: social_id is NOT updated on conflict to prevent overwrites

  RETURN NEW;
END;
$$;

-- STEP 5: Fix handle_identity_review to use p_ params and correct enum values
CREATE OR REPLACE FUNCTION public.handle_identity_review(
  target_user_id UUID,
  action TEXT,
  notes TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID;
  v_is_admin BOOLEAN;
  v_upload RECORD;
  v_action TEXT;
BEGIN
  v_admin := auth.uid();

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, 'kyc_review_attempt', target_user_id, notes);

  IF v_is_admin IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT *
  INTO v_upload
  FROM public.verification_uploads
  WHERE user_id = target_user_id AND status = 'pending'
  ORDER BY uploaded_at DESC
  LIMIT 1;

  IF v_upload IS NULL THEN
    RAISE EXCEPTION 'No pending upload';
  END IF;

  IF action = 'approve' THEN
    UPDATE public.profiles AS prof
      SET verification_status = 'verified'::public.verification_status_enum,
          is_verified = true,
          verification_comment = NULL
    WHERE prof.id = target_user_id;

    UPDATE public.verification_uploads AS vu
      SET status = 'approved',
          reviewed_by = v_admin,
          reviewed_at = NOW(),
          rejection_reason = NULL
    WHERE vu.id = v_upload.id;

    INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    VALUES (target_user_id, v_upload.document_url, NOW() + INTERVAL '30 days');

    IF v_upload.selfie_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (target_user_id, v_upload.selfie_url, NOW() + INTERVAL '30 days');
    END IF;

    v_action := 'kyc_approved';
  ELSIF action = 'reject' THEN
    UPDATE public.profiles AS prof
      SET verification_status = 'unverified'::public.verification_status_enum,
          is_verified = false,
          verification_comment = notes
    WHERE prof.id = target_user_id;

    UPDATE public.verification_uploads AS vu
      SET status = 'rejected',
          reviewed_by = v_admin,
          reviewed_at = NOW(),
          rejection_reason = notes
    WHERE vu.id = v_upload.id;

    v_action := 'kyc_rejected';
  ELSE
    RAISE EXCEPTION 'Invalid action: %', action;
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, v_action, target_user_id, notes);
END;
$$;

-- STEP 6: Ensure finalize_identity_submission is correct (already fixed in previous migration)
-- This is idempotent
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
    verification_status = 'pending'::public.verification_status_enum,
    is_verified = false,
    legal_name = COALESCE(p_legal_name, prof.legal_name),
    location_country = COALESCE(p_country, prof.location_country),
    verification_comment = NULL
  WHERE prof.id = v_user;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_identity_submission(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_identity_review(UUID, TEXT, TEXT) TO authenticated;

-- STEP 7: Recreate trigger (required after CASCADE drop)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

