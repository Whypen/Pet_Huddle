-- Create profiles via auth trigger using signup metadata
-- FIXED: Do not overwrite social_id on conflict

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name text;
  v_legal_name text;
  v_phone text;
  v_social_id text;
BEGIN
  IF NEW.raw_user_meta_data IS NULL THEN
    RAISE EXCEPTION 'Missing signup metadata';
  END IF;

  v_display_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
    'User'
  );

  v_legal_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'legal_name'), ''),
    v_display_name
  );

  v_phone := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, '')), '');

  -- REQUIRED: social_id must never be NULL
  v_social_id := NULLIF(BTRIM(LOWER(COALESCE(NEW.raw_user_meta_data->>'social_id', ''))), '');
  IF v_social_id IS NULL THEN
    v_social_id := 'u' || SUBSTR(REPLACE(NEW.id::TEXT, '-', ''), 1, 10);
  END IF;

  INSERT INTO public.profiles (
    id,
    display_name,
    legal_name,
    phone,
    dob,
    social_id,
    verification_status,
    is_verified,
    onboarding_completed
  )
  VALUES (
    NEW.id,
    v_display_name,
    v_legal_name,
    v_phone,
    (NEW.raw_user_meta_data->>'dob')::date,
    v_social_id,
    'not_submitted',
    false,
    false
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        legal_name = EXCLUDED.legal_name,
        phone = EXCLUDED.phone,
        dob = EXCLUDED.dob;
    -- NOTE: social_id is NOT updated on conflict to prevent overwrites

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
