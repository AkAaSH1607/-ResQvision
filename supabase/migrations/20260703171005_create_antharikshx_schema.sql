/*
# AntharikshX IR Platform Schema

## Overview
Single-tenant schema (no auth) for the IR satellite image colorization and disaster analysis platform.
All data is publicly accessible via the anon key since this is a demo tool with no login.

## New Tables

### 1. `analyses`
Stores every image analysis performed on the platform.
- `id` — UUID primary key
- `created_at` — timestamp of analysis
- `image_name` — filename of the uploaded image
- `analysis_type` — 'colorization' | 'change_detection' | 'scene_analysis' | 'full'
- `colormap_used` — JET | TURBO | INFERNO | PLASMA
- `intensity_applied` — float 0.5–2.0
- `psnr` — Peak Signal-to-Noise Ratio (float)
- `ssim` — Structural Similarity Index (float 0–1)
- `fid_score` — simulated Fréchet Inception Distance (float)
- `cloud_coverage` — cloud coverage percentage (float 0–100)
- `weather_condition` — 'Clear' | 'Partly Cloudy' | 'Overcast' | 'Storm'
- `ndvi` — vegetation index float (-1 to 1)
- `water_bodies_percent` — float 0–100
- `urban_heat_percent` — float 0–100
- `affected_area_percent` — float 0–100 (change detection)
- `change_severity` — 'None' | 'Low' | 'Moderate' | 'High' | 'Critical'
- `image_width` — pixel width
- `image_height` — pixel height
- `processing_time_ms` — milliseconds to process
- `satellite_type` — 'INSAT-3DS' | 'Landsat 8/9' | 'Sentinel-1' | 'Cartosat-3'
- `metadata` — JSONB for extra data

### 2. `alerts`
Stores anomaly alerts generated during analyses.
- `id` — UUID primary key
- `analysis_id` — FK to analyses
- `alert_type` — 'high_cloud' | 'heat_anomaly' | 'change_detected' | 'storm'
- `severity` — 'low' | 'medium' | 'high' | 'critical'
- `message` — human-readable alert message
- `is_dismissed` — boolean flag
- `created_at` — timestamp

## Security
- RLS enabled on all tables
- Policies open to `anon, authenticated` (no login required — public demo)
*/

CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  image_name text NOT NULL DEFAULT 'unknown.png',
  analysis_type text NOT NULL DEFAULT 'full',
  colormap_used text DEFAULT 'JET',
  intensity_applied float DEFAULT 1.0,
  psnr float,
  ssim float,
  fid_score float,
  cloud_coverage float,
  weather_condition text,
  ndvi float,
  water_bodies_percent float,
  urban_heat_percent float,
  affected_area_percent float,
  change_severity text DEFAULT 'None',
  image_width int,
  image_height int,
  processing_time_ms int,
  satellite_type text DEFAULT 'INSAT-3DS',
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_analyses" ON analyses;
CREATE POLICY "anon_select_analyses" ON analyses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_analyses" ON analyses;
CREATE POLICY "anon_insert_analyses" ON analyses FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_analyses" ON analyses;
CREATE POLICY "anon_update_analyses" ON analyses FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_analyses" ON analyses;
CREATE POLICY "anon_delete_analyses" ON analyses FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES analyses(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  message text NOT NULL,
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_alerts" ON alerts;
CREATE POLICY "anon_select_alerts" ON alerts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_alerts" ON alerts;
CREATE POLICY "anon_insert_alerts" ON alerts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_alerts" ON alerts;
CREATE POLICY "anon_update_alerts" ON alerts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_alerts" ON alerts;
CREATE POLICY "anon_delete_alerts" ON alerts FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_analysis_type ON analyses(analysis_type);
CREATE INDEX IF NOT EXISTS idx_alerts_analysis_id ON alerts(analysis_id);
CREATE INDEX IF NOT EXISTS idx_alerts_is_dismissed ON alerts(is_dismissed);
