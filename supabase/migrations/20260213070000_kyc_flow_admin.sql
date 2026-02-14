-- KYC flow hardening: admin flag, audit logs, RLS, and RPCs

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

ALTER TABLE public.verification_uploads
  ADD COLUMN IF NOT EXISTS legal_name TEXT;

-- Admin audit logs
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_user_id UUID,
  notes TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Prevent non-admins from setting verified status
CREATE OR REPLACE FUNCTION public.prevent_non_admin_verification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF (NEW.verification_status = 'verified' OR NEW.is_verified = TRUE) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
    ) THEN
      RAISE EXCEPTION 'Only admins can verify users';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_non_admin_verification ON public.profiles;
CREATE TRIGGER trg_prevent_non_admin_verification
BEFORE UPDATE OF verification_status, is_verified ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_non_admin_verification();

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit logs insert by actor" ON public.admin_audit_logs;
CREATE POLICY "Audit logs insert by actor"
  ON public.admin_audit_logs
  FOR INSERT
  WITH CHECK (actor_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.admin_audit_logs
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

-- verification_uploads RLS aligned to is_admin
ALTER TABLE public.verification_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own verification uploads" ON public.verification_uploads;
CREATE POLICY "Users can view own verification uploads"
  ON public.verification_uploads
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upload verification documents" ON public.verification_uploads;
CREATE POLICY "Users can upload verification documents"
  ON public.verification_uploads
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can update verification status" ON public.verification_uploads;
CREATE POLICY "Admins can update verification status"
  ON public.verification_uploads
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

DROP POLICY IF EXISTS "Admins can view verification uploads" ON public.verification_uploads;
CREATE POLICY "Admins can view verification uploads"
  ON public.verification_uploads
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

-- Storage bucket policies for identity_verification (path-based)
DROP POLICY IF EXISTS identity_verification_owner_read ON storage.objects;
DROP POLICY IF EXISTS identity_verification_owner_insert ON storage.objects;
DROP POLICY IF EXISTS identity_verification_owner_delete ON storage.objects;
DROP POLICY IF EXISTS identity_verification_owner_insert_restrictive ON storage.objects;
DROP POLICY IF EXISTS identity_verification_owner_read_restrictive ON storage.objects;
DROP POLICY IF EXISTS identity_verification_admin_read ON storage.objects;
DROP POLICY IF EXISTS identity_verification_admin_read_restrictive ON storage.objects;
DROP POLICY IF EXISTS identity_verification_admin_all ON storage.objects;
DROP POLICY IF EXISTS identity_verification_owner_read_path ON storage.objects;
CREATE POLICY identity_verification_owner_read_path
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'identity_verification'
    AND name LIKE auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS identity_verification_owner_insert_path ON storage.objects;
CREATE POLICY identity_verification_owner_insert_path
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'identity_verification'
    AND name LIKE auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS identity_verification_owner_delete_path ON storage.objects;
CREATE POLICY identity_verification_owner_delete_path
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'identity_verification'
    AND name LIKE auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS identity_verification_admin_read_path ON storage.objects;
CREATE POLICY identity_verification_admin_read_path
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'identity_verification'
    AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

CREATE POLICY identity_verification_service_role_all
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'identity_verification' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'identity_verification' AND auth.role() = 'service_role');

-- RPC: finalize identity submission (atomic)
CREATE OR REPLACE FUNCTION public.finalize_identity_submission(
  p_doc_type TEXT,
  p_doc_path TEXT,
  p_selfie_path TEXT,
  p_country TEXT,
  p_legal_name TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
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
    SET verification_status = 'pending',
        is_verified = false,
        legal_name = COALESCE(p_legal_name, prof.legal_name),
        location_country = COALESCE(p_country, prof.location_country),
        verification_comment = NULL
  WHERE prof.id = v_user;

  INSERT INTO public.admin_audit_logs
    (actor_id, action, target_user_id, details)
  VALUES
    (v_user, 'kyc_submitted', v_user, jsonb_build_object(
      'doc_type', p_doc_type,
      'doc_path', p_doc_path,
      'selfie_path', p_selfie_path,
      'country', p_country,
      'legal_name', p_legal_name
    ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_identity_submission(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- RPC: handle identity review (admin only)
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
  v_admin UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_upload RECORD;
  v_action TEXT;
BEGIN
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
    UPDATE public.profiles
      SET verification_status = 'verified',
          is_verified = true,
          verification_comment = NULL
    WHERE id = target_user_id;

    UPDATE public.verification_uploads
      SET status = 'approved',
          reviewed_by = v_admin,
          reviewed_at = NOW(),
          rejection_reason = NULL
    WHERE id = v_upload.id;

    INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    VALUES (target_user_id, v_upload.document_url, NOW() + INTERVAL '30 days');

    IF v_upload.selfie_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (target_user_id, v_upload.selfie_url, NOW() + INTERVAL '30 days');
    END IF;

    v_action := 'kyc_approved';
  ELSIF action = 'reject' THEN
    UPDATE public.profiles
      SET verification_status = 'unverified',
          is_verified = false,
          verification_comment = notes
    WHERE id = target_user_id;

    UPDATE public.verification_uploads
      SET status = 'rejected',
          reviewed_by = v_admin,
          reviewed_at = NOW(),
          rejection_reason = notes
    WHERE id = v_upload.id;

    DELETE FROM storage.objects
      WHERE bucket_id = 'identity_verification'
        AND name IN (v_upload.document_url, v_upload.selfie_url);

    v_action := 'kyc_rejected';
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, v_action, target_user_id, notes);
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_identity_review(UUID, TEXT, TEXT) TO authenticated;
