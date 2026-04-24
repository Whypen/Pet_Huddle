-- Add chat_id to message_reads to enable room-scoped realtime subscriptions.
-- Previously the realtime channel had no filter; now it can use chat_id=eq.{roomId}.
ALTER TABLE message_reads ADD COLUMN IF NOT EXISTS chat_id UUID;

-- Backfill existing rows from chat_messages
UPDATE message_reads mr
SET chat_id = cm.chat_id
FROM chat_messages cm
WHERE mr.message_id = cm.id
  AND mr.chat_id IS NULL;

-- Index for realtime filter and query performance
CREATE INDEX IF NOT EXISTS idx_message_reads_chat_id ON message_reads(chat_id);
