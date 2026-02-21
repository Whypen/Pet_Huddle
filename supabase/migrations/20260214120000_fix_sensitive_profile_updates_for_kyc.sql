-- Allow unverified -> pending transition during KYC submit while protecting sensitive fields.

CREATE OR REPLACE FUNCTION public.prevent_sensitive_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  role text := (auth.jwt() ->> 'role');
  allowed_kyc_transition boolean := false;
BEGIN
  -- Service role can update everything.
  IF role = 'service_role' THEN
    RETURN NEW;
  END IF;

  allowed_kyc_transition :=
    (OLD.verification_status = 'unverified'::public.verification_status_enum)
    AND (NEW.verification_status = 'pending'::public.verification_status_enum);

  -- Block any attempt to set verification_status to verified directly.
  IF NEW.verification_status = 'verified'::public.verification_status_enum THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  -- Only allow legal_name updates when transitioning unverified -> pending.
  IF (NEW.legal_name IS DISTINCT FROM OLD.legal_name) AND NOT allowed_kyc_transition THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  -- Block sensitive fields and disallow verification_status changes except the allowed transition.
  IF (NEW.tier IS DISTINCT FROM OLD.tier)
     OR (NEW.subscription_status IS DISTINCT FROM OLD.subscription_status)
     OR (NEW.subscription_cycle_anchor_day IS DISTINCT FROM OLD.subscription_cycle_anchor_day)
     OR (NEW.subscription_current_period_start IS DISTINCT FROM OLD.subscription_current_period_start)
     OR (NEW.subscription_current_period_end IS DISTINCT FROM OLD.subscription_current_period_end)
     OR (NEW.is_verified IS DISTINCT FROM OLD.is_verified)
     OR (NEW.verified IS DISTINCT FROM OLD.verified)
     OR (NEW.verification_comment IS DISTINCT FROM OLD.verification_comment)
     OR (NEW.family_slots IS DISTINCT FROM OLD.family_slots)
     OR (NEW.media_credits IS DISTINCT FROM OLD.media_credits)
     OR (NEW.stars_count IS DISTINCT FROM OLD.stars_count)
     OR (NEW.mesh_alert_count IS DISTINCT FROM OLD.mesh_alert_count)
     OR ((NEW.verification_status IS DISTINCT FROM OLD.verification_status) AND NOT allowed_kyc_transition)
  THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  RETURN NEW;
END;
$function$;

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
    legal_name = COALESCE(p_legal_name, prof.legal_name)
  WHERE prof.id = v_user;
END;
$$;
