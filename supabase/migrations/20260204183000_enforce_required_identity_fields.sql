-- Enforce mandatory identity fields at the database layer.
-- Uses NOT VALID to avoid failing on legacy rows while enforcing for new/updated rows.

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_legal_name_required
  CHECK (legal_name IS NOT NULL AND btrim(legal_name) <> '')
  NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_required
  CHECK (display_name IS NOT NULL AND btrim(display_name) <> '')
  NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_required
  CHECK (phone IS NOT NULL AND btrim(phone) <> '')
  NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_e164_like
  CHECK (phone ~ '^\+[0-9]{7,15}$')
  NOT VALID;
