-- Add archive fields for verification_uploads and normalize status values.

ALTER TABLE public.verification_uploads
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

-- Allow archived status in verification_uploads.status check constraint.
ALTER TABLE public.verification_uploads
  DROP CONSTRAINT IF EXISTS verification_uploads_status_check;

ALTER TABLE public.verification_uploads
  ADD CONSTRAINT verification_uploads_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'archived'::text]));

-- ROLLBACK (manual):
-- ALTER TABLE public.verification_uploads DROP COLUMN IF EXISTS archived_at;
-- ALTER TABLE public.verification_uploads DROP COLUMN IF EXISTS archived_by;
-- ALTER TABLE public.verification_uploads DROP CONSTRAINT IF EXISTS verification_uploads_status_check;
-- ALTER TABLE public.verification_uploads ADD CONSTRAINT verification_uploads_status_check
--   CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
