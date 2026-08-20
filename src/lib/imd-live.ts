import { applyColormapToImageData } from './colormaps';
import type { ColormapName } from './types';
import type { ColorizedFrame } from './live-colorize';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Trim amounts (% of raw image) to cut from each edge of the source image. */
export interface CropSelection {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Fallback target bounds, used only until you click "Lock overlay to
// current map view" — after that, your real framed map view takes over
// and this default is never used again for that session.
export const DEFAULT_IMD_MAP_BOUNDS: [[number, number], [number, number]] = [
  [5, 65],   // [south, west]
  [38, 100], // [north, east]
];

// Default IMD calibration values used by the live monitor controls.
export const DEFAULT_IMD_CENTER = { lat: 22.5, lon: 80.5 } as const;
export const DEFAULT_IMD_SPAN_LON = 40;
export const DEFAULT_IMD_CROP_PCT = 10;

// Trim just IMD's title/legend header off the top by default.
export const DEFAULT_CROP: CropSelection = { top: 10, bottom: 0, left: 0, right: 0 };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load IMD frame from proxy'));
    img.src = src;
  });
}

/** Fetches the raw IMD frame once. Cache this and reuse for instant slider re-renders. */
export async function fetchIMDRawImage(): Promise<HTMLImageElement> {
  const url = `${SUPABASE_URL}/functions/v1/imd-proxy`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(`IMD proxy error: ${err.error ?? `HTTP ${res.status}`}`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  return loadImage(objectUrl);
}

export async function fetchIMDRawImageUrl(): Promise<string> {
  const url = `${SUPABASE_URL}/functions/v1/imd-proxy`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(`IMD proxy error: ${err.error ?? `HTTP ${res.status}`}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Trims the raw IMD frame per `crop` (% to cut from each edge) and
 * colorizes it. The TARGET position on the map is whatever you framed on
 * the real, always-correct base map and locked in via "Lock overlay to
 * current map view" (plain Leaflet bounds, captured separately — not
 * computed here). This function's only job is picking the right slice of
 * source pixels to fill that already-correct box; no projection math, so
 * nothing here can silently drift.
 * No network call — safe to call repeatedly for instant slider feedback.
 */
export function colorizeIMDFrame(
  img: HTMLImageElement,
  colormap: ColormapName,
  intensity: number,
  targetBounds: [[number, number], [number, number]],
  crop: CropSelection
): ColorizedFrame {
  const srcX = Math.round((crop.left / 100) * img.width);
  const srcY = Math.round((crop.top / 100) * img.height);
  const srcW = Math.round(img.width * (1 - (crop.left + crop.right) / 100));
  const srcH = Math.round(img.height * (1 - (crop.top + crop.bottom) / 100));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, srcW);
  canvas.height = Math.max(1, srcH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, srcX, srcY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

  const rawData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const colorized = applyColormapToImageData(rawData, colormap, intensity);
  ctx.putImageData(colorized, 0, 0);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    bounds: targetBounds,
    date: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC (IMD/INSAT)',
    daysBack: 0,
    width: canvas.width,
    height: canvas.height,
  };
}

/** Convenience: fetch + colorize in one call, for the initial load. */
export async function fetchAndColorizeIMD(
  colormap: ColormapName,
  intensity: number,
  targetBounds: [[number, number], [number, number]] = DEFAULT_IMD_MAP_BOUNDS,
  crop: CropSelection = DEFAULT_CROP
): Promise<{ frame: ColorizedFrame; rawImage: HTMLImageElement }> {
  const rawImage = await fetchIMDRawImage();
  const frame = colorizeIMDFrame(rawImage, colormap, intensity, targetBounds, crop);
  return { frame, rawImage };
}
