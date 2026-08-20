import { applyColormapToImageData } from './colormaps';
import type { ColormapName } from './types';
import { supabase } from './supabase';
import type { ColorizedFrame } from './live-colorize';

// Himawari-8/9 satellite parameters (standard, well-documented values)
const LAMBDA0_DEG = 140.7; // sub-satellite longitude
const H_KM = 42164; // distance from Earth's center to satellite (standard GEO radius)
const RE_KM = 6371; // Earth radius, spherical approximation

// India bounding box — matches the bbox used by our other satellite sources
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [8, 68],
  [37, 98],
];
const OUTPUT_SIZE = 360; // output raster resolution (pixels per side)

/**
 * Forward geostationary projection: given a lat/lon, find where that point
 * falls on the satellite's normalized disk image (u,v both in [-1,1], with
 * u²+v² > 1 meaning "off the visible disk / in space").
 *
 * This is the standard two-axis scan-angle model used for GOES/Himawari
 * fixed-grid geostationary imagery. Sanity-checked against the well-known
 * fact that a GEO satellite's horizon sits at arccos(Re/H) ≈ 81.3° from the
 * sub-satellite point (≈42% of Earth's surface) — this formula reproduces
 * that exactly. NOT yet empirically pixel-verified against a real fetched
 * Himawari frame (network-restricted sandbox) — see the in-app note.
 */
function latLonToDiskUV(latDeg: number, lonDeg: number): { u: number; v: number } | null {
  const lat = (latDeg * Math.PI) / 180;
  const dLon = ((lonDeg - LAMBDA0_DEG) * Math.PI) / 180;

  const x1 = RE_KM * Math.cos(lat) * Math.sin(dLon);
  const y1 = RE_KM * Math.sin(lat);
  const z1 = RE_KM * Math.cos(lat) * Math.cos(dLon);

  const cosC = z1 / RE_KM;
  if (cosC < RE_KM / H_KM) return null; // beyond the satellite's horizon

  const denom = H_KM - z1;
  const scanX = Math.atan(x1 / denom);
  const scanY = Math.atan(y1 / denom);
  const scanMax = Math.asin(RE_KM / H_KM);

  const u = Math.sin(scanX) / Math.sin(scanMax);
  const v = Math.sin(scanY) / Math.sin(scanMax);

  if (u * u + v * v > 1) return null;
  return { u, v };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load Himawari frame from proxy'));
    img.src = src;
  });
}

/**
 * Fetches the latest Himawari full-disk frame, re-projects the India region
 * out of it into a normal lat/lon-bounded raster (undoing the satellite's
 * viewing-angle distortion pixel by pixel), then runs it through
 * ResQvision's own colormap engine — same as every other live source.
 *
 * BETA: the reprojection math is standard and internally sanity-checked,
 * but not yet visually confirmed against a real fetched frame (see caller
 * for the disclaimer surfaced in the UI). Nearest-neighbor sampling.
 */
export async function fetchAndColorizeHimawari(
  colormap: ColormapName,
  intensity: number
): Promise<ColorizedFrame> {
  const { data, error } = await supabase.functions.invoke('himawari-proxy', {});
  if (error) {
    // Try to pull the real error message out of the function's JSON response
    // body instead of surfacing the generic "non-2xx status code" wrapper.
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) detail = body.error;
      }
    } catch {
      // fall back to error.message if we can't parse a body
    }
    throw new Error(`Himawari proxy error: ${detail}`);
  }

  // supabase.functions.invoke with a binary response returns it as a Blob
  const blob: Blob = data instanceof Blob ? data : new Blob([data]);
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await loadImage(objectUrl);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = img.width;
    sourceCanvas.height = img.height;
    const sctx = sourceCanvas.getContext('2d');
    if (!sctx) throw new Error('Canvas 2D context unavailable');
    sctx.drawImage(img, 0, 0);
    const sourceData = sctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    // Build the reprojected raster: for each output pixel (a lat/lon cell
    // over India), find the matching source pixel on the satellite disk.
    const outCanvas = document.createElement('canvas');
    outCanvas.width = OUTPUT_SIZE;
    outCanvas.height = OUTPUT_SIZE;
    const octx = outCanvas.getContext('2d');
    if (!octx) throw new Error('Canvas 2D context unavailable');
    const outData = octx.createImageData(OUTPUT_SIZE, OUTPUT_SIZE);

    const [[south, west], [north, east]] = INDIA_BOUNDS;
    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;

    for (let row = 0; row < OUTPUT_SIZE; row++) {
      const lat = north - (row / (OUTPUT_SIZE - 1)) * (north - south);
      for (let col = 0; col < OUTPUT_SIZE; col++) {
        const lon = west + (col / (OUTPUT_SIZE - 1)) * (east - west);
        const outIdx = (row * OUTPUT_SIZE + col) * 4;

        const disk = latLonToDiskUV(lat, lon);
        if (!disk) {
          outData.data[outIdx + 3] = 0; // transparent — off-disk (shouldn't happen for India, but just in case)
          continue;
        }

        const srcX = Math.round(((disk.u + 1) / 2) * srcW);
        const srcY = Math.round(((1 - disk.v) / 2) * srcH);
        if (srcX < 0 || srcX >= srcW || srcY < 0 || srcY >= srcH) {
          outData.data[outIdx + 3] = 0;
          continue;
        }

        const srcIdx = (srcY * srcW + srcX) * 4;
        outData.data[outIdx] = sourceData.data[srcIdx];
        outData.data[outIdx + 1] = sourceData.data[srcIdx + 1];
        outData.data[outIdx + 2] = sourceData.data[srcIdx + 2];
        outData.data[outIdx + 3] = 255;
      }
    }

    const colorized = applyColormapToImageData(outData, colormap, intensity);
    // No-data masking: treat fully-transparent output pixels as still transparent post-colorize
    for (let i = 3; i < outData.data.length; i += 4) {
      if (outData.data[i] === 0) colorized.data[i] = 0;
    }
    octx.putImageData(colorized, 0, 0);

    return {
      dataUrl: outCanvas.toDataURL('image/png'),
      bounds: INDIA_BOUNDS,
      date: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC (Himawari, ~10min)',
      daysBack: 0,
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
