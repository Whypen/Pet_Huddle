-- ============================================================================
-- Email verification gate
-- ============================================================================
-- Adds three columns to profiles:
--   email_verified         — gate for completing onboarding
--   email_verify_token     — short-lived UUID sent in the verification email
--   email_verify_token_expires_at — 24-hour expiry
--
-- Existing users are back-filled as verified so they are not disrupted.
-- New users default to false and must complete verification.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verify_token text,
  ADD COLUMN IF NOT EXISTS email_verify_token_expires_at timestamptz;

-- Back-fill: existing users have already authenticated via other means
-- (phone OTP / identity verification). Mark them as verified so the new gate
-- does not lock out the existing user base.
UPDATE public.profiles
SET email_verified = true
WHERE email_verified = false;

-- RLS: allow the user's own row to be read for email_verified
-- (already covered by existing RLS SELECT policy on profiles)
