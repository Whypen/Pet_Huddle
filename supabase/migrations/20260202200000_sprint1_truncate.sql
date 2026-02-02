-- SPRINT 1: Database Truncation for Fresh Testing
-- Clears all user data with CASCADE to related tables

TRUNCATE TABLE profiles, pets, emergency_logs, triage_cache, scan_rate_limits,
                hazard_identifications, notification_logs, lost_pet_alerts CASCADE;

COMMENT ON TABLE profiles IS 'Truncated for Sprint 1 - Fresh testing slate';
