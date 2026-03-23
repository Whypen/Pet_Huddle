-- Brevo CRM bridge: add missing columns to profiles
-- ─────────────────────────────────────────────────
-- Marketing consent fields (mirrored to Brevo as MARKETING_CONSENT / MARKETING_CONSENT_AT):
--   marketing_consent, marketing_consent_at
-- Unsubscribe mirror (written by brevo-webhook only, never by app logic):
--   marketing_unsubscribed_at
-- Brevo sync control fields (app DB only — NEVER forwarded to Brevo):
--   brevo_sync_required, brevo_sync_reason, last_active_synced_at
--
-- NOT added here (real star/balance field is user_quotas.extras_stars — requires product decision):
--   super_huddle_balance
-- NOT added here (app does not reliably store city — use COUNTRY + DISTRICT only):
--   location_city

ALTER TABLE public.profiles
  -- Marketing consent
  ADD COLUMN IF NOT EXISTS marketing_consent         boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_unsubscribed_at timestamptz,

  -- Brevo sync control (app DB only)
  ADD COLUMN IF NOT EXISTS brevo_sync_required       boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS brevo_sync_reason         text,
  ADD COLUMN IF NOT EXISTS last_active_synced_at     timestamptz;

-- Fast lookup for webhook sync-back (flip consent on unsubscribe)
CREATE INDEX IF NOT EXISTS idx_profiles_brevo_sync_required
  ON public.profiles (brevo_sync_required)
  WHERE brevo_sync_required = true;
