-- Fix queue_identity_cleanup to use updated verification_status enum values.

CREATE OR REPLACE FUNCTION public.queue_identity_cleanup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.verification_status = 'pending'::public.verification_status_enum)
     AND (NEW.verification_status IN ('verified'::public.verification_status_enum, 'unverified'::public.verification_status_enum))
     AND NEW.verification_document_url IS NOT NULL
  THEN
    INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    VALUES (NEW.id, NEW.verification_document_url, NOW() + INTERVAL '7 days');
  END IF;
  RETURN NEW;
END;
$$;
