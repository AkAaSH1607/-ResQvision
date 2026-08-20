import type { SceneAnalysisResult, WeatherCondition } from './types';

function buildHistogram(gray: Uint8Array): Uint32Array {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v]++;
  return hist;
}

function computeVariance(gray: Uint8Array, mean: number): number {
  let v = 0;
  for (const px of gray) v += (px - mean) ** 2;
  return v / gray.length;
}

function detectCloudCoverage(gray: Uint8Array): number {
  let count = 0;
  for (const v of gray) if (v > 195) count++;
  return (count / gray.length) * 100;
}

function detectVegetation(gray: Uint8Array): number {
  // Vegetation in IR: mid-low intensity with moderate variance
  let count = 0;
  for (const v of gray) if (v >= 40 && v <= 130) count++;
  return (count / gray.length) * 100;
}

function detectWaterBodies(gray: Uint8Array): number {
  // Water in IR: very dark, low variance
  let count = 0;
  for (const v of gray) if (v < 40) count++;
  return (count / gray.length) * 100;
}

function detectUrbanHeat(gray: Uint8Array): number {
  // Urban heat islands: bright hot zones
  let count = 0;
  for (const v of gray) if (v >= 160 && v <= 200) count++;
  return (count / gray.length) * 100;
}

function classifyWeather(cloudPercent: number): WeatherCondition {
  if (cloudPercent < 10) return 'Clear';
  if (cloudPercent < 35) return 'Partly Cloudy';
  if (cloudPercent < 65) return 'Overcast';
  return 'Storm';
}

function computeNDVI(gray: Uint8Array): number {
  // Approximate NDVI: healthy vegetation appears dark in thermal IR
  // Map vegetation percentage to NDVI range
  const vegPercent = detectVegetation(gray);
  const mean = gray.reduce((a, b) => a + b, 0) / gray.length;
  // NIR-R / NIR+R approximation using intensity distribution
  const nir = (255 - mean) / 255;
  const red = mean / 255;
  const ndvi = (nir - red) / (nir + red + 0.0001);
  // Blend with vegetation detection
  return parseFloat(Math.max(-1, Math.min(1, ndvi * 0.7 + (vegPercent / 100) * 0.3)).toFixed(3));
}

export function analyzeScene(gray: Uint8Array): SceneAnalysisResult {
  const cloudPercent = detectCloudCoverage(gray);
  const vegetationPercent = detectVegetation(gray);
  const waterBodiesPercent = detectWaterBodies(gray);
  const urbanHeatPercent = detectUrbanHeat(gray);
  const weather = classifyWeather(cloudPercent);
  const ndvi = computeNDVI(gray);

  return {
    weather,
    ndvi,
    waterBodiesPercent: parseFloat(waterBodiesPercent.toFixed(1)),
    urbanHeatPercent: parseFloat(urbanHeatPercent.toFixed(1)),
    vegetationPercent: parseFloat(vegetationPercent.toFixed(1)),
    cloudPercent: parseFloat(cloudPercent.toFixed(1)),
  };
}
