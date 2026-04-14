-- Group discovery: extend chats + join requests + widen notifications type

-- 1. Extend chats table for public/private group discovery
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS visibility     text DEFAULT 'private'
    CONSTRAINT chats_visibility_check CHECK (visibility IN ('public','private')),
  ADD COLUMN IF NOT EXISTS join_method    text DEFAULT 'request'
    CONSTRAINT chats_join_method_check CHECK (join_method IN ('request','instant')),
  ADD COLUMN IF NOT EXISTS room_code      text,
  ADD COLUMN IF NOT EXISTS location_label text,
  ADD COLUMN IF NOT EXISTS pet_focus      text[],
  ADD COLUMN IF NOT EXISTS description    text;

-- Unique constraint on room_code (NULL values are not considered equal, so only one NULL per column but multiple NULLs are fine in PG)
CREATE UNIQUE INDEX IF NOT EXISTS chats_room_code_unique ON public.chats (room_code) WHERE room_code IS NOT NULL;

-- 2. Auto-generate 6-digit room code for private groups on INSERT
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type = 'group' AND (NEW.visibility IS NULL OR NEW.visibility = 'private') AND NEW.room_code IS NULL THEN
    LOOP
      NEW.room_code := LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.chats WHERE room_code = NEW.room_code);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_group_room_code ON public.chats;
CREATE TRIGGER set_group_room_code
  BEFORE INSERT ON public.chats
  FOR EACH ROW EXECUTE FUNCTION public.generate_room_code();

-- 3. Group join requests table
CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id    uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status     text DEFAULT 'pending'
    CONSTRAINT group_join_requests_status_check CHECK (status IN ('pending','approved','declined')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (chat_id, user_id)
);

-- RLS
ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

-- Admins of the group can view and manage all requests for their groups
CREATE POLICY "Group admins can manage join requests"
  ON public.group_join_requests
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants
      WHERE chat_participants.chat_id = group_join_requests.chat_id
        AND chat_participants.user_id = auth.uid()
        AND chat_participants.role = 'admin'
    )
  );

-- Users can insert their own join request
CREATE POLICY "Users can insert own join request"
  ON public.group_join_requests
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can view their own join requests
CREATE POLICY "Users can view own join requests"
  ON public.group_join_requests
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can delete (withdraw) their own pending join requests
CREATE POLICY "Users can delete own join requests"
  ON public.group_join_requests
  FOR DELETE
  USING (user_id = auth.uid());

-- 4. Index for public group discovery
CREATE INDEX IF NOT EXISTS idx_chats_public_groups
  ON public.chats (last_message_at DESC)
  WHERE type = 'group' AND visibility = 'public';

-- 5. Widen notifications type check to include group notification types
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
      'wave'::text,
      'star'::text,
      'match'::text,
      'message'::text,
      'group_invite'::text,
      'broadcast'::text,
      'mention'::text,
      'thread_reply'::text,
      'booking'::text,
      'system'::text,
      'family_invite'::text,
      'chats'::text,
      'map'::text,
      'social'::text,
      'group_join_request'::text,
      'group_approved'::text,
      'group_joined_via_code'::text
    ])
  );
