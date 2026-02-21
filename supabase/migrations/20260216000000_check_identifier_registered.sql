-- RPC: Check if email or phone is already registered
-- Used by signup flow to detect duplicates before attempting registration
-- Accessible to anonymous users (pre-signup check)

CREATE OR REPLACE FUNCTION public.check_identifier_registered(
  p_email TEXT,
  p_phone TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_exists BOOLEAN := false;
  v_phone_exists BOOLEAN := false;
  v_field TEXT := null;
BEGIN
  -- Check email in auth.users
  IF p_email IS NOT NULL AND p_email != '' THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE email = p_email
    ) INTO v_email_exists;
  END IF;

  -- Check phone in auth.users
  IF p_phone IS NOT NULL AND p_phone != '' THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE phone = p_phone
    ) INTO v_phone_exists;
  END IF;

  -- Determine which field is registered (prioritize email if both)
  IF v_email_exists THEN
    v_field := 'email';
  ELSIF v_phone_exists THEN
    v_field := 'phone';
  END IF;

  RETURN jsonb_build_object(
    'registered', (v_email_exists OR v_phone_exists),
    'field', v_field
  );
END;
$$;

-- Grant execute to anon (pre-signup) and authenticated users
GRANT EXECUTE ON FUNCTION public.check_identifier_registered(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.check_identifier_registered IS 'Checks if email or phone is already registered. Returns {registered: boolean, field: "email"|"phone"|null}';
