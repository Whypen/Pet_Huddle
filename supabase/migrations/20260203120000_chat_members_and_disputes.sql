-- Chat room membership + dispute flag alignment

-- 1. Chat room members table
CREATE TABLE IF NOT EXISTS chat_room_members (
  room_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_room_members_select" ON chat_room_members;
CREATE POLICY "chat_room_members_select"
  ON chat_room_members FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_room_members_insert" ON chat_room_members;
CREATE POLICY "chat_room_members_insert"
  ON chat_room_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_room_members_delete" ON chat_room_members;
CREATE POLICY "chat_room_members_delete"
  ON chat_room_members FOR DELETE
  USING (user_id = auth.uid());

-- 2. Restrict chat_messages to members only
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
CREATE POLICY "chat_messages_select"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_room_members m
      WHERE m.room_id = chat_messages.room_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_messages_insert" ON chat_messages;
CREATE POLICY "chat_messages_insert"
  ON chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM chat_room_members m
      WHERE m.room_id = chat_messages.room_id
        AND m.user_id = auth.uid()
    )
  );

-- 3. Add dispute_flag to marketplace_bookings
ALTER TABLE marketplace_bookings
  ADD COLUMN IF NOT EXISTS dispute_flag BOOLEAN DEFAULT FALSE;

-- 4. Update dispute RPC to set dispute_flag
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
    dispute_flag = TRUE,
    updated_at = NOW()
  WHERE id = p_booking_id
    AND status IN ('completed', 'payout_pending', 'paid');

  RAISE NOTICE 'Dispute filed for booking %', p_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Patch escrow release function to respect dispute_flag
CREATE OR REPLACE FUNCTION release_escrow_funds()
RETURNS void AS $$
DECLARE
  booking_record RECORD;
BEGIN
  FOR booking_record IN
    SELECT *
    FROM marketplace_bookings
    WHERE status IN ('paid', 'completed', 'confirmed')
      AND escrow_release_date <= NOW()
      AND (stripe_transfer_id IS NULL OR stripe_transfer_id = '')
      AND escrow_status = 'pending'
      AND dispute_flag = FALSE
  LOOP
    UPDATE marketplace_bookings
    SET
      status = 'payout_pending',
      escrow_status = 'released',
      updated_at = NOW()
    WHERE id = booking_record.id;

    RAISE NOTICE 'Escrow released for booking %', booking_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Permissions
GRANT SELECT, INSERT, DELETE ON chat_room_members TO authenticated;
GRANT ALL ON chat_room_members TO service_role;
