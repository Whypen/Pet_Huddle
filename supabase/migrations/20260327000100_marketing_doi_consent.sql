-- Marketing double opt-in (DOI) consent fields
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds explicit two-stage consent tracking to profiles.
--
-- Stage 1 (first opt-in):  user checks checkbox on signup/name form
--   → marketing_opt_in_checked = true, marketing_opt_in_checked_at = now()
--   → DOI email sent with token
--
-- Stage 2 (DOI confirmed): user clicks link in marketing DOI email
--   → marketing_doi_confirmed = true, marketing_doi_confirmed_at = now()
--   → marketing_subscribed = true
--   → marketing_consent = true (kept in sync — brevo-sync reads this)
--
-- Unsubscribe (brevo-webhook): sets marketing_subscribed = false, marketing_consent = false
--   opt_in_checked + doi_confirmed are NEVER reset — they are immutable audit records
--
-- Send gate: marketing_opt_in_checked AND marketing_doi_confirmed
--            AND marketing_subscribed AND marketing_unsubscribed_at IS NULL
--
-- marketing_doi_token / _expires_at: one-time 7-day token, cleared after confirmation

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_opt_in_checked        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_checked_at     timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_doi_confirmed         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_doi_confirmed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_subscribed            boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_doi_token             text,
  ADD COLUMN IF NOT EXISTS marketing_doi_token_expires_at  timestamptz;

-- Backfill: existing users who already have marketing_consent = true are considered
-- fully subscribed (they pre-date DOI; treat their consent_at as DOI confirmed_at).
UPDATE public.profiles
SET
  marketing_opt_in_checked    = true,
  marketing_opt_in_checked_at = COALESCE(marketing_consent_at, now()),
  marketing_doi_confirmed     = true,
  marketing_doi_confirmed_at  = COALESCE(marketing_consent_at, now()),
  marketing_subscribed        = true
WHERE marketing_consent = true;
