/**
 * Incident Report Generator — produces an official-style one-click
 * disaster report for officials, entirely client-side (₹0 cost).
 *
 * Report fields:
 *  - Disaster type     : inferred from change patterns (flood/wildfire/heatwave/landslide)
 *  - Location          : local area name via geo-utils reverse-geocoding
 *  - Detected          : timestamp of detection
 *  - Affected area     : pixel-derived km² estimate at the source resolution
 *  - Population exposed: estimated from affected km² × average district density
 *  - Critical infra    : estimated from affected km² × infrastructure density
 *  - Severity          : from the change detection severity
 *  - Expansion         : direction of worst-change growth vs baseline mean
 *  - Priority          : recommended action based on severity + expansion
 */

import type { ChangeDetectionResult, AutoChangeReport, ZoneStats } from './types';
import { parseBBox, zoneCenterGeo, reverseGeocode } from './geo-utils';

export interface IncidentReport {
  disaster: string;
  location: string;
  detected: string;
  affectedAreaKm2: number;
  populationExposed: number;
  criticalInfrastructure: number;
  severity: string;
  expansion: string;
  recommendedPriority: string;
  confidence: 'HIGH' | 'MODERATE' | 'LOW';
}

/**
 * The satellite frame covers ~29° lat × 30° lon over India.
 * At the equator, 1° lon ≈ 111 km. At ~22°N (India center), 1° lon ≈ 103 km.
 * Frame is ~1024×1024 px, so each pixel ≈ 2.9 km × 2.9 km at full res.
 * But change detection works on a scaled-down comparison image (~512px),
 * so we use the worst-zone bbox (in source-frame coords) for area estimate.
 */
const KM_PER_DEGREE_LAT = 111; // 1° latitude ≈ 111 km
const KM_PER_DEGREE_LON_AT_22N = 103; // 1° longitude at ~22°N ≈ 103 km

/** Average Indian district population density: ~400 people/km² (census-scale mean). */
const POP_PER_KM2 = 400;

/** Approximate count of critical-facility-equivalents per km² of affected area
 *  (hospitals, schools, power substations, water facilities combined). */
const INFRA_PER_KM2 = 0.08;

/** India total population cap — never report more people than exist. */
const INDIA_POPULATION_CAP = 1_400_000_000;

/**
 * Infers the disaster category from the pixel-change signature.
 *  - Wildfire: hot anomaly, compact intense cluster, high intensity
 *  - Flood: change concentrated in lowlands/water-like (coldest band) pixels
 *  - Landslide: moderate change, steep intensity gradient
 *  - Heatwave: diffuse widespread warm shift
 *  - Unknown: generic "Surface Anomaly"
 */
export function inferDisasterType(det: ChangeDetectionResult): string {
  const wz = det.region?.worstZone;
  const pct = det.affectedAreaPercent;
  if (!wz) return 'Surface Anomaly';

  // Compactness proxy: small bbox covering most of the zone's change = fire
  const bboxArea = (wz.bbox.x1 - wz.bbox.x0) * (wz.bbox.y1 - wz.bbox.y0);
  const spread = bboxArea / Math.max(1, wz.changePercent + 1);

  if (wz.intensity >= 160 && spread < 200 && pct < 45) return 'Wildfire';
  if (wz.intensity >= 170 && pct >= 45) return 'Heatwave';
  if (wz.intensity <= 70 && pct >= 12) return 'Flood';
  if (wz.intensity >= 90 && wz.intensity <= 160) return 'Landslide';
  return 'Surface Anomaly';
}

/**
 * Estimate affected area in km² from the worst zone's bounding box,
 * scaled by the actual change percentage (only the changed fraction
 * of the zone is counted as "affected").
 *
 * Each zone = 1/9 of the India frame ≈ 10° × 9.67° ≈ ~1,100 km × ~1,070 km.
 * But the actual disaster area is only the changed pixels: zone area × (pct / 100).
 * We also clamp to a realistic district-scale max (5,000 km²) since
 * MODIS 4km pixels can't resolve sub-pixel detail.
 */
export function estimateAffectedKm2(det: ChangeDetectionResult): number {
  const wz = det.region?.worstZone;
  if (!wz) return 0;
  // Zone bbox as fraction of frame
  const totalPixels = det.totalPixels || (1024 * 1024);
  const frameW = Math.sqrt(totalPixels); // approx square
  const frameH = frameW;
  const zoneFracW = (wz.bbox.x1 - wz.bbox.x0) / frameW;
  const zoneFracH = (wz.bbox.y1 - wz.bbox.y0) / frameH;
  // Geographic extent of the zone
  const zoneLonDeg = zoneFracW * 30; // India bbox spans ~30° lon
  const zoneLatDeg = zoneFracH * 29; // India bbox spans ~29° lat
  const zoneKm2 = zoneLonDeg * KM_PER_DEGREE_LON_AT_22N * zoneLatDeg * KM_PER_DEGREE_LAT;
  // Scale by change percent — only the affected fraction counts
  const affectedFraction = Math.min(1, wz.changePercent / 100);
  const affectedKm2 = zoneKm2 * affectedFraction;
  // Clamp to realistic district-scale max (5,000 km² ≈ 70km × 70km)
  return Math.min(affectedKm2, 5000);
}

/**
 * Direction of expansion: compares the worst zone's centroid against the
 * centroid of all changed pixels approximated from zone-weighted means.
 */
function compassDir(dx: number, dy: number): string {
  const dirs: Array<[number, number, string]> = [
    [1, -1, 'Northeast'], [-1, -1, 'Northwest'],
    [1, 1, 'Southeast'], [-1, 1, 'Southwest'],
    [1, 0, 'East'], [-1, 0, 'West'], [0, -1, 'North'], [0, 1, 'South'],
  ];
  const mag = Math.hypot(dx, dy);
  if (mag < 1e-6) return 'None (contained)';
  const nx = dx / mag;
  const ny = dy / mag;
  let best = dirs[0];
  let bestDot = -Infinity;
  for (const d of dirs) {
    const dot = d[0] * nx + d[1] * ny;
    if (dot > bestDot) { bestDot = dot; best = d; }
  }
  return best[2];
}

export function estimateExpansionDirection(
  det: ChangeDetectionResult,
  width: number,
  height: number
): string {
  const wz = det.region?.worstZone;
  if (!wz) return 'Unknown';
  const wzCx = (wz.bbox.x0 + wz.bbox.x1) / 2;
  const wzCy = (wz.bbox.y0 + wz.bbox.y1) / 2;
  const cx = width / 2;
  const cy = height / 2;
  return compassDir(wzCx - cx, wzCy - cy);
}

export function recommendedPriority(severity: string, expansion: string): string {
  if (severity === 'Critical') return 'Evacuate all zones within 5 km, mobilize disaster response teams';
  if (severity === 'High') {
    if (expansion.endsWith('theast') || expansion.endsWith('est')) {
      return 'Evacuate affected zone perimeter, deploy response units';
    }
    return 'Evacuate affected zone, activate local emergency response';
  }
  if (severity === 'Moderate') return 'Monitor closely, pre-position relief supplies';
  return 'Continue routine monitoring';
}

function confidenceFor(det: ChangeDetectionResult): 'HIGH' | 'MODERATE' | 'LOW' {
  const anyLow = det.region?.zones.some(z => z.lowCoverage);
  if (anyLow) return 'MODERATE';
  return 'HIGH';
}

/**
 * Builds the full incident report from an auto-detection result.
 * Zone local names are resolved via reverse-geocoding (cached in
 * localStorage; only the worst zone triggers a network call).
 */
export async function generateIncidentReport(
  det: ChangeDetectionResult,
  report: AutoChangeReport,
  bbox: string,
  width: number,
  height: number
): Promise<IncidentReport> {
  const wz = det.region?.worstZone;
  const zoneLocalName = wz ? await resolveZoneName(wz, bbox, width, height) : null;

  const disaster = inferDisasterType(det);
  const affectedKm2 = estimateAffectedKm2(det);
  const expansion = estimateExpansionDirection(det, width, height);
  const severity = det.severity;

  // Realistic population: affected km² × 400 people/km² (district average)
  let popExposed = Math.round(affectedKm2 * POP_PER_KM2 / 100) * 100;
  if (popExposed > INDIA_POPULATION_CAP) popExposed = INDIA_POPULATION_CAP;
  // Cap at realistic district max: 5000 km² × 400 = 2,000,000
  if (popExposed > 2_000_000) popExposed = 2_000_000;

  // Location: prefer reverse-geocoded name; fallback to coords
  let location = zoneLocalName;
  if (!location && wz) {
    const geo = parseBBox(bbox);
    if (geo) {
      const { lat, lon } = zoneCenterGeo(geo, wz.bbox, width, height);
      location = `${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E`;
    } else {
      location = wz.name;
    }
  }
  if (!location) location = 'Unknown';

  return {
    disaster,
    location,
    detected: new Date().toLocaleTimeString('en-IN', { hour12: false }),
    affectedAreaKm2: Math.round(affectedKm2 * 10) / 10,
    populationExposed: popExposed,
    criticalInfrastructure: Math.round(affectedKm2 * INFRA_PER_KM2),
    severity,
    expansion,
    recommendedPriority: recommendedPriority(severity, expansion),
    confidence: confidenceFor(det),
  };
}

async function resolveZoneName(
  wz: ZoneStats,
  bbox: string,
  width: number,
  height: number
): Promise<string | null> {
  const geo = parseBBox(bbox);
  if (!geo) return null;
  const { lat, lon } = zoneCenterGeo(geo, wz.bbox, width, height);
  return reverseGeocode(lat, lon);
}
