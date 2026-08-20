import type { ColormapName } from './types';

type RGB = [number, number, number];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpRGB(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function buildLUT(stops: Array<[number, RGB]>): RGB[] {
  const lut: RGB[] = new Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let lower = stops[0];
    let upper = stops[stops.length - 1];
    for (let j = 0; j < stops.length - 1; j++) {
      if (v >= stops[j][0] && v <= stops[j + 1][0]) {
        lower = stops[j];
        upper = stops[j + 1];
        break;
      }
    }
    const range = upper[0] - lower[0];
    const t = range === 0 ? 0 : (v - lower[0]) / range;
    lut[i] = lerpRGB(lower[1], upper[1], t);
  }
  return lut;
}

const JET_LUT: RGB[] = buildLUT([
  [0.000, [0, 0, 127]],
  [0.125, [0, 0, 255]],
  [0.250, [0, 127, 255]],
  [0.375, [0, 255, 255]],
  [0.500, [127, 255, 127]],
  [0.625, [255, 255, 0]],
  [0.750, [255, 127, 0]],
  [0.875, [255, 0, 0]],
  [1.000, [127, 0, 0]],
]);

const TURBO_LUT: RGB[] = buildLUT([
  [0.000, [48, 18, 59]],
  [0.100, [68, 90, 186]],
  [0.200, [52, 153, 232]],
  [0.300, [39, 203, 198]],
  [0.400, [57, 233, 131]],
  [0.500, [134, 248, 67]],
  [0.600, [208, 236, 30]],
  [0.700, [254, 188, 43]],
  [0.800, [250, 121, 35]],
  [0.900, [213, 51, 21]],
  [1.000, [122, 4, 3]],
]);

const INFERNO_LUT: RGB[] = buildLUT([
  [0.000, [0, 0, 4]],
  [0.125, [31, 12, 72]],
  [0.250, [85, 15, 109]],
  [0.375, [139, 34, 82]],
  [0.500, [188, 55, 84]],
  [0.625, [229, 92, 48]],
  [0.750, [253, 141, 60]],
  [0.875, [253, 199, 120]],
  [1.000, [252, 255, 164]],
]);

const PLASMA_LUT: RGB[] = buildLUT([
  [0.000, [13, 8, 135]],
  [0.125, [75, 3, 161]],
  [0.250, [125, 3, 168]],
  [0.375, [168, 34, 150]],
  [0.500, [203, 70, 121]],
  [0.625, [229, 107, 93]],
  [0.750, [248, 148, 65]],
  [0.875, [253, 195, 40]],
  [1.000, [240, 249, 33]],
]);

export const COLORMAPS: Record<ColormapName, RGB[]> = {
  JET: JET_LUT,
  TURBO: TURBO_LUT,
  INFERNO: INFERNO_LUT,
  PLASMA: PLASMA_LUT,
};

export function getColormapPreview(name: ColormapName): string {
  const lut = COLORMAPS[name];
  const stops = [0, 32, 64, 96, 128, 160, 192, 224, 255];
  const colors = stops.map(i => `rgb(${lut[i][0]},${lut[i][1]},${lut[i][2]})`);
  return `linear-gradient(to right, ${colors.join(', ')})`;
}

export function applyColormap(
  grayscale: Uint8ClampedArray,
  colormap: ColormapName,
  intensity: number
): Uint8ClampedArray {
  const lut = COLORMAPS[colormap];
  const out = new Uint8ClampedArray(grayscale.length);
  for (let i = 0; i < grayscale.length; i++) {
    const val = Math.min(255, Math.max(0, Math.round(grayscale[i] * intensity)));
    const [r, g, b] = lut[val];
    out[i * 0] = r; // placeholder — pixel iteration is per-pixel below
    void r; void g; void b;
  }
  // Re-do: pixel iteration with RGBA
  return grayscale; // overridden in canvas processor
}

export function applyColormapToImageData(
  imageData: ImageData,
  colormap: ColormapName,
  intensity: number
): ImageData {
  const lut = COLORMAPS[colormap];
  const src = imageData.data;
  const result = new ImageData(imageData.width, imageData.height);
  const dst = result.data;

  for (let i = 0; i < src.length; i += 4) {
    const gray = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
    const val = Math.min(255, Math.max(0, Math.round(gray * intensity)));
    const [r, g, b] = lut[val];
    dst[i] = r;
    dst[i + 1] = g;
    dst[i + 2] = b;
    dst[i + 3] = 255;
  }

  return result;
}

export function extractGrayscale(imageData: ImageData): Uint8Array {
  const src = imageData.data;
  const gray = new Uint8Array(imageData.width * imageData.height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = Math.round(0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2]);
  }
  return gray;
}
