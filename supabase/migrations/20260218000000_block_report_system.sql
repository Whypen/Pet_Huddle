-- ============================================================
-- MIGRATION: Block + Report System
-- Version: 20260218000000
-- ============================================================

-- ── 1. ENUMS ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE report_context_type AS ENUM (
    'chat',
    'profile',
    'social_post',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_reason AS ENUM (
    'harassment',
    'spam',
    'inappropriate_content',
    'fake_profile',
    'scam',
    'underage',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM (
    'new',
    'reviewing',
    'resolved',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 2. TABLES ────────────────────────────────────────────────

-- user_blocks: bidirectional enforcement
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_blocks_no_self_block CHECK (blocker_id <> blocked_id),
  CONSTRAINT user_blocks_unique UNIQUE (blocker_id, blocked_id)
);

COMMENT ON TABLE public.user_blocks IS 'One row per block relationship; blocker_id blocks blocked_id.';

-- user_reports: moderation queue
CREATE TABLE IF NOT EXISTS public.user_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  context_type    report_context_type NOT NULL DEFAULT 'other',
  context_id      uuid,
  reason          report_reason NOT NULL,
  details         text CHECK (char_length(details) <= 1000),
  status          report_status NOT NULL DEFAULT 'new',
  admin_notes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_reports_no_self_report CHECK (reporter_id <> reported_id)
);

COMMENT ON TABLE public.user_reports IS 'User-submitted abuse/misconduct reports. Admin-visible, reporter can read own.';


-- ── 3. INDEXES ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker  ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked  ON public.user_blocks(blocked_id);
-- Fast bidirectional lookup (is X blocked by Y or vice versa?)
CREATE INDEX IF NOT EXISTS idx_user_blocks_pair     ON public.user_blocks(blocker_id, blocked_id);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter  ON public.user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported  ON public.user_reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_status    ON public.user_reports(status);


-- ── 4. RLS ───────────────────────────────────────────────────

ALTER TABLE public.user_blocks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- ── user_blocks policies ──────────────────────────────────────

-- Blocker can read their own block rows; blocked user sees nothing
CREATE POLICY "blocks_select_own" ON public.user_blocks
  FOR SELECT USING (blocker_id = auth.uid());

-- Only the blocker can create a block
CREATE POLICY "blocks_insert_own" ON public.user_blocks
  FOR INSERT WITH CHECK (blocker_id = auth.uid());

-- Only the blocker can delete (unblock)
CREATE POLICY "blocks_delete_own" ON public.user_blocks
  FOR DELETE USING (blocker_id = auth.uid());

-- ── user_reports policies ─────────────────────────────────────

-- Reporter can see their own reports
CREATE POLICY "reports_select_own" ON public.user_reports
  FOR SELECT USING (reporter_id = auth.uid());

-- Admin can see all reports
CREATE POLICY "reports_select_admin" ON public.user_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );

-- Reporter can insert own
CREATE POLICY "reports_insert_own" ON public.user_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

-- Admin can update (change status, add admin_notes)
CREATE POLICY "reports_update_admin" ON public.user_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND user_role = 'admin'
    )
  );


-- ── 5. RPC: is_blocked ────────────────────────────────────────
-- Returns true if EITHER party has blocked the other.
-- SECURITY DEFINER avoids RLS bypass, callable by authenticated users.
CREATE OR REPLACE FUNCTION public.is_blocked(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
       OR (blocker_id = p_user_b AND blocked_id = p_user_a)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.is_blocked IS
  'Returns true if either user has blocked the other. Used to gate message sends and discovery.';


-- ── 6. RPC: block_user ───────────────────────────────────────
-- Idempotent upsert-style block.
CREATE OR REPLACE FUNCTION public.block_user(p_blocked_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() = p_blocked_id THEN
    RAISE EXCEPTION 'Cannot block yourself';
  END IF;

  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (auth.uid(), p_blocked_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;


-- ── 7. RPC: unblock_user ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unblock_user(p_blocked_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.user_blocks
  WHERE blocker_id = auth.uid()
    AND blocked_id = p_blocked_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;


-- ── 8. RPC: submit_report ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_report(
  p_reported_id   uuid,
  p_context_type  report_context_type,
  p_context_id    uuid,
  p_reason        report_reason,
  p_details       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() = p_reported_id THEN
    RAISE EXCEPTION 'Cannot report yourself';
  END IF;
  IF p_details IS NOT NULL AND char_length(p_details) > 1000 THEN
    RAISE EXCEPTION 'Details must be ≤ 1000 characters';
  END IF;

  INSERT INTO public.user_reports (
    reporter_id, reported_id, context_type, context_id, reason, details
  ) VALUES (
    auth.uid(), p_reported_id, p_context_type, p_context_id, p_reason, p_details
  )
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_report(uuid, report_context_type, uuid, report_reason, text) TO authenticated;


-- ── 9. RPC: admin_update_report_status ───────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_report_status(
  p_report_id   uuid,
  p_status      report_status,
  p_admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.user_reports
  SET
    status      = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes)
  WHERE id = p_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_report_status(uuid, report_status, text) TO authenticated;


-- ── 10. GRANT table-level privileges ─────────────────────────
GRANT SELECT, INSERT, DELETE ON public.user_blocks  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_reports TO authenticated;
