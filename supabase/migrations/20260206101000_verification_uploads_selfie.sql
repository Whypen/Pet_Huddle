-- Extend verification_uploads for selfie + country and doc type expansion
ALTER TABLE public.verification_uploads
  ADD COLUMN IF NOT EXISTS selfie_url TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'verification_uploads_document_type_check'
  ) THEN
    ALTER TABLE public.verification_uploads DROP CONSTRAINT verification_uploads_document_type_check;
  END IF;
END $$;

ALTER TABLE public.verification_uploads
  ADD CONSTRAINT verification_uploads_document_type_check
  CHECK (document_type IN ('passport', 'id_card', 'drivers_license'));
