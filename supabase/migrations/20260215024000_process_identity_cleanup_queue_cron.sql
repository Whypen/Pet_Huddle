-- Ensure cleanup queue processor deletes identity_verification objects (hourly) and removes queue rows.

CREATE OR REPLACE FUNCTION public.process_identity_cleanup()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT *
    FROM public.identity_verification_cleanup_queue
    WHERE delete_after <= now()
  LOOP
    DELETE FROM storage.objects
    WHERE bucket_id = 'identity_verification'
      AND name = rec.object_path;

    DELETE FROM public.identity_verification_cleanup_queue
    WHERE id = rec.id;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'identity_cleanup_hourly') THEN
      PERFORM cron.unschedule('identity_cleanup_hourly');
    END IF;
    PERFORM cron.schedule(
      'identity_cleanup_hourly',
      '0 * * * *',
      $cron$select public.process_identity_cleanup();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not available; schedule public.process_identity_cleanup() via Scheduled Edge Function.';
  END IF;
END$$;

-- ROLLBACK (manual):
-- DROP FUNCTION IF EXISTS public.process_identity_cleanup();
-- SELECT cron.unschedule('identity_cleanup_hourly');
