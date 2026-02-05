-- V21: verification schema hardening + storage bucket bootstrap

-- 1) ENUM type for verification_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'verification_status_enum'
  ) THEN
    CREATE TYPE public.verification_status_enum AS ENUM (
      'not_submitted',
      'pending',
      'approved',
      'rejected'
    );
  END IF;
END $$;

-- 2) Required column for uploaded verification document URL
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_document_url TEXT;

-- 3) Convert verification_status column from text -> enum safely
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status_tmp public.verification_status_enum
  DEFAULT 'not_submitted';

UPDATE public.profiles
SET verification_status_tmp = CASE
  WHEN verification_status IN ('pending', 'approved', 'rejected', 'not_submitted')
    THEN verification_status::public.verification_status_enum
  ELSE 'not_submitted'::public.verification_status_enum
END;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS verification_status;

ALTER TABLE public.profiles
  RENAME COLUMN verification_status_tmp TO verification_status;

ALTER TABLE public.profiles
  ALTER COLUMN verification_status SET DEFAULT 'not_submitted';

-- 4) Ensure verification storage bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification',
  'verification',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 5) Restrict verification object access to owner + service role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'verification_bucket_select_own'
  ) THEN
    CREATE POLICY verification_bucket_select_own
      ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'verification'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'verification_bucket_insert_own'
  ) THEN
    CREATE POLICY verification_bucket_insert_own
      ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'verification'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'verification_bucket_update_own'
  ) THEN
    CREATE POLICY verification_bucket_update_own
      ON storage.objects
      FOR UPDATE
      USING (
        bucket_id = 'verification'
        AND auth.uid()::text = (storage.foldername(name))[1]
      )
      WITH CHECK (
        bucket_id = 'verification'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'verification_bucket_delete_own'
  ) THEN
    CREATE POLICY verification_bucket_delete_own
      ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'verification'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;
