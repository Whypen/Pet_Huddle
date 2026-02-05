-- Ensure auto profile creation satisfies mandatory identity requirements.
-- This aligns auth signup with profiles constraints.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_display_name text;
  v_legal_name text;
  v_phone text;
BEGIN
  v_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email);
  v_legal_name := COALESCE(
    NEW.raw_user_meta_data->>'legal_name',
    NEW.raw_user_meta_data->>'display_name',
    NEW.email
  );
  v_phone := NEW.raw_user_meta_data->>'phone';

  INSERT INTO public.profiles (id, display_name, legal_name, phone)
  VALUES (NEW.id, v_display_name, v_legal_name, v_phone);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
