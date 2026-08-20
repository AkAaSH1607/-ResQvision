/**
 * Disaster Progression / Prediction Engine — fully client-side (₹0 cost).
 *
 * Builds a time series of affected-zone observations (T0 → T1 → T2 …) and
 * extrapolates where the affected area is headed next (predicted T3).
 *
 * Model (trend extrapolation, same idea weather services use for storm
 * tracks but without the GPU):
 *   1. Collect the worst-zone centroid + change% from the last 3 scans.
 *   2. Fit pixel velocity  v = (pos2 - pos1) per scan and growth rate g.
 *   3. Project one step ahead:  pos3 = pos2 + v,  pct3 = pct2 + g.
 *   4. Convert the predicted pixel window to lat/lon (equirectangular map
 *      of the frame bbox) and reverse-geocode it to a local area name
 *      ("may expand toward Anna Nagar, Chennai (North-East)").
 *
 * Needs only 2+ observations; with fewer it reports "insufficient data".
 * Confidence drops when trend direction flips between steps.
 */

import { parseBBox, zoneCenterGeo, reverseGeocode } from './geo-utils';
import type { ZoneStats } from './types';

/** One observation in the progression time series. */
export interface ProgressionSample {
  timestamp: number;           // epoch ms of the scan
  worstZoneName: string;       // e.g. "South-Central (S)"
  worstChangePercent: number;  // zone change % at that time
  worstIntensity: number;      // worst-zone change intensity
  centroid: { x: number; y: number }; // worst-zone centroid in frame px
  zoneBbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface PredictionResult {
  available: boolean;          // enough samples to predict
  direction: string;           // compass direction, e.g. "North-East"
  speedKmh: number;            // projected expansion speed, km/h (from pixel motion)
  predictedChangePercent: number; // extrapolated zone change %
  trend: 'expanding' | 'stable' | 'shrinking';
  confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'INSUFFICIENT_DATA';
  summary: string;             // human-readable projection sentence
  predictedZoneName: string | null; // local area name near the predicted centroid
  samples: number;             // how many observations were used
  /** Predicted worst-zone bbox in frame pixels (for the dashed overlay). */
  predictedBbox: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Lat/lon of the predicted centroid. */
  predictedGeo: { lat: number; lon: number } | null;
}

/** Average MODIS Terra pixel footprint used to convert px motion → km/h. */
const METERS_PER_PIXEL = 4000;

/**
 * Records a scan observation from a finished change-detection result.
 * Stored per-site in localStorage (frugal — no server writes).
 */
export function recordScan(params: {
  worstZone: ZoneStats | null;
  width: number;
  height: number;
}): void {
  if (!params.worstZone) return;
  const list = readSamples();
  const sample: ProgressionSample = {
    timestamp: Date.now(),
    worstZoneName: params.worstZone.name,
    worstChangePercent: params.worstZone.changePercent,
    worstIntensity: params.worstZone.intensity,
    centroid: {
      x: (params.worstZone.bbox.x0 + params.worstZone.bbox.x1) / 2,
      y: (params.worstZone.bbox.y0 + params.worstZone.bbox.y1) / 2,
    },
    zoneBbox: params.worstZone.bbox,
  };
  list.push(sample);
  // Keep the last 5 observations (older ones no longer help trend fitting).
  list.sort((a, b) => a.timestamp - b.timestamp);
  if (list.length > 5) list.splice(0, list.length - 5);
  try {
    localStorage.setItem('resqvision-progression', JSON.stringify(list));
  } catch { /* storage unavailable — prediction gracefully skips */ }
}

export function readSamples(): ProgressionSample[] {
  try {
    const raw = localStorage.getItem('resqvision-progression');
    if (!raw) return [];
    const list = JSON.parse(raw) as ProgressionSample[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearProgressionHistory(): void {
  localStorage.removeItem('resqvision-progression');
}

const COMPASS: Array<[number, number, string]> = [
  [1, -1, 'North-East'], [-1, -1, 'North-West'],
  [1, 1, 'South-East'], [-1, 1, 'South-West'],
  [1, 0, 'East'], [-1, 0, 'West'], [0, -1, 'North'], [0, 1, 'South'],
];

function compassDir(dx: number, dy: number): string {
  const mag = Math.hypot(dx, dy);
  if (mag < 1e-6) return 'No movement (contained)';
  const nx = dx / mag;
  const ny = dy / mag;
  let best = COMPASS[0];
  let bestDot = -Infinity;
  for (const d of COMPASS) {
    const dot = d[0] * nx + d[1] * ny;
    if (dot > bestDot) { bestDot = dot; best = d; }
  }
  return best[2];
}

/**
 * Fits the progression from stored samples and extrapolates predicted T3.
 * The frame bbox + dimensions map pixel motion to real-world direction.
 */
export async function computePrediction(params: {
  bbox: string;
  width: number;
  height: number;
}): Promise<PredictionResult> {
  const samples = readSamples();
  if (samples.length < 2) {
    return {
      available: false,
      direction: 'Unknown',
      speedKmh: 0,
      predictedChangePercent: 0,
      trend: 'stable',
      confidence: 'INSUFFICIENT_DATA',
      summary: 'Progression tracking starts from the next scan. Run 2 more automatic scans to build the T0→T1→T2 timeline.',
      predictedZoneName: null,
      samples: samples.length,
      predictedBbox: null,
      predictedGeo: null,
    };
  }

  const geo = parseBBox(params.bbox);
  const recent = samples.slice(-3);
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];

  // ---- Velocity between the two most recent scans ----
  const dx = last.centroid.x - prev.centroid.x; // px
  const dy = last.centroid.y - prev.centroid.y; // px (y grows downward)
  const dtH = Math.max(1 / 3600, (last.timestamp - prev.timestamp) / 3600000);

  // ---- Percentage growth rate (per hour) ----
  const dpct = last.worstChangePercent - prev.worstChangePercent;
  const growthPerHour = dpct / dtH;

  // Project one scan ahead (typical scan gap ~30 min).
  const aheadH = 0.5;
  const projX = last.centroid.x + (dx / dtH) * aheadH;
  const projY = last.centroid.y + (dy / dtH) * aheadH;
  const projPct = last.worstChangePercent + growthPerHour * aheadH;

  const trend = projPct >= last.worstChangePercent + 1 ? 'expanding'
    : projPct <= last.worstChangePercent - 1 ? 'shrinking' : 'stable';

  // Confidence: drops when the two step-directions disagree.
  let stepDirPrev: string | null = null;
  if (recent.length >= 3) {
    const a = recent[0];
    stepDirPrev = compassDir(a.centroid.x - recent[1].centroid.x, a.centroid.y - recent[1].centroid.y);
  }
  const stepDirLast = compassDir(dx, dy);
  const dirMatches = stepDirPrev === null || stepDirPrev === stepDirLast;
  const confidence = recent.length >= 3 && dirMatches ? 'HIGH'
    : recent.length >= 3 ? 'MODERATE' : 'LOW';

  // Predicted bbox: keep the same zone size, shift by motion vector.
  const bw = last.zoneBbox.x1 - last.zoneBbox.x0;
  const bh = last.zoneBbox.y1 - last.zoneBbox.y0;
  const predictedBbox = {
    x0: projX - bw / 2, y0: projY - bh / 2,
    x1: projX + bw / 2, y1: projY + bh / 2,
  };

  let predictedGeo = null;
  let predictedZoneName = null;
  if (geo) {
    const cx = (last.zoneBbox.x0 + last.zoneBbox.x1) / 2;
    const cy = (last.zoneBbox.y0 + last.zoneBbox.y1) / 2;
    predictedGeo = zoneCenterGeo(geo,
      { x0: projX - (bw / 4), y0: projY - (bh / 4), x1: projX + (bw / 4), y1: projY + (bh / 4) },
      params.width, params.height);
    predictedZoneName = await reverseGeocode(predictedGeo.lat, predictedGeo.lon);
    void cx; void cy;
  }

  // ---- Speed in km/h from pixel motion ----
  const pxPerHour = Math.hypot(dx, dy) / dtH;
  const speedKmh = Math.round((pxPerHour * METERS_PER_PIXEL) / 1000 * 10) / 10;

  const dir = compassDir(dx, dy);
  const pctClamped = Math.max(0, Math.min(100, projPct));
  const zone = last.worstZoneName;
  const zoneGeo = geo
    ? zoneCenterGeo(geo, last.zoneBbox, params.width, params.height)
    : null;
  const currentLocal = zoneGeo
    ? await reverseGeocode(zoneGeo.lat, zoneGeo.lon)
    : null;
  const fromLabel = currentLocal ? `${currentLocal} (${zone})` : zone;
  const toLabel = predictedZoneName ?? (predictedGeo
    ? `${predictedGeo.lat.toFixed(2)}°N, ${predictedGeo.lon.toFixed(2)}°E`
    : 'predicted zone');

  const summary = trend === 'stable'
    ? `Affected area around ${fromLabel} appears stable — no significant expansion detected in the last ${recent.length} scans.`
    : `Based on the observed progression, the affected area around ${fromLabel} may expand toward ${toLabel} (${dir}) at ~${speedKmh} km/h, reaching ~${pctClamped.toFixed(1)}% zone change in the next pass.`;

  return {
    available: true,
    direction: dir,
    speedKmh,
    predictedChangePercent: Math.round(pctClamped * 10) / 10,
    trend,
    confidence,
    summary,
    predictedZoneName,
    samples: recent.length,
    predictedBbox,
    predictedGeo,
  };
}
