/**
 * Automatic change detection engine.
 *
 * The Live Monitor silently stores every fetched satellite frame into
 * `live_feeds` (with a scaled-down image_url). When a new frame arrives and
 * at least one baseline row exists, this module loads the most recent stored
 * frame as "before" and the fresh frame as "after", runs the region-aware
 * change analysis, and fires disaster alerts + email notifications when the
 * change is significant.
 *
 * Storage stays frugal: only the 3 most recent frames are kept (auto-cleanup).
 */
import { supabase } from './supabase';
import { saveDisasterAlert } from './live-feed';
import {
  detectChanges,
  extractGrayFromImageData,
} from './change-detection';
import { applyColormapToImageData } from './colormaps';
import { maskNoDataAsTransparent } from './live-colorize';
import type { AutoChangeReport, ColormapName } from './types';

export const AUTO_THRESHOLD = 25;
export const MAX_STORED_FRAMES = 3;

/**
 * Keeps only the last MAX_STORED_FRAMES rows, deleting the oldest ones so
 * stored frames never grow beyond ~1MB total (frugal by design).
 */
async function trimStoredFrames() {
  const { data } = await supabase
    .from('live_feeds')
    .select('id')
    .order('created_at', { ascending: true });
  if (!data || data.length <= MAX_STORED_FRAMES) return;
  const toDelete = data.slice(0, data.length - MAX_STORED_FRAMES);
  await supabase.from('live_feeds').delete().in('id', toDelete.map(r => r.id));
}

/**
 * Stores the fresh colorized frame for future baselines, then trims history
 * to the last MAX_STORED_FRAMES rows. `scaledUrl` is a downscaled PNG data
 * URL (~200KB) to stay well inside the Supabase free tier.
 */
export async function storeFrameForBaseline(payload: {
  source_name: string;
  layer_id: string;
  fetch_date: string;
  scaledUrl: string;
  region: string;
  bbox: string;
  colormap_applied: string;
  disaster_alert_fired: boolean;
  processing_time_ms?: number;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('live_feeds')
    .insert({
      source_name: payload.source_name,
      layer_id: payload.layer_id,
      fetch_date: payload.fetch_date,
      image_url: payload.scaledUrl,
      region: payload.region,
      bbox: payload.bbox,
      colormap_applied: payload.colormap_applied,
      disaster_alert_fired: payload.disaster_alert_fired,
      processing_time_ms: payload.processing_time_ms,
    })
    .select('fetch_date')
    .maybeSingle();
  if (error) {
    console.error('storeFrameForBaseline error:', error);
    return null;
  }
  await trimStoredFrames();
  return data?.fetch_date ?? null;
}

/**
 * Returns the most recent stored frame row (the automatic "before" image),
 * or null when no baseline exists yet (very first pipeline run).
 */
export async function fetchBaselineFrame(): Promise<{
  id: string;
  fetch_date: string;
  image_url: string;
} | null> {
  const { data } = await supabase
    .from('live_feeds')
    .select('id, fetch_date, image_url')
    .neq('image_url', '')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !data.image_url) return null;
  return data as { id: string; fetch_date: string; image_url: string };
}

/** Loads an image from a URL/data URL into ImageData at natural size. */
function loadImageFromUrl(src: string): Promise<{ imageData: ImageData; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ imageData, width: canvas.width, height: canvas.height });
    };
    img.onerror = () => reject(new Error('Failed to load frame image'));
    img.src = src;
  });
}

/**
 * Converts a stored data URL into gray pixel arrays. The stored frame is
 * re-colorized with the current colormap so both frames are compared on the
 * same thermal scale before gray extraction.
 */
async function frameToArrays(
  dataUrl: string,
  colormap: ColormapName,
  intensity: number
): Promise<{ gray: Uint8Array; rgba: Uint8Array; width: number; height: number } | null> {
  try {
    const raw = await loadImageFromUrl(dataUrl);
    const recolorized = applyColormapToImageData(raw.imageData, colormap, intensity);
    maskNoDataAsTransparent(raw.imageData, recolorized);
    return {
      gray: extractGrayFromImageData(recolorized),
      rgba: new Uint8Array(recolorized.data.buffer, recolorized.data.byteOffset, recolorized.data.byteLength),
      width: raw.width,
      height: raw.height,
    };
  } catch (err) {
    console.error('frameToArrays error:', err);
    return null;
  }
}

/**
 * Runs the automatic before-vs-after comparison against the stored baseline.
 * Returns null until a baseline frame has been stored (very first run).
 */
export async function runAutoChangeDetection(
  freshFrame: { dataUrl: string; date: string; colormap: ColormapName; intensity: number },
  threshold = AUTO_THRESHOLD
): Promise<AutoChangeReport | null> {
  const baseline = await fetchBaselineFrame();
  if (!baseline) return null;

  const before = await frameToArrays(baseline.image_url, freshFrame.colormap, freshFrame.intensity);
  const after = await frameToArrays(freshFrame.dataUrl, freshFrame.colormap, freshFrame.intensity);
  if (!before || !after) return null;

  const w = Math.min(before.width, after.width);
  const h = Math.min(before.height, after.height);

  const result = detectChanges(
    {
      beforeData: before.gray,
      afterData: after.gray,
      beforeRgba: Uint8Array.from(before.rgba),
      afterRgba: Uint8Array.from(after.rgba),
      width: w,
      height: h,
    },
    threshold
  );

  // Fire an alert (and email for high/critical) when the change is real.
  if (result.severity === 'High' || result.severity === 'Critical') {
    const wz = result.region?.worstZone;
    const regionMsg = wz
      ? ` — worst affected zone: ${wz.name} (${wz.bbox.x0},${wz.bbox.y0})→(${wz.bbox.x1},${wz.bbox.y1}), ${wz.changePercent}% of zone pixels changed (intensity ${wz.intensity}/255)`
      : '';
    await saveDisasterAlert(
      null,
      `AUTO: ${result.severity} change vs baseline ${baseline.fetch_date}: ${result.affectedAreaPercent.toFixed(1)}% of area affected${regionMsg}`,
      result.severity.toLowerCase()
    );
  }

  return { baselineDate: baseline.fetch_date, currentDate: freshFrame.date, result } as AutoChangeReport;
}

/**
 * Returns a downscaled copy of a data URL (~512px wide) so stored baselines
 * stay ~200KB each instead of megabytes.
 */
export async function scaleDataUrl(dataUrl: string, maxSide = 512): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('scaleDataUrl: load failed'));
      i.src = dataUrl;
    });
    const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    // Fall back to the original if scaling fails (still acceptable).
    return dataUrl;
  }
}
