-- Restore native Supabase confirm-signup flow for email/password signups.
-- The app now waits for the hosted confirmation email instead of force-confirming
-- auth.users rows at insert time.

DROP TRIGGER IF EXISTS auto_confirm_email_on_signup ON auth.users;
DROP FUNCTION IF EXISTS public.auto_confirm_email_on_signup();
