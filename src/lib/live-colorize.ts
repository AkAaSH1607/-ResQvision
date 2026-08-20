import { applyColormapToImageData } from './colormaps';
import type { ColormapName } from './types';
import { fetchSatelliteImageAsBlob, type SatelliteSource } from './live-feed';

export interface ColorizedFrame {
  dataUrl: string;
  bounds: [[number, number], [number, number]];
  date: string;
  daysBack: number;
  width: number;
  height: number;
}

/** GIBS/WMS bbox strings are "south,west,north,east" (EPSG:4326 lat/lon order). */
export function parseBbox(bbox: string): [[number, number], [number, number]] {
  const [south, west, north, east] = bbox.split(',').map(Number);
  return [
    [south, west],
    [north, east],
  ];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load satellite image from proxy'));
    img.src = src;
  });
}

/**
 * NASA fills orbital swath gaps and cloud/ocean no-data areas with pure black
 * pixels. Without this, the colormap treats "no data" as "low temperature/
 * value" and paints it a real color (e.g. navy blue in JET) — misleading,
 * since it looks like a genuine feature (a river, a cold zone) rather than
 * "we simply have no reading here." This marks near-black source pixels as
 * transparent instead of colorizing them.
 */
const NO_DATA_THRESHOLD = 10; // R+G+B channels all below this = treated as no-data

export function maskNoDataAsTransparent(rawData: ImageData, colorized: ImageData): void {
  const src = rawData.data;
  const dst = colorized.data;
  for (let i = 0; i < src.length; i += 4) {
    if (src[i] < NO_DATA_THRESHOLD && src[i + 1] < NO_DATA_THRESHOLD && src[i + 2] < NO_DATA_THRESHOLD) {
      dst[i + 3] = 0; // fully transparent — "no data," not "a dark reading"
    }
  }
}

/**
 * Fetches the latest raw frame for a satellite source (via the satellite-proxy
 * edge function, which sidesteps GIBS' CORS restrictions) and runs it through
 * ResQvision's own colormap pipeline — the same one used on the Colorize page.
 * This is what actually makes the live map "ResQvision-colorized" rather than
 * just displaying NASA's own pre-rendered imagery.
 */
export async function fetchAndColorizeLiveFrame(
  source: SatelliteSource,
  colormap: ColormapName,
  intensity: number,
  daysBack = 1
): Promise<ColorizedFrame> {
  const { blob, date, daysBack: actualDaysBack } = await fetchSatelliteImageAsBlob(source, daysBack);
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await loadImage(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable in this browser');
    ctx.drawImage(img, 0, 0);

    const rawData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const colorized = applyColormapToImageData(rawData, colormap, intensity);
    maskNoDataAsTransparent(rawData, colorized);
    ctx.putImageData(colorized, 0, 0);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      bounds: parseBbox(source.bbox),
      date,
      daysBack: actualDaysBack,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
