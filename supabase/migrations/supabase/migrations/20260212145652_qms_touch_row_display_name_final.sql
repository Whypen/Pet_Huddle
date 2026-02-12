-- FINAL final: _qms_touch_row must bootstrap profiles with a non-empty display_name

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = '_qms_touch_row'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE FUNCTION public._qms_touch_row(p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name text;
BEGIN
  -- non-empty + trimmed, passes profiles_display_name_required
  v_display_name := 'huddle_' || left(replace(p_owner_id::text, '-', ''), 8);

  INSERT INTO public.profiles (id, created_at, display_name)
  VALUES (p_owner_id, now(), v_display_name)
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);

  INSERT INTO public.user_quotas (user_id)
  VALUES (p_owner_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public._qms_touch_row(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._qms_touch_row(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._qms_touch_row(uuid) TO service_role;
ALTER FUNCTION public._qms_touch_row(uuid) OWNER TO postgres;
