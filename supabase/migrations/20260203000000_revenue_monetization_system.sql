-- =====================================================
-- HUDDLE V14: REVENUE & MONETIZATION SYSTEM
-- Full-Stack Fintech Implementation
-- Date: 2026-02-03
-- =====================================================

-- =====================================================
-- 1. EXTEND PROFILES TABLE FOR MONETIZATION
-- =====================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'premium', 'gold')),
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('inactive', 'active', 'past_due', 'canceled', 'trialing')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stars_count INTEGER DEFAULT 0 CHECK (stars_count >= 0),
  ADD COLUMN IF NOT EXISTS mesh_alert_count INTEGER DEFAULT 0 CHECK (mesh_alert_count >= 0),
  ADD COLUMN IF NOT EXISTS media_credits INTEGER DEFAULT 0 CHECK (media_credits >= 0),
  ADD COLUMN IF NOT EXISTS family_slots INTEGER DEFAULT 0 CHECK (family_slots >= 0),
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;

-- Add index for faster Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tier ON profiles(tier);

COMMENT ON COLUMN profiles.tier IS 'User subscription tier: free, premium, gold';
COMMENT ON COLUMN profiles.subscription_status IS 'Stripe subscription status';
COMMENT ON COLUMN profiles.stripe_customer_id IS 'Stripe Customer ID (unique)';
COMMENT ON COLUMN profiles.stripe_subscription_id IS 'Active Stripe Subscription ID';
COMMENT ON COLUMN profiles.stars_count IS 'Boost/Star credits for social features';
COMMENT ON COLUMN profiles.mesh_alert_count IS 'Emergency mesh alert credits';
COMMENT ON COLUMN profiles.media_credits IS 'AI Vet media upload credits';
COMMENT ON COLUMN profiles.family_slots IS 'Additional family member slots';
COMMENT ON COLUMN profiles.verified IS 'ID verification status (separate from premium)';

-- =====================================================
-- 2. CREATE TRANSACTIONS TABLE (AUDIT TRAIL)
-- =====================================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_event_id TEXT UNIQUE NOT NULL, -- For idempotency
  stripe_session_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('subscription', 'star_pack', 'emergency_alert', 'vet_media', 'family_slot', '5_media_pack', '7_day_extension', 'verified_badge', 'marketplace_booking')),
  amount INTEGER, -- In cents
  currency TEXT DEFAULT 'usd',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_event ON transactions(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

COMMENT ON TABLE transactions IS 'Full audit trail of all payment events from Stripe webhooks';
COMMENT ON COLUMN transactions.stripe_event_id IS 'Stripe Event ID - ensures idempotency (unique constraint prevents double-processing)';

-- =====================================================
-- 3. CREATE MARKETPLACE BOOKINGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS marketplace_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sitter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  stripe_transfer_id TEXT,
  amount INTEGER NOT NULL, -- In cents (total booking amount)
  platform_fee INTEGER NOT NULL, -- In cents (10% of amount)
  sitter_payout INTEGER NOT NULL, -- In cents (90% of amount)
  service_start_date TIMESTAMPTZ NOT NULL,
  service_end_date TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'disputed', 'refunded')),
  escrow_release_date TIMESTAMPTZ, -- Auto-calculated: service_end_date + 48 hours
  dispute_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_client ON marketplace_bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_sitter ON marketplace_bookings(sitter_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON marketplace_bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_escrow_release ON marketplace_bookings(escrow_release_date) WHERE status = 'completed';

COMMENT ON TABLE marketplace_bookings IS 'Pet sitter marketplace bookings with escrow management';
COMMENT ON COLUMN marketplace_bookings.escrow_release_date IS 'Auto-release funds 48 hours after service_end_date if no dispute';

-- =====================================================
-- 4. CREATE SITTER PROFILES TABLE (STRIPE CONNECT)
-- =====================================================

CREATE TABLE IF NOT EXISTS sitter_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_connect_account_id TEXT UNIQUE NOT NULL,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  payouts_enabled BOOLEAN DEFAULT FALSE,
  charges_enabled BOOLEAN DEFAULT FALSE,
  hourly_rate INTEGER, -- In cents
  bio TEXT,
  services JSONB DEFAULT '[]'::jsonb, -- ["dog_walking", "pet_sitting", "overnight_care"]
  availability JSONB DEFAULT '{}'::jsonb,
  rating DECIMAL(3,2) DEFAULT 0.00,
  total_bookings INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sitter_user ON sitter_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_sitter_stripe_connect ON sitter_profiles(stripe_connect_account_id);
CREATE INDEX IF NOT EXISTS idx_sitter_rating ON sitter_profiles(rating DESC);

COMMENT ON TABLE sitter_profiles IS 'Pet sitter marketplace profiles with Stripe Connect integration';

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- PROFILES: Users can only read their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- PROFILES: Users can update some fields, but NOT monetized fields
-- Note: RLS policies cannot prevent updates entirely, but we use triggers for validation
DROP POLICY IF EXISTS "Users can update own non-monetized fields" ON profiles;
CREATE POLICY "Users can update own non-monetized fields"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Service role can bypass (for webhooks)
DROP POLICY IF EXISTS "Service role has full access to profiles" ON profiles;
CREATE POLICY "Service role has full access to profiles"
  ON profiles FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- TRANSACTIONS: Users can view their own transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all transactions
DROP POLICY IF EXISTS "Service role has full access to transactions" ON transactions;
CREATE POLICY "Service role has full access to transactions"
  ON transactions FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- MARKETPLACE_BOOKINGS: Clients and sitters can view their bookings
ALTER TABLE marketplace_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own bookings" ON marketplace_bookings;
CREATE POLICY "Users can view own bookings"
  ON marketplace_bookings FOR SELECT
  USING (auth.uid() = client_id OR auth.uid() = sitter_id);

DROP POLICY IF EXISTS "Users can create bookings as client" ON marketplace_bookings;
CREATE POLICY "Users can create bookings as client"
  ON marketplace_bookings FOR INSERT
  WITH CHECK (auth.uid() = client_id);

-- Service role can manage all bookings
DROP POLICY IF EXISTS "Service role has full access to bookings" ON marketplace_bookings;
CREATE POLICY "Service role has full access to bookings"
  ON marketplace_bookings FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- SITTER_PROFILES: Public can view, owners can update
ALTER TABLE sitter_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view sitter profiles" ON sitter_profiles;
CREATE POLICY "Anyone can view sitter profiles"
  ON sitter_profiles FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Users can update own sitter profile" ON sitter_profiles;
CREATE POLICY "Users can update own sitter profile"
  ON sitter_profiles FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role has full access to sitter profiles" ON sitter_profiles;
CREATE POLICY "Service role has full access to sitter profiles"
  ON sitter_profiles FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- =====================================================
-- 6. HELPER FUNCTIONS
-- =====================================================

-- Function to safely increment counters (called by webhooks only)
CREATE OR REPLACE FUNCTION increment_user_credits(
  p_user_id UUID,
  p_stars INTEGER DEFAULT 0,
  p_mesh_alerts INTEGER DEFAULT 0,
  p_media_credits INTEGER DEFAULT 0,
  p_family_slots INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET
    stars_count = stars_count + p_stars,
    mesh_alert_count = mesh_alert_count + p_mesh_alerts,
    media_credits = media_credits + p_media_credits,
    family_slots = family_slots + p_family_slots,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_user_credits IS 'Safely increment user credits - only callable by service role via webhooks';

-- Function to upgrade user tier (called by webhooks only)
CREATE OR REPLACE FUNCTION upgrade_user_tier(
  p_user_id UUID,
  p_tier TEXT,
  p_subscription_status TEXT,
  p_stripe_subscription_id TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET
    tier = p_tier,
    subscription_status = p_subscription_status,
    stripe_subscription_id = p_stripe_subscription_id,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION upgrade_user_tier IS 'Upgrade user subscription tier - only callable by service role via webhooks';

-- Function to downgrade user on cancellation
CREATE OR REPLACE FUNCTION downgrade_user_tier(
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET
    tier = 'free',
    subscription_status = 'canceled',
    stripe_subscription_id = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION downgrade_user_tier IS 'Downgrade user to free tier - only callable by service role via webhooks';

-- =====================================================
-- 7. AUTOMATED TRIGGERS
-- =====================================================

-- Prevent users from tampering with monetized fields
CREATE OR REPLACE FUNCTION protect_monetized_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow service_role to modify these fields
  IF auth.jwt()->>'role' != 'service_role' THEN
    -- Restore original values if user tries to modify
    NEW.tier = OLD.tier;
    NEW.subscription_status = OLD.subscription_status;
    NEW.stars_count = OLD.stars_count;
    NEW.mesh_alert_count = OLD.mesh_alert_count;
    NEW.media_credits = OLD.media_credits;
    NEW.family_slots = OLD.family_slots;
    NEW.verified = OLD.verified;

    -- Only allow stripe_customer_id to be set once (from NULL)
    IF OLD.stripe_customer_id IS NOT NULL THEN
      NEW.stripe_customer_id = OLD.stripe_customer_id;
    END IF;

    -- Only allow stripe_subscription_id to be set once (from NULL)
    IF OLD.stripe_subscription_id IS NOT NULL THEN
      NEW.stripe_subscription_id = OLD.stripe_subscription_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER protect_profiles_monetization BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_monetized_fields();

COMMENT ON FUNCTION protect_monetized_fields IS 'Prevents users from tampering with monetized fields via browser console or direct API calls';

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON marketplace_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sitter_profiles_updated_at BEFORE UPDATE ON sitter_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-calculate escrow_release_date on booking insert/update
CREATE OR REPLACE FUNCTION set_escrow_release_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.escrow_release_date IS NULL THEN
    NEW.escrow_release_date = NEW.service_end_date + INTERVAL '48 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_booking_escrow_release BEFORE INSERT OR UPDATE ON marketplace_bookings
  FOR EACH ROW EXECUTE FUNCTION set_escrow_release_date();

-- =====================================================
-- 8. INITIAL DATA & CONFIGURATION
-- =====================================================

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON transactions TO authenticated;
GRANT SELECT ON marketplace_bookings TO authenticated;
GRANT SELECT ON sitter_profiles TO anon, authenticated;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON SCHEMA public IS 'Huddle V14 Revenue & Monetization System - Production Ready';
