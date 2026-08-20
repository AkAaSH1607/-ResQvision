/*
# Add Live Satellite Feed Monitoring Table

## Overview
Adds the `live_feeds` table to store auto-fetched satellite imagery snapshots from
NASA GIBS data sources. Used by the Live Monitor feature which fetches 
real-time IR satellite data for India and runs automatic change detection.

## New Tables

### `live_feeds`
Each row represents one automatic satellite data fetch.
- `id` — UUID primary key
- `created_at` — when this fetch was performed
- `source_name` — human-readable data source (e.g. 'MODIS Terra LST', 'VIIRS SNPP')
- `layer_id` — NASA GIBS layer identifier
- `fetch_date` — the satellite data date (may lag 1-2 days behind real time)
- `image_url` — the constructed GIBS WMS URL for this fetch
- `region` — region covered (e.g. 'India', 'Bay of Bengal')
- `bbox` — bounding box used: "lat_min,lon_min,lat_max,lon_max"
- `colormap_applied` — which colormap was applied to the fetched image
- `cloud_coverage` — computed cloud coverage %
- `weather_condition` — detected weather
- `ndvi` — vegetation index
- `water_bodies_percent` — detected water %
- `urban_heat_percent` — detected urban heat %
- `change_from_previous` — % pixel change vs previous fetch (for disaster detection)
- `disaster_alert_fired` — boolean: did this fetch trigger a disaster alert?
- `alert_message` — auto-generated alert message if disaster detected
- `processing_time_ms` — how long analysis took

## Security
- RLS enabled; open to anon+authenticated (no-auth public app)
*/

CREATE TABLE IF NOT EXISTS live_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  source_name text NOT NULL DEFAULT 'MODIS Terra LST',
  layer_id text NOT NULL DEFAULT 'MODIS_Terra_Land_Surface_Temp_Day',
  fetch_date date NOT NULL DEFAULT CURRENT_DATE,
  image_url text,
  region text NOT NULL DEFAULT 'India',
  bbox text NOT NULL DEFAULT '8,68,37,98',
  colormap_applied text DEFAULT 'INFERNO',
  cloud_coverage float,
  weather_condition text,
  ndvi float,
  water_bodies_percent float,
  urban_heat_percent float,
  change_from_previous float,
  disaster_alert_fired boolean NOT NULL DEFAULT false,
  alert_message text,
  processing_time_ms int
);

ALTER TABLE live_feeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_live_feeds" ON live_feeds;
CREATE POLICY "anon_select_live_feeds" ON live_feeds FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_live_feeds" ON live_feeds;
CREATE POLICY "anon_insert_live_feeds" ON live_feeds FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_live_feeds" ON live_feeds;
CREATE POLICY "anon_update_live_feeds" ON live_feeds FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_live_feeds" ON live_feeds;
CREATE POLICY "anon_delete_live_feeds" ON live_feeds FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_live_feeds_created_at ON live_feeds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_feeds_layer_id ON live_feeds(layer_id);
CREATE INDEX IF NOT EXISTS idx_live_feeds_disaster ON live_feeds(disaster_alert_fired);
