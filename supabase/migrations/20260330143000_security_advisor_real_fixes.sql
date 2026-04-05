-- Fix real security advisor issues without touching platform-owned PostGIS objects.
-- 1) Ensure public.profiles_public runs as security_invoker.
-- 2) Freeze search_path for app-owned public-schema functions missing explicit search_path.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'profiles_public'
      AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.profiles_public SET (security_invoker = true)';
  END IF;
END
$$;
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d
      ON d.objid = p.oid
     AND d.classid = 'pg_proc'::regclass
     AND d.refclassid = 'pg_extension'::regclass
     AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND d.objid IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, auth, extensions, pg_temp',
      rec.schema_name,
      rec.function_name,
      rec.identity_args
    );
  END LOOP;
END
$$;
