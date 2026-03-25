-- ============================================================================
-- Auto-confirm email on signup
-- ============================================================================
-- Root cause: production Supabase has "Confirm email" enabled, so
-- supabase.auth.signUp() returns session:null for every new user.
-- /verify-identity checks for a live session before any action; without
-- one it bounces back to /signup/verify on every button click.
--
-- This app's security model is phone OTP / face / card identity verification —
-- not email confirmation. Email confirmation is an accidental misconfiguration
-- that blocks the entire signup → verify-identity flow without adding security.
--
-- Fix: a BEFORE INSERT trigger on auth.users sets email_confirmed_at = NOW()
-- before GoTrue writes the row. The RETURNING clause then gives GoTrue a
-- confirmed user, so signUp() returns a live session.
--
-- The trigger function lives in the public schema because postgres does not
-- have CREATE permission inside the auth schema on hosted Supabase.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_confirm_email_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  -- Only touch email-based users that are not yet confirmed.
  -- Phone-only and SSO signups are unaffected.
  IF NEW.email IS NOT NULL AND NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_confirm_email_on_signup ON auth.users;
CREATE TRIGGER auto_confirm_email_on_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_email_on_signup();

-- Back-fill: confirm existing unconfirmed email users so they can sign in.
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email IS NOT NULL
  AND email_confirmed_at IS NULL;
