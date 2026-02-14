-- Nuclear option: Wipe ALL local users
-- Usage: Run this in Supabase SQL Editor or via psql
-- ⚠️  DANGER: This will delete ALL users and related data from the database
-- ⚠️  Only use this in LOCAL DEVELOPMENT environments
-- ⚠️  DO NOT run this in production

-- Safety check: Uncomment the line below to enable this script
-- DO $$
-- BEGIN
--   RAISE EXCEPTION 'Safety check: Uncomment this block to enable wipe script';
-- END $$;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count users before deletion
  SELECT COUNT(*) INTO v_count FROM auth.users;
  RAISE NOTICE 'Found % users to delete', v_count;

  -- Delete all data from public tables (in order of dependencies)
  DELETE FROM public.verification_uploads;
  RAISE NOTICE 'Deleted all verification_uploads';

  DELETE FROM public.admin_audit_logs;
  RAISE NOTICE 'Deleted all admin_audit_logs';

  DELETE FROM public.map_alerts;
  RAISE NOTICE 'Deleted all map_alerts';

  DELETE FROM public.threads;
  RAISE NOTICE 'Deleted all threads';

  DELETE FROM public.profiles;
  RAISE NOTICE 'Deleted all profiles';

  -- Delete all auth users (cascades to auth tables)
  DELETE FROM auth.users;
  RAISE NOTICE 'Deleted all auth.users';

  -- Reset sequences if needed
  -- ALTER SEQUENCE IF EXISTS public.some_sequence RESTART WITH 1;

  RAISE NOTICE 'Database wiped successfully. Deleted % users.', v_count;
END $$;
