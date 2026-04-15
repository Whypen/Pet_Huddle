-- Group discovery: fix chat_participants RLS + approve/decline/remove DB functions

-- ── 1. chat_participants INSERT policy (users can add themselves) ──────────────
CREATE POLICY "chat_participants_insert_own"
  ON public.chat_participants
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── 2. chat_participants DELETE policy (users can remove themselves) ──────────
CREATE POLICY "chat_participants_delete_own"
  ON public.chat_participants
  FOR DELETE
  USING (user_id = auth.uid());

-- ── 3. approve_group_join_request ─────────────────────────────────────────────
-- SECURITY DEFINER: inserts approved user into both membership tables (bypasses
-- the self-only RLS on chat_room_members/chat_participants) and sends a
-- notification (bypasses the service_role-only INSERT on notifications).
CREATE OR REPLACE FUNCTION public.approve_group_join_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_chat_id   uuid;
  v_user_id   uuid;
  v_chat_name text;
BEGIN
  -- Resolve request + chat name in one shot
  SELECT gjr.chat_id, gjr.user_id, c.name
    INTO v_chat_id, v_user_id, v_chat_name
  FROM public.group_join_requests gjr
  JOIN public.chats c ON c.id = gjr.chat_id
  WHERE gjr.id = p_request_id AND gjr.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;

  -- Caller must be admin of this chat
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE chat_id = v_chat_id AND user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Mark approved
  UPDATE public.group_join_requests SET status = 'approved' WHERE id = p_request_id;

  -- Add to primary membership table (drives My Groups listing)
  INSERT INTO public.chat_room_members (chat_id, user_id)
  VALUES (v_chat_id, v_user_id)
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  -- Add to role table (drives admin RLS checks)
  INSERT INTO public.chat_participants (chat_id, user_id, role)
  VALUES (v_chat_id, v_user_id, 'member')
  ON CONFLICT ON CONSTRAINT chat_participants_chat_id_user_id_key DO NOTHING;

  -- Notify the approved user
  INSERT INTO public.notifications (user_id, type, title, body, message, data, is_read)
  VALUES (
    v_user_id,
    'group_approved',
    'Request approved',
    v_chat_name || ' accepted your request to join.',
    v_chat_name || ' accepted your request to join.',
    jsonb_build_object('kind', 'group_approved', 'chat_id', v_chat_id::text, 'href', '/chats?tab=groups'),
    false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_group_join_request(uuid) TO authenticated;

-- ── 4. decline_group_join_request ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decline_group_join_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_chat_id   uuid;
  v_user_id   uuid;
  v_chat_name text;
BEGIN
  SELECT gjr.chat_id, gjr.user_id, c.name
    INTO v_chat_id, v_user_id, v_chat_name
  FROM public.group_join_requests gjr
  JOIN public.chats c ON c.id = gjr.chat_id
  WHERE gjr.id = p_request_id AND gjr.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE chat_id = v_chat_id AND user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.group_join_requests SET status = 'declined' WHERE id = p_request_id;

  -- Notify the requesting user
  INSERT INTO public.notifications (user_id, type, title, body, message, data, is_read)
  VALUES (
    v_user_id,
    'group_join_request',
    'Request not approved',
    v_chat_name || ' didn''t accept your request this time.',
    v_chat_name || ' didn''t accept your request this time.',
    jsonb_build_object('kind', 'group_join_request', 'chat_id', v_chat_id::text, 'href', '/chats?tab=groups'),
    false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_group_join_request(uuid) TO authenticated;

-- ── 5. remove_group_member ────────────────────────────────────────────────────
-- Admins removing another user requires SECURITY DEFINER to bypass the
-- self-only DELETE policy on both membership tables.
CREATE OR REPLACE FUNCTION public.remove_group_member(p_chat_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Caller must be admin of this chat
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE chat_id = p_chat_id AND user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Cannot remove another admin
  IF EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE chat_id = p_chat_id AND user_id = p_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Cannot remove an admin';
  END IF;

  DELETE FROM public.chat_room_members
  WHERE chat_id = p_chat_id AND user_id = p_user_id;

  DELETE FROM public.chat_participants
  WHERE chat_id = p_chat_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid) TO authenticated;
