-- Revoke anon write access for map_alerts; keep authenticated only
REVOKE INSERT, UPDATE, DELETE ON public.map_alerts FROM anon;

-- Drop anon insert policy if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'map_alerts'
      AND policyname = 'map_alerts_insert_public'
  ) THEN
    DROP POLICY map_alerts_insert_public ON public.map_alerts;
  END IF;
END $$;

-- Drop anon select policy if present (optional read-only via other mechanisms)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'map_alerts'
      AND policyname = 'map_alerts_select_anon_uat'
  ) THEN
    DROP POLICY map_alerts_select_anon_uat ON public.map_alerts;
  END IF;
END $$;
