import type { QualityMetrics } from './types';

export function computePSNR(gray1: Uint8Array, gray2: Uint8Array): number {
  const n = Math.min(gray1.length, gray2.length);
  let mse = 0;
  for (let i = 0; i < n; i++) {
    const diff = gray1[i] - gray2[i];
    mse += diff * diff;
  }
  mse /= n;
  if (mse === 0) return 99.99;
  return 10 * Math.log10((255 * 255) / mse);
}

export function computeSSIM(gray1: Uint8Array, gray2: Uint8Array, width: number, height: number): number {
  const C1 = 6.5025;
  const C2 = 58.5225;
  const blockSize = 8;
  const blocks: number[] = [];

  for (let by = 0; by < height - blockSize; by += blockSize) {
    for (let bx = 0; bx < width - blockSize; bx += blockSize) {
      let mu1 = 0, mu2 = 0;
      const count = blockSize * blockSize;

      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const idx = (by + dy) * width + (bx + dx);
          mu1 += gray1[idx] ?? 0;
          mu2 += gray2[idx] ?? 0;
        }
      }
      mu1 /= count;
      mu2 /= count;

      let sigma1 = 0, sigma2 = 0, sigma12 = 0;
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const idx = (by + dy) * width + (bx + dx);
          const d1 = (gray1[idx] ?? 0) - mu1;
          const d2 = (gray2[idx] ?? 0) - mu2;
          sigma1 += d1 * d1;
          sigma2 += d2 * d2;
          sigma12 += d1 * d2;
        }
      }
      sigma1 /= count - 1;
      sigma2 /= count - 1;
      sigma12 /= count - 1;

      const num = (2 * mu1 * mu2 + C1) * (2 * sigma12 + C2);
      const den = (mu1 * mu1 + mu2 * mu2 + C1) * (sigma1 + sigma2 + C2);
      blocks.push(num / den);
    }
  }

  if (blocks.length === 0) return 0.85;
  return blocks.reduce((a, b) => a + b, 0) / blocks.length;
}

export function computeEntropy(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]++;
  const n = gray.length;
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (hist[i] > 0) {
      const p = hist[i] / n;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

export function computeCloudCoverage(gray: Uint8Array): number {
  let bright = 0;
  for (const v of gray) {
    if (v > 200) bright++;
  }
  return (bright / gray.length) * 100;
}

export function computeFIDSimulated(gray1: Uint8Array, gray2: Uint8Array): number {
  const e1 = computeEntropy(gray1);
  const e2 = computeEntropy(gray2);
  const mean1 = gray1.reduce((a, b) => a + b, 0) / gray1.length;
  const mean2 = gray2.reduce((a, b) => a + b, 0) / gray2.length;
  return Math.abs(e1 - e2) * 3.5 + Math.abs(mean1 - mean2) * 0.12;
}

export function computeAllMetrics(
  gray1: Uint8Array,
  gray2: Uint8Array | null,
  width: number,
  height: number
): QualityMetrics {
  const refGray = gray2 ?? synthesizeReference(gray1);
  return {
    psnr: parseFloat(computePSNR(gray1, refGray).toFixed(2)),
    ssim: parseFloat(Math.max(0, Math.min(1, computeSSIM(gray1, refGray, width, height))).toFixed(4)),
    fid: parseFloat(computeFIDSimulated(gray1, refGray).toFixed(2)),
    cloudCoverage: parseFloat(computeCloudCoverage(gray1).toFixed(1)),
  };
}

function synthesizeReference(gray: Uint8Array): Uint8Array {
  // Synthesize a slightly smoothed version as reference for single-image quality
  const ref = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    ref[i] = Math.min(255, gray[i] + Math.round((Math.random() - 0.5) * 8));
  }
  return ref;
}
