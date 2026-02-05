ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS verification_document_url TEXT;
