-- Remove any preloaded/fake pet profiles per SPEC
-- NOTE: TRUNCATE fails when foreign keys reference pets (e.g., ai_vet_conversations).
-- A DELETE achieves the same cleanup while respecting ON DELETE actions.
delete from public.pets;
