-- =====================================================
-- MARKETPLACE ESCROW AUTO-RELEASE CRON JOB
-- Runs daily at 2 AM to release funds to sitters
-- =====================================================

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to release escrow funds
CREATE OR REPLACE FUNCTION release_escrow_funds()
RETURNS void AS $$
DECLARE
  booking_record RECORD;
BEGIN
  -- Find all bookings ready for escrow release
  FOR booking_record IN
    SELECT *
    FROM marketplace_bookings
    WHERE status = 'completed'
      AND escrow_release_date <= NOW()
      AND stripe_transfer_id IS NULL
  LOOP
    -- Mark as ready for payout (actual Stripe transfer handled by webhook or scheduled job)
    UPDATE marketplace_bookings
    SET
      status = 'payout_pending',
      updated_at = NOW()
    WHERE id = booking_record.id;

    -- Log the release
    RAISE NOTICE 'Escrow released for booking %', booking_record.id;

    -- TODO: Trigger Stripe payout API call via Edge Function
    -- This could be done via HTTP request to a separate Edge Function
    -- or via Stripe's scheduled payout system
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cron job to run daily at 2 AM UTC
SELECT cron.schedule(
  'release-escrow-daily',
  '0 2 * * *', -- Every day at 2 AM UTC
  $$ SELECT release_escrow_funds(); $$
);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION release_escrow_funds() TO postgres;

-- Add helpful comments
COMMENT ON FUNCTION release_escrow_funds IS 'Auto-releases escrow funds 48 hours after service completion if no dispute filed';

-- Create function to mark booking as completed (called when service ends)
CREATE OR REPLACE FUNCTION mark_booking_completed(
  p_booking_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE marketplace_bookings
  SET
    status = 'completed',
    updated_at = NOW()
  WHERE id = p_booking_id
    AND status = 'in_progress'
    AND service_end_date <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION mark_booking_completed IS 'Marks booking as completed after service end date';

-- Create function to handle disputes
CREATE OR REPLACE FUNCTION file_booking_dispute(
  p_booking_id UUID,
  p_dispute_reason TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE marketplace_bookings
  SET
    status = 'disputed',
    dispute_reason = p_dispute_reason,
    updated_at = NOW()
  WHERE id = p_booking_id
    AND status IN ('completed', 'payout_pending');

  -- TODO: Send notification to admin
  RAISE NOTICE 'Dispute filed for booking %', p_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION file_booking_dispute IS 'Allows client to file dispute and hold escrow release';

-- =====================================================
-- WEBHOOK INTEGRATION FUNCTION
-- Call this from Stripe webhook when payment succeeds
-- =====================================================

CREATE OR REPLACE FUNCTION handle_marketplace_payment_success(
  p_payment_intent_id TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE marketplace_bookings
  SET
    status = 'confirmed',
    updated_at = NOW()
  WHERE stripe_payment_intent_id = p_payment_intent_id
    AND status = 'pending';

  RAISE NOTICE 'Booking confirmed for payment intent %', p_payment_intent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION handle_marketplace_payment_success IS 'Called by webhook when marketplace payment succeeds';

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION mark_booking_completed TO service_role;
GRANT EXECUTE ON FUNCTION file_booking_dispute TO authenticated;
GRANT EXECUTE ON FUNCTION handle_marketplace_payment_success TO service_role;
