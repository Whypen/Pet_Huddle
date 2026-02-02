-- TRUNCATE TABLES FOR FRESH TESTING
-- This will clear all user data for a clean testing slate

TRUNCATE TABLE profiles, pets, emergency_logs, triage_cache, scan_rate_limits,
                hazard_identifications, notification_logs, lost_pet_alerts CASCADE;

COMMENT ON TABLE profiles IS 'Truncated for fresh testing - 2026-02-02';
