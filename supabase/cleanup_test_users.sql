-- Cleanup script for specific test users
-- Usage: Run this in Supabase SQL Editor or via psql
-- WARNING: This will permanently delete user data

-- Delete specific test users by email
DO $$
DECLARE
  v_test_emails TEXT[] := ARRAY[
    'twenty_illkid@msn.com',
    'fongpoman114@gmail.com'
  ];
  v_user_id UUID;
  v_email TEXT;
BEGIN
  FOREACH v_email IN ARRAY v_test_emails
  LOOP
    -- Get user ID from auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = v_email;

    IF v_user_id IS NOT NULL THEN
      RAISE NOTICE 'Deleting user: % (ID: %)', v_email, v_user_id;

      -- Delete from public tables (cascades will handle some, but explicit for clarity)
      DELETE FROM public.verification_uploads WHERE user_id = v_user_id;
      DELETE FROM public.admin_audit_logs WHERE target_user_id = v_user_id OR actor_id = v_user_id;
      DELETE FROM public.map_alerts WHERE creator_id = v_user_id;
      DELETE FROM public.threads WHERE user_id = v_user_id;
      DELETE FROM public.profiles WHERE id = v_user_id;

      -- Delete from auth.users (this should cascade to auth tables)
      DELETE FROM auth.users WHERE id = v_user_id;

      RAISE NOTICE 'Deleted user: %', v_email;
    ELSE
      RAISE NOTICE 'User not found: %', v_email;
    END IF;
  END LOOP;
END $$;
