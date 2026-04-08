-- Add explicit fee-split columns to marketplace_bookings.
-- These columns capture the dual 10% fee model (requester + provider).
-- Existing columns retain their meaning for backward compatibility:
--   amount        = customer total charged (quote + requester_fee) — was quote; now customerTotal
--   platform_fee  = gross platform capture (requester_fee + provider_fee) — was 10%; now 20%
--   sitter_payout = provider payout (quote - provider_fee = quote × 0.90) — unchanged
-- New columns (NULL for pre-migration rows):
--   quote_amount  = provider's original quoted price in cents
--   requester_fee = 10% of quote, charged on top of quote to requester
--   provider_fee  = 10% of quote, deducted from quote before provider payout
ALTER TABLE public.marketplace_bookings
  ADD COLUMN IF NOT EXISTS quote_amount INTEGER,
  ADD COLUMN IF NOT EXISTS requester_fee INTEGER,
  ADD COLUMN IF NOT EXISTS provider_fee INTEGER;

COMMENT ON COLUMN public.marketplace_bookings.quote_amount  IS 'Provider quoted price in cents. NULL for bookings created before the dual-fee model.';
COMMENT ON COLUMN public.marketplace_bookings.requester_fee IS '10% of quote_amount added to requester charge. NULL for pre-migration rows.';
COMMENT ON COLUMN public.marketplace_bookings.provider_fee  IS '10% of quote_amount deducted from provider payout. NULL for pre-migration rows.';
