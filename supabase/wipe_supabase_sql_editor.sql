-- SUPABASE SQL EDITOR WIPE SCRIPT
-- Run this in Supabase SQL Editor
-- ⚠️  DANGER: This will delete ALL users and related data
-- ⚠️  Only use in LOCAL/DEV environments

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count users before deletion
  SELECT COUNT(*) INTO v_count FROM auth.users;
  RAISE NOTICE 'Found % users to delete', v_count;

  -- Delete dependent data first (order matters for FK constraints)
  -- Use IF EXISTS checks for tables that may not exist

  DELETE FROM public.chat_messages WHERE TRUE;
  RAISE NOTICE 'Deleted all chat_messages';

  DELETE FROM public.verification_uploads WHERE TRUE;
  RAISE NOTICE 'Deleted all verification_uploads';

  DELETE FROM public.identity_verification_cleanup_queue WHERE TRUE;
  RAISE NOTICE 'Deleted all identity_verification_cleanup_queue';

  DELETE FROM public.admin_audit_logs WHERE TRUE;
  RAISE NOTICE 'Deleted all admin_audit_logs';

  DELETE FROM public.map_alerts WHERE TRUE;
  RAISE NOTICE 'Deleted all map_alerts';

  DELETE FROM public.threads WHERE TRUE;
  RAISE NOTICE 'Deleted all threads';

  DELETE FROM public.thread_comments WHERE TRUE;
  RAISE NOTICE 'Deleted all thread_comments';

  DELETE FROM public.swipes WHERE TRUE;
  RAISE NOTICE 'Deleted all swipes';

  DELETE FROM public.matches WHERE TRUE;
  RAISE NOTICE 'Deleted all matches';

  DELETE FROM public.user_quotas WHERE TRUE;
  RAISE NOTICE 'Deleted all user_quotas';

  DELETE FROM public.pets WHERE TRUE;
  RAISE NOTICE 'Deleted all pets';

  DELETE FROM public.profiles WHERE TRUE;
  RAISE NOTICE 'Deleted all profiles';

  -- Delete all auth users (cascades to auth tables)
  DELETE FROM auth.users WHERE TRUE;
  RAISE NOTICE 'Deleted all auth.users';

  RAISE NOTICE 'Database wiped successfully. Deleted % users.', v_count;
END $$;
