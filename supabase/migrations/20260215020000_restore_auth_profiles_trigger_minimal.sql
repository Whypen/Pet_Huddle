-- Restore auth.users -> profiles trigger for guaranteed profile creation.
-- NOTE: profiles has required-field constraints, so we populate minimal required fields.

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
  IF v_phone IS NULL THEN
    v_phone := '+0000000000';
  END IF;

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
    'unverified'::public.verification_status_enum,
    false,
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- ROLLBACK (manual):
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
