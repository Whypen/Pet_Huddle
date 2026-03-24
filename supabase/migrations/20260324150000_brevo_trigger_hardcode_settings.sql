-- Brevo verification trigger: replaces current_setting GUC calls with hardcoded
-- project URL and service role key, since ALTER DATABASE/ROLE requires superuser
-- which is not available on hosted Supabase.

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
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cmJvdXJ3Y25ocnBtendscmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTM1NDY0MywiZXhwIjoyMDg0OTMwNjQzfQ.h4ccDhIeiOhDk9x-YgAGkgME9Nc372_RIWE0nQ9hnNA',
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
