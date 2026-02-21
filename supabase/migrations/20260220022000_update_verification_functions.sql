begin;

CREATE OR REPLACE FUNCTION public.prevent_sensitive_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  role text := (auth.jwt() ->> 'role');
  is_admin boolean := false;
  allowed_kyc_transition boolean := false;
  admin_verification_transition boolean := false;
BEGIN
  IF role = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT (p.is_admin = true OR p.role = 'admin')
    INTO is_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  allowed_kyc_transition :=
    (old.verification_status IS NULL OR old.verification_status = 'unverified'::public.verification_status_enum)
    AND (new.verification_status = 'pending'::public.verification_status_enum);

  admin_verification_transition :=
    is_admin
    AND new.verification_status IS DISTINCT FROM old.verification_status
    AND new.verification_status IN (
      'verified'::public.verification_status_enum,
      'unverified'::public.verification_status_enum
    );

  IF new.verification_status = 'verified'::public.verification_status_enum AND NOT is_admin THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  IF (new.legal_name IS DISTINCT FROM old.legal_name) AND NOT allowed_kyc_transition THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  IF (new.tier IS DISTINCT FROM old.tier)
     OR (new.subscription_status IS DISTINCT FROM old.subscription_status)
     OR (new.subscription_cycle_anchor_day IS DISTINCT FROM old.subscription_cycle_anchor_day)
     OR (new.subscription_current_period_start IS DISTINCT FROM old.subscription_current_period_start)
     OR (new.subscription_current_period_end IS DISTINCT FROM old.subscription_current_period_end)
     OR ((new.verification_comment IS DISTINCT FROM old.verification_comment) AND NOT admin_verification_transition)
     OR (new.family_slots IS DISTINCT FROM old.family_slots)
     OR (new.media_credits IS DISTINCT FROM old.media_credits)
     OR (new.stars_count IS DISTINCT FROM old.stars_count)
     OR (new.mesh_alert_count IS DISTINCT FROM old.mesh_alert_count)
     OR ((new.verification_status IS DISTINCT FROM old.verification_status)
         AND NOT allowed_kyc_transition
         AND NOT admin_verification_transition)
  THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_identity_review(target_user_id uuid, action text, notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid;
  v_is_admin boolean;
  v_upload record;
  v_action text;
  v_decision text;
BEGIN
  v_admin := auth.uid();

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, 'kyc_review_attempt', target_user_id, notes);

  IF v_is_admin IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF action IN ('verify', 'verified') THEN
    v_decision := 'verified';
  ELSIF action IN ('unverify', 'unverified') THEN
    v_decision := 'unverified';
  ELSE
    RAISE EXCEPTION 'Invalid action: %', action;
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

  IF v_decision = 'verified' THEN
    UPDATE public.profiles AS prof
      SET verification_status = 'verified'::public.verification_status_enum,
          verification_comment = NULL
    WHERE prof.id = target_user_id;

    UPDATE public.verification_uploads AS vu
      SET status = 'verified',
          reviewed_by = v_admin,
          reviewed_at = now(),
          rejection_reason = NULL
    WHERE vu.id = v_upload.id;

    INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    VALUES (target_user_id, v_upload.document_url, now() + interval '7 days');

    IF v_upload.selfie_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (target_user_id, v_upload.selfie_url, now() + interval '7 days');
    END IF;

    v_action := 'kyc_verified';
  ELSE
    UPDATE public.profiles AS prof
      SET verification_status = 'unverified'::public.verification_status_enum,
          verification_comment = notes
    WHERE prof.id = target_user_id;

    UPDATE public.verification_uploads AS vu
      SET status = 'unverified',
          reviewed_by = v_admin,
          reviewed_at = now(),
          rejection_reason = notes
    WHERE vu.id = v_upload.id;

    v_action := 'kyc_unverified';
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, v_action, target_user_id, notes);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_verification_status(p_user_id uuid, p_decision text, p_comment text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF p_decision NOT IN ('verified', 'unverified') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT *
    INTO v_upload
  FROM public.verification_uploads
  WHERE user_id = p_user_id
  ORDER BY uploaded_at DESC
  LIMIT 1;

  IF p_decision = 'verified' THEN
    UPDATE public.profiles
    SET
      verification_status = 'verified'::public.verification_status_enum,
      verification_comment = p_comment
    WHERE id = p_user_id;
    v_action := 'kyc_verified';
  ELSE
    UPDATE public.profiles
    SET
      verification_status = 'unverified'::public.verification_status_enum,
      verification_comment = p_comment
    WHERE id = p_user_id;
    v_action := 'kyc_unverified';
  END IF;

  IF v_upload.id IS NOT NULL THEN
    IF p_decision = 'verified' THEN
      UPDATE public.verification_uploads
      SET
        status = 'verified',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = NULL,
        archived_at = NULL,
        archived_by = NULL
      WHERE id = v_upload.id;
    ELSE
      UPDATE public.verification_uploads
      SET
        status = 'unverified',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = p_comment,
        archived_at = NULL,
        archived_by = NULL
      WHERE id = v_upload.id;
    END IF;

    IF v_upload.document_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (p_user_id, v_upload.document_url, now() + interval '7 days');
    END IF;

    IF v_upload.selfie_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (p_user_id, v_upload.selfie_url, now() + interval '7 days');
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
    now(),
    v_actor_social_id,
    v_target_social_id
  );

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'decision', p_decision);
END;
$$;

commit;
