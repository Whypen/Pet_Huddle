-- Superseded by 20260427154500_remove_legacy_supabase_jwt_from_db_network_calls.sql.
-- Do not hardcode Supabase service-role JWTs in database functions.

CREATE OR REPLACE FUNCTION public.notify_brevo_verification_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.verification_status IS NOT DISTINCT FROM NEW.verification_status THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM net.http_post(
      url     := 'https://ztrbourwcnhrpmzwlrcn.supabase.co/functions/v1/brevo-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer removed_legacy_service_role_jwt',
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object(
        'event',   'verification_completed',
        'user_id', NEW.id::text
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[brevo] verification trigger failed for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- Ensure trigger is attached (idempotent).
DROP TRIGGER IF EXISTS trg_brevo_verification_status_changed ON public.profiles;
CREATE TRIGGER trg_brevo_verification_status_changed
  AFTER UPDATE OF verification_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_brevo_verification_status_changed();
