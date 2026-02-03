-- =====================================================
-- V16 ESCROW RELEASE PATCH
-- Fixes: status check includes 'paid', runs hourly
-- Adds: chat_messages table, last_lat/last_lng to profiles
-- =====================================================

-- 1. Patch escrow release function to include 'paid' bookings
CREATE OR REPLACE FUNCTION release_escrow_funds()
RETURNS void AS $$
DECLARE
  booking_record RECORD;
BEGIN
  -- Find bookings paid and past escrow_release_date
  FOR booking_record IN
    SELECT *
    FROM marketplace_bookings
    WHERE status IN ('paid', 'completed', 'confirmed')
      AND escrow_release_date <= NOW()
      AND (stripe_transfer_id IS NULL OR stripe_transfer_id = '')
      AND escrow_status = 'pending'
  LOOP
    UPDATE marketplace_bookings
    SET
      status = 'payout_pending',
      escrow_status = 'released',
      updated_at = NOW()
    WHERE id = booking_record.id;

    RAISE NOTICE 'V16: Escrow released for booking %, amount %', booking_record.id, booking_record.amount;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Re-schedule cron to run hourly (more precise 48h release)
SELECT cron.unschedule('release-escrow-daily');

SELECT cron.schedule(
  'release-escrow-hourly',
  '0 * * * *', -- Every hour at :00
  $$ SELECT release_escrow_funds(); $$
);

-- 3. Add chat_messages table for realtime chat
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for chat_messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (true);

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- 4. Add location columns to profiles (for Map geolocation persist)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION;

-- 5. Add escrow_status column to marketplace_bookings if missing
ALTER TABLE marketplace_bookings ADD COLUMN IF NOT EXISTS escrow_status TEXT DEFAULT 'pending';
ALTER TABLE marketplace_bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 6. Grant permissions
GRANT EXECUTE ON FUNCTION release_escrow_funds() TO postgres;
GRANT INSERT, SELECT ON chat_messages TO authenticated;
GRANT ALL ON chat_messages TO service_role;
