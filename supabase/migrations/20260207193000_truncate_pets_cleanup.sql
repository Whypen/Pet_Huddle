-- One-time data cleanup per requirement:
-- Execute TRUNCATE pets; to remove all pre-loaded/fake pet profiles.
-- Note: pets is referenced by foreign keys; CASCADE is required for TRUNCATE to succeed.
truncate table public.pets cascade;

