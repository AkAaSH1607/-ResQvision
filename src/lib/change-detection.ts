import type { ChangeDetectionResult, ChangeSeverity, ZoneStats, RegionAnalysis } from './types';

const NO_DATA_THRESHOLD = 10; // R+G+B all below this = satellite no-data pixel (swath gap)

const ZONE_LABELS: string[][] = [
  ['North-West (NW)', 'North-Central (N)', 'North-East (NE)'],
  ['West-Central (W)', 'Central', 'East-Central (E)'],
  ['South-West (SW)', 'South-Central (S)', 'South-East (SE)'],
];

/**
 * Scans the change image on a 3x3 grid and scores every zone by the
 * percentage of changed pixels + average change intensity. Swath-gap
 * (no-data) pixels are excluded so missing-data passes never score as
 * "change." Zones dominated by gaps are flagged lowCoverage. Returns the
 * worst-affected zone and a full breakdown so the UI can rank regions.
 */
export function analyzeRegions(
  beforeData: Uint8Array,
  afterData: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  beforeRgba?: Uint8Array,
  afterRgba?: Uint8Array
): RegionAnalysis {
  const cols = 3;
  const rows = 3;
  const zones: ZoneStats[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor((col / cols) * width);
      const x1 = col === cols - 1 ? width : Math.floor(((col + 1) / cols) * width);
      const y0 = Math.floor((row / rows) * height);
      const y1 = row === rows - 1 ? height : Math.floor(((row + 1) / rows) * height);

      let zoneChanged = 0;
      let zonePixels = 0;
      let intensitySum = 0;
      let noDataPixels = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = y * width + x;
          // Swath-gap protection: if either frame has no-data pixels here,
          // the whole cell is excluded from change scoring (data was never
          // captured for that pass) instead of being scored as "change".
          const noData = Boolean(beforeRgba && isNoData(beforeRgba, idx)) || Boolean(afterRgba && isNoData(afterRgba, idx));
          if (noData) {
            noDataPixels++;
            continue;
          }
          const diff = Math.abs(beforeData[idx] - afterData[idx]);
          intensitySum += diff;
          zonePixels++;
          if (diff > threshold) zoneChanged++;
        }
      }

      const totalCell = zonePixels + noDataPixels;
      const lowCoverage = totalCell > 0 && noDataPixels / totalCell > 0.6;

      zones.push({
        name: ZONE_LABELS[row][col],
        col,
        row,
        changePercent: zonePixels > 0 ? parseFloat(((zoneChanged / zonePixels) * 100).toFixed(1)) : 0,
        intensity: zonePixels > 0 ? parseFloat((intensitySum / zonePixels).toFixed(1)) : 0,
        noDataPercent: totalCell > 0 ? parseFloat(((noDataPixels / totalCell) * 100).toFixed(0)) : 0,
        lowCoverage,
        bbox: { x0, y0, x1, y1 },
      });
    }
  }

  const sorted = [...zones].sort((a, b) => b.changePercent - a.changePercent);
  const worstZone = sorted[0]?.changePercent > 0 ? sorted[0] : null;

  return { worstZone, zones: sorted, gridCols: cols, gridRows: rows };
}

function classifySeverity(affectedPercent: number): ChangeSeverity {
  if (affectedPercent < 5) return 'None';
  if (affectedPercent < 15) return 'Low';
  if (affectedPercent < 30) return 'Moderate';
  if (affectedPercent < 50) return 'High';
  return 'Critical';
}

export interface ChangeDetectionInput {
  beforeData: Uint8Array; // 1-channel gray values
  afterData: Uint8Array;  // 1-channel gray values
  beforeRgba: Uint8Array; // 4-channel raw RGBA (for no-data detection)
  afterRgba: Uint8Array;  // 4-channel raw RGBA (for no-data detection)
  width: number;
  height: number;
}

export function detectChanges(input: ChangeDetectionInput, threshold = 25): ChangeDetectionResult {
  const { beforeData, afterData, beforeRgba, afterRgba, width, height } = input;
  const n = Math.min(beforeData.length, afterData.length);
  const changePixels = new Uint8Array(n);
  let changedPixels = 0;

  for (let i = 0; i < n; i++) {
    // Swath-gap protection: pixels flagged no-data in either frame don't
    // count as change even though gray values may differ wildly (missing
    // data vs captured data would otherwise look like a 255-level delta).
    if (isNoData(beforeRgba, i) || isNoData(afterRgba, i)) {
      changePixels[i] = 0;
      continue;
    }
    const diff = Math.abs(beforeData[i] - afterData[i]);
    changePixels[i] = diff;
    if (diff > threshold) changedPixels++;
  }

  const affectedAreaPercent = (changedPixels / n) * 100;
  const severity = classifySeverity(affectedAreaPercent);
  const region = analyzeRegions(beforeData, afterData, width, height, threshold, beforeRgba, afterRgba);

  // Build a change map ImageData with red highlighting
  const mapData = new ImageData(width, height);
  const d = mapData.data;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (isNoData(beforeRgba, i) || isNoData(afterRgba, i)) {
      // Render no-data pixels as a checkerboard-neutral gray with an alpha hint
      d[p] = 60;
      d[p + 1] = 60;
      d[p + 2] = 75;
      d[p + 3] = 255;
      continue;
    }
    const diff = changePixels[i];
    if (diff > threshold) {
      // Red channel scaled by change intensity
      d[p] = Math.min(255, 100 + diff);
      d[p + 1] = Math.max(0, 40 - diff / 4);
      d[p + 2] = 20;
      d[p + 3] = Math.min(255, 120 + diff);
    } else {
      // Show original grayscale dimmed
      const gray = Math.round((beforeData[i] + afterData[i]) / 2 * 0.35);
      d[p] = gray;
      d[p + 1] = gray;
      d[p + 2] = gray;
      d[p + 3] = 200;
    }
  }

  return {
    affectedAreaPercent: parseFloat(affectedAreaPercent.toFixed(2)),
    severity,
    changedPixels,
    totalPixels: n,
    changeMapData: mapData,
    region,
  };
}

export function extractGrayFromImageData(imageData: ImageData): Uint8Array {
  const src = imageData.data;
  const gray = new Uint8Array(imageData.width * imageData.height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = Math.round(0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2]);
  }
  return gray;
}

/** A pixel counts as satellite no-data when all three raw channels are dark. */
export function isNoData(rgba: Uint8Array, idx: number): boolean {
  const p = idx * 4;
  return rgba[p] < NO_DATA_THRESHOLD && rgba[p + 1] < NO_DATA_THRESHOLD && rgba[p + 2] < NO_DATA_THRESHOLD;
}

export function loadImageToCanvas(file: File): Promise<{ imageData: ImageData; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ imageData, width: canvas.width, height: canvas.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
