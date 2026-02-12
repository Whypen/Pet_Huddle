-- Ensure authenticated role can access map_alerts and RLS allows inserts/selects for UAT
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_alerts TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.map_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'map_alerts'
      AND policyname = 'map_alerts_insert_own'
  ) THEN
    CREATE POLICY map_alerts_insert_own
      ON public.map_alerts
      FOR INSERT
      TO authenticated
      WITH CHECK (creator_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'map_alerts'
      AND policyname = 'map_alerts_select_visible'
  ) THEN
    CREATE POLICY map_alerts_select_visible
      ON public.map_alerts
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
