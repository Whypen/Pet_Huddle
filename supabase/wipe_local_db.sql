-- LOCAL DB WIPE SCRIPT (psql 54322)
-- Run with: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f wipe_local_db.sql

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count users before deletion
  SELECT COUNT(*) INTO v_count FROM auth.users;
  RAISE NOTICE 'Found % users to delete', v_count;

  -- Delete dependent data first (order matters for FK constraints)
  DELETE FROM public.chat_messages;
  RAISE NOTICE 'Deleted all chat_messages';

  DELETE FROM public.verification_uploads;
  RAISE NOTICE 'Deleted all verification_uploads';

  DELETE FROM public.identity_verification_cleanup_queue;
  RAISE NOTICE 'Deleted all identity_verification_cleanup_queue';

  DELETE FROM public.admin_audit_logs;
  RAISE NOTICE 'Deleted all admin_audit_logs';

  DELETE FROM public.map_alerts;
  RAISE NOTICE 'Deleted all map_alerts';

  DELETE FROM public.threads;
  RAISE NOTICE 'Deleted all threads';

  DELETE FROM public.thread_comments;
  RAISE NOTICE 'Deleted all thread_comments';

  DELETE FROM public.swipes;
  RAISE NOTICE 'Deleted all swipes';

  DELETE FROM public.matches;
  RAISE NOTICE 'Deleted all matches';

  DELETE FROM public.user_quotas;
  RAISE NOTICE 'Deleted all user_quotas';

  DELETE FROM public.pets;
  RAISE NOTICE 'Deleted all pets';

  DELETE FROM public.profiles;
  RAISE NOTICE 'Deleted all profiles';

  -- Delete all auth users (cascades to auth tables)
  DELETE FROM auth.users;
  RAISE NOTICE 'Deleted all auth.users';

  RAISE NOTICE 'Database wiped successfully. Deleted % users.', v_count;
END $$;
