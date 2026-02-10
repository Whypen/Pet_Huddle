-- Monthly Overpass Harvest: poi_locations table + pg_cron Job
-- Triggers the overpass-harvest Edge Function on the 1st of every month at 00:00 UTC
-- This replaces per-user live Overpass API calls with a single monthly batch harvest

-- 1. Create poi_locations table for Overpass harvest cache
CREATE TABLE IF NOT EXISTS poi_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  osm_id TEXT UNIQUE NOT NULL,
  poi_type TEXT NOT NULL CHECK (poi_type IN ('veterinary', 'pet_shop', 'pet_grooming')),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  phone TEXT,
  opening_hours TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  last_harvested_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE poi_locations ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read POI locations
CREATE POLICY "Anyone can read active poi_locations"
  ON poi_locations FOR SELECT
  USING (is_active = true);

-- Also allow anon to read (for unauthenticated map views)
CREATE POLICY "Anon can read active poi_locations"
  ON poi_locations FOR SELECT TO anon
  USING (is_active = true);

-- Service role can do everything (for Edge Function upserts)
CREATE POLICY "Service role full access poi_locations"
  ON poi_locations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Indexes for fast cache reads
CREATE INDEX IF NOT EXISTS idx_poi_locations_type_active ON poi_locations (poi_type, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_poi_locations_osm_id ON poi_locations (osm_id);

-- 2. Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- 3. Schedule the monthly harvest job
-- Runs at 00:00 UTC on the 1st of every month
SELECT cron.schedule(
  'monthly-overpass-harvest',
  '0 0 1 * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/overpass-harvest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
