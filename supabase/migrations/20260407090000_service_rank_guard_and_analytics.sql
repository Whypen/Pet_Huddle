-- ─── 1. Guard: prevent self-inflation of service_rank_weight ─────────────────
--
-- The existing RLS policy "Users can update own pet_care_profile" permits any
-- column UPDATE, so a carer could PATCH service_rank_weight = 20 directly via
-- PostgREST. This BEFORE UPDATE trigger silently resets the column to the
-- correct tier-derived value whenever it is touched, making the field
-- effectively read-only from the client's perspective.
--
-- Only fires when service_rank_weight is actually changed (IS DISTINCT FROM),
-- so legitimate carer profile updates have zero overhead from the join.

CREATE OR REPLACE FUNCTION public.guard_service_rank_weight()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tier    text;
  v_expected integer;
BEGIN
  IF NEW.service_rank_weight IS DISTINCT FROM OLD.service_rank_weight THEN
    SELECT effective_tier INTO v_tier
    FROM public.profiles
    WHERE id = NEW.user_id;

    v_expected := CASE
      WHEN v_tier = 'gold' THEN 20
      WHEN v_tier = 'plus' THEN 10
      ELSE 0
    END;

    NEW.service_rank_weight := v_expected;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_service_rank_weight ON public.pet_care_profiles;
CREATE TRIGGER trg_guard_service_rank_weight
  BEFORE UPDATE ON public.pet_care_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_service_rank_weight();


-- ─── 2. Service analytics table ───────────────────────────────────────────────
--
-- Lightweight event log for Service feed and profile-view tier analytics.
-- Events: service_feed_rendered, service_profile_viewed.
-- Authenticated users may only insert their own rows; no public read.

CREATE TABLE IF NOT EXISTS public.service_analytics (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  event      text        NOT NULL,
  payload    jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_analytics_insert_own" ON public.service_analytics;
CREATE POLICY "service_analytics_insert_own"
  ON public.service_analytics
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
