CREATE OR REPLACE FUNCTION public.prevent_sensitive_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
    (OLD.verification_status IS NULL OR OLD.verification_status = 'unverified'::public.verification_status_enum)
    AND (NEW.verification_status = 'pending'::public.verification_status_enum);

  admin_verification_transition :=
    is_admin
    AND NEW.verification_status IS DISTINCT FROM OLD.verification_status
    AND NEW.verification_status IN (
      'verified'::public.verification_status_enum,
      'unverified'::public.verification_status_enum
    );

  IF NEW.verification_status = 'verified'::public.verification_status_enum AND NOT is_admin THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  IF (NEW.legal_name IS DISTINCT FROM OLD.legal_name) AND NOT allowed_kyc_transition THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  IF (NEW.tier IS DISTINCT FROM OLD.tier)
     OR (NEW.subscription_status IS DISTINCT FROM OLD.subscription_status)
     OR (NEW.subscription_cycle_anchor_day IS DISTINCT FROM OLD.subscription_cycle_anchor_day)
     OR (NEW.subscription_current_period_start IS DISTINCT FROM OLD.subscription_current_period_start)
     OR (NEW.subscription_current_period_end IS DISTINCT FROM OLD.subscription_current_period_end)
     OR ((NEW.is_verified IS DISTINCT FROM OLD.is_verified) AND NOT admin_verification_transition)
     OR ((NEW.verified IS DISTINCT FROM OLD.verified) AND NOT admin_verification_transition)
     OR ((NEW.verification_comment IS DISTINCT FROM OLD.verification_comment) AND NOT admin_verification_transition)
     OR (NEW.family_slots IS DISTINCT FROM OLD.family_slots)
     OR (NEW.media_credits IS DISTINCT FROM OLD.media_credits)
     OR (NEW.stars_count IS DISTINCT FROM OLD.stars_count)
     OR (NEW.mesh_alert_count IS DISTINCT FROM OLD.mesh_alert_count)
     OR ((NEW.verification_status IS DISTINCT FROM OLD.verification_status)
         AND NOT allowed_kyc_transition
         AND NOT admin_verification_transition)
  THEN
    RAISE EXCEPTION 'forbidden_profile_update';
  END IF;

  RETURN NEW;
END;
$function$;
