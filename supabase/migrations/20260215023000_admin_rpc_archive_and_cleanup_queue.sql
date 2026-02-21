-- Update admin_set_verification_status to archive uploads and queue 7-day deletions.

CREATE OR REPLACE FUNCTION public.admin_set_verification_status(
  p_user_id uuid,
  p_decision text,
  p_comment text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_role text;
  v_action text;
  v_actor_social_id text;
  v_target_social_id text;
  v_upload record;
BEGIN
  SELECT is_admin, role, social_id
    INTO v_is_admin, v_role, v_actor_social_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT (v_is_admin IS TRUE OR v_role = 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT social_id
    INTO v_target_social_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT *
    INTO v_upload
  FROM public.verification_uploads
  WHERE user_id = p_user_id
  ORDER BY uploaded_at DESC
  LIMIT 1;

  IF p_decision = 'approved' THEN
    UPDATE public.profiles
    SET
      verification_status = 'verified'::public.verification_status_enum,
      is_verified = true,
      verified = true,
      verification_comment = p_comment
    WHERE id = p_user_id;
    v_action := 'kyc_approved';
  ELSE
    UPDATE public.profiles
    SET
      verification_status = 'unverified'::public.verification_status_enum,
      is_verified = false,
      verified = false,
      verification_comment = p_comment
    WHERE id = p_user_id;
    v_action := 'kyc_rejected';
  END IF;

  IF v_upload.id IS NOT NULL THEN
    IF p_decision = 'approved' THEN
      UPDATE public.verification_uploads
      SET
        status = 'archived',
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        rejection_reason = NULL,
        archived_at = NOW(),
        archived_by = auth.uid()
      WHERE id = v_upload.id;
    ELSE
      UPDATE public.verification_uploads
      SET
        status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        rejection_reason = p_comment
      WHERE id = v_upload.id;
    END IF;

    IF v_upload.document_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (p_user_id, v_upload.document_url, NOW() + INTERVAL '7 days');
    END IF;

    IF v_upload.selfie_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (p_user_id, v_upload.selfie_url, NOW() + INTERVAL '7 days');
    END IF;
  END IF;

  INSERT INTO public.admin_audit_logs (
    actor_id,
    target_user_id,
    action,
    notes,
    created_at,
    actor_social_id,
    target_social_id
  )
  VALUES (
    auth.uid(),
    p_user_id,
    v_action,
    p_comment,
    NOW(),
    v_actor_social_id,
    v_target_social_id
  );

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'decision', p_decision);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_verification_status(uuid, text, text) TO authenticated;

-- ROLLBACK (manual): re-apply previous admin_set_verification_status definition.
