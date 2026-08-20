/**
 * ML-based scene analysis using TensorFlow.js DeepLab v3 (MobileNetV2) model.
 * Trained on ADE20K dataset for pixel-level semantic segmentation.
 *
 * Maps DeepLab ADE20K output labels to satellite-relevant categories:
 *   - sky → cloud cover
 *   - water, sea, river, lake → water bodies
 *   - grass, tree, field, plant, vegetation → vegetation
 *   - road, building, sidewalk, terrain, path → urban/heat islands
 *
 * Provides confidence-weighted percentages for each category.
 * Falls back to rule-based analysis if the ML model fails to load.
 */

import type { SceneAnalysisResult, WeatherCondition } from './types';

// ADE20K label indices that map to our categories
const ADE20K_LABELS: Record<number, string> = {
  0: 'background',
  1: 'wall',
  2: 'building',
  3: 'sky',
  4: 'floor',
  5: 'tree',
  6: 'ceiling',
  7: 'road',
  8: 'bed',
  9: 'windowpane',
  10: 'grass',
  11: 'cabinet',
  12: 'sidewalk',
  13: 'person',
  14: 'earth',
  15: 'door',
  16: 'table',
  17: 'mountain',
  18: 'plant',
  19: 'curtain',
  20: 'chair',
  21: 'car',
  22: 'water',
  23: 'painting',
  24: 'sofa',
  25: 'shelf',
  26: 'house',
  27: 'sea',
  28: 'mirror',
  29: 'rug',
  30: 'field',
  31: 'armchair',
  32: 'seat',
  33: 'fence',
  34: 'desk',
  35: 'rock',
  36: 'wardrobe',
  37: 'lamp',
  38: 'bathtub',
  39: 'railing',
  40: 'cushion',
  41: 'base',
  42: 'box',
  43: 'column',
  44: 'signboard',
  45: 'chest',
  46: 'counter',
  47: 'sand',
  48: 'sink',
  49: 'skyscraper',
  50: 'fireplace',
  51: 'refrigerator',
  52: 'grandstand',
  53: 'path',
  54: 'stairs',
  55: 'runway',
  56: 'case',
  57: 'pool',
  58: 'pillow',
  59: 'screen',
  60: 'stairway',
  61: 'river',
  62: 'bridge',
  63: 'bookcase',
  64: 'blind',
  65: 'coffee',
  66: 'toilet',
  67: 'flower',
  68: 'book',
  69: 'hill',
  70: 'bench',
  71: 'countertop',
  72: 'stove',
  73: 'palm',
  74: 'kitchen',
  75: 'computer',
  76: 'swivel',
  77: 'boat',
  78: 'bar',
  79: 'arcade',
  80: 'hovel',
  81: 'bus',
  82: 'towel',
  83: 'light',
  84: 'truck',
  85: 'tower',
  86: 'chandelier',
  87: 'awning',
  88: 'streetlight',
  89: 'booth',
  90: 'television',
  91: 'airplane',
  92: 'dirt',
  93: 'apparel',
  94: 'pole',
  95: 'land',
  96: 'bannister',
  97: 'escalator',
  98: 'ottoman',
  99: 'bottle',
  100: 'buffet',
  101: 'poster',
  102: 'stage',
  103: 'van',
  104: 'ship',
  105: 'fountain',
  106: 'conveyer',
  107: 'canopy',
  108: 'washer',
  109: 'plaything',
  110: 'swimming',
  111: 'stool',
  112: 'barrel',
  113: 'basket',
  114: 'waterfall',
  115: 'tent',
  116: 'bag',
  117: 'minibike',
  118: 'cradle',
  119: 'oven',
  120: 'ball',
  121: 'food',
  122: 'step',
  123: 'tank',
  124: 'trade',
  125: 'microwave',
  126: 'pot',
  127: 'animal',
  128: 'bicycle',
  129: 'lake',
  130: 'dishwasher',
  131: 'screen',
  132: 'blanket',
  133: 'sculpture',
  134: 'hood',
  135: 'sconce',
  136: 'vase',
  137: 'traffic',
  138: 'tray',
  139: 'ashcan',
  140: 'fan',
  141: 'pier',
  142: 'screen',
  143: 'plate',
  144: 'monitor',
  145: 'bulletin',
  146: 'shower',
  147: 'radiator',
  148: 'glass',
  149: 'clock',
  150: 'flag',
};

// Category mapping: ADE20K labels → satellite scene categories
const CLOUD_LABELS = new Set([3, 19, 87, 107, 114]); // sky, curtain, awning, canopy, waterfall-like
const WATER_LABELS = new Set([22, 27, 57, 61, 129, 104, 105]); // water, sea, pool, river, lake, ship, fountain
const VEGETATION_LABELS = new Set([5, 10, 18, 30, 67, 69, 73, 95, 17]); // tree, grass, plant, field, flower, hill, palm, land, mountain
const URBAN_LABELS = new Set([2, 7, 12, 14, 35, 47, 53, 92, 44, 85, 49, 26, 1, 50, 71, 72]); // building, road, sidewalk, earth, rock, sand, path, dirt, signboard, tower, skyscraper, house, wall, fireplace, stove, countertop

// Confidence weights per label (how strongly each label indicates the category)
// Higher = more confident mapping
function getConfidence(label: number, category: 'cloud' | 'water' | 'vegetation' | 'urban'): number {
  const mapping: Record<string, Record<number, number>> = {
    cloud: { 3: 1.0, 19: 0.3, 87: 0.3, 107: 0.2, 114: 0.4 },
    water: { 22: 1.0, 27: 0.9, 57: 0.7, 61: 0.9, 129: 1.0, 104: 0.3, 105: 0.5 },
    vegetation: { 5: 0.9, 10: 1.0, 18: 0.9, 30: 1.0, 67: 0.8, 69: 0.6, 73: 0.8, 95: 0.5, 17: 0.5 },
    urban: { 2: 1.0, 7: 0.8, 12: 0.7, 14: 0.4, 35: 0.3, 47: 0.4, 53: 0.6, 92: 0.3, 44: 0.3, 85: 0.8, 49: 0.9, 26: 0.7, 1: 0.3, 50: 0.4, 71: 0.3, 72: 0.3 },
  };
  return mapping[category]?.[label] ?? 0;
}

// Lazy-loaded model reference
let deeplabModel: any = null;
let modelLoading: Promise<any> | null = null;
let modelError = false;

export function getModelStatus(): 'idle' | 'loading' | 'ready' | 'error' {
  if (modelError) return 'error';
  if (deeplabModel) return 'ready';
  if (modelLoading) return 'loading';
  return 'idle';
}

async function loadModel() {
  if (deeplabModel) return deeplabModel;
  if (modelLoading) return modelLoading;

  modelLoading = (async () => {
    try {
      // Dynamic import to keep bundle small
      const deeplab = await import('@tensorflow-models/deeplab');
      const model = await deeplab.load({
        base: 'ade20k',
        quantizationBytes: 2,
      });
      deeplabModel = model;
      console.log('[ResQvision] DeepLab model loaded successfully');
      return model;
    } catch (err) {
      console.error('[ResQvision] Failed to load DeepLab model:', err);
      modelError = true;
      throw err;
    }
  })();

  try {
    return await modelLoading;
  } catch {
    modelLoading = null;
    throw new Error('Failed to load DeepLab model');
  }
}

/**
 * Pre-load the ML model without needing any image.
 * Call this on page mount to warm up the model.
 */
export async function preloadModel(): Promise<void> {
  try {
    await loadModel();
  } catch {
    // Silently fail — we'll fall back to physics-based analysis
    console.warn('[ResQvision] Model preload failed, will use physics-based analysis');
  }
}

export interface MLAnalysisResult {
  weather: WeatherCondition;
  ndvi: number;
  waterBodiesPercent: number;
  urbanHeatPercent: number;
  vegetationPercent: number;
  cloudPercent: number;
  confidence: number; // overall model confidence (0-1)
  isML: boolean;
}

/**
 * Run ML-based scene analysis on a colorized canvas.
 * The model segments the image into semantic labels, then we
 * aggregate pixel-level predictions into scene-level percentages.
 */
export async function analyzeSceneML(
  canvas: HTMLCanvasElement,
  imageData: ImageData,
): Promise<MLAnalysisResult> {
  const model = await loadModel();

  // Resize for performance — DeepLab works best at ~513px
  const tempCanvas = document.createElement('canvas');
  const size = 256;
  tempCanvas.width = size;
  tempCanvas.height = size;
  const ctx = tempCanvas.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, size, size);

  // Run segmentation
  const result = await model.segment(tempCanvas);

  // The segmentationMap is a Uint8ClampedArray of RGB colors
  // We need to map colors back to labels using the model's legend
  const { legend, segmentationMap, width, height } = result;

  // Build reverse lookup: RGB color → label name
  const colorToLabel = new Map<string, string>();
  for (const [labelName, rgb] of Object.entries(legend)) {
    const [r, g, b] = rgb as number[];
    colorToLabel.set(`${r},${g},${b}`, labelName);
  }

  // Count pixels per category
  let totalPixels = width * height;
  let cloudCount = 0;
  let waterCount = 0;
  let vegetationCount = 0;
  let urbanCount = 0;
  let matchedPixels = 0;
  let confidenceSum = 0;

  for (let i = 0; i < segmentationMap.length; i += 4) {
    const r = segmentationMap[i];
    const g = segmentationMap[i + 1];
    const b = segmentationMap[i + 2];
    const labelName = colorToLabel.get(`${r},${g},${b}`);

    if (!labelName || labelName === 'background') continue;

    matchedPixels++;
    // Find the label index from the name
    const labelIndex = Object.entries(ADE20K_LABELS).find(([_, name]) => name === labelName)?.[0];
    if (!labelIndex) continue;

    const idx = parseInt(labelIndex);
    const cloudConf = getConfidence(idx, 'cloud');
    const waterConf = getConfidence(idx, 'water');
    const vegConf = getConfidence(idx, 'vegetation');
    const urbanConf = getConfidence(idx, 'urban');

    // Assign to best matching category
    if (cloudConf > 0) { cloudCount += cloudConf; confidenceSum += cloudConf; }
    if (waterConf > 0) { waterCount += waterConf; confidenceSum += waterConf; }
    if (vegConf > 0) { vegetationCount += vegConf; confidenceSum += vegConf; }
    if (urbanConf > 0) { urbanCount += urbanConf; confidenceSum += urbanConf; }
  }

  // Normalize to percentages (weighted by confidence)
  const cloudPercent = Math.min(100, (cloudCount / Math.max(matchedPixels, 1)) * 100);
  const waterPercent = Math.min(100, (waterCount / Math.max(matchedPixels, 1)) * 100);
  const vegPercent = Math.min(100, (vegetationCount / Math.max(matchedPixels, 1)) * 100);
  const urbanPercent = Math.min(100, (urbanCount / Math.max(matchedPixels, 1)) * 100);

  // Weather classification based on cloud coverage
  const weather = classifyWeather(cloudPercent);

  // NDVI approximation from vegetation ratio
  // Higher vegetation % → higher NDVI
  const ndvi = Math.max(-1, Math.min(1, (vegPercent / 100) * 1.2 - 0.1));

  // Overall confidence
  const confidence = matchedPixels > 0 ? confidenceSum / (matchedPixels * 4) : 0;

  return {
    weather,
    ndvi: parseFloat(ndvi.toFixed(3)),
    waterBodiesPercent: parseFloat(waterPercent.toFixed(1)),
    urbanHeatPercent: parseFloat(urbanPercent.toFixed(1)),
    vegetationPercent: parseFloat(vegPercent.toFixed(1)),
    cloudPercent: parseFloat(cloudPercent.toFixed(1)),
    confidence: parseFloat(Math.min(1, confidence * 1.5).toFixed(2)),
    isML: true,
  };
}

function classifyWeather(cloudPercent: number): WeatherCondition {
  if (cloudPercent < 10) return 'Clear';
  if (cloudPercent < 35) return 'Partly Cloudy';
  if (cloudPercent < 65) return 'Overcast';
  return 'Storm';
}

/**
 * Blend ML results with physics-based results for improved accuracy.
 * Uses weighted average: 60% ML, 40% physics-based.
 */
export function blendResults(
  ml: MLAnalysisResult,
  physics: SceneAnalysisResult,
): SceneAnalysisResult {
  const mlWeight = 0.6;
  const physWeight = 0.4;

  return {
    weather: ml.cloudPercent < 10 ? 'Clear' : ml.weather,
    ndvi: parseFloat((ml.ndvi * mlWeight + physics.ndvi * physWeight).toFixed(3)),
    waterBodiesPercent: parseFloat((ml.waterBodiesPercent * mlWeight + physics.waterBodiesPercent * physWeight).toFixed(1)),
    urbanHeatPercent: parseFloat((ml.urbanHeatPercent * mlWeight + physics.urbanHeatPercent * physWeight).toFixed(1)),
    vegetationPercent: parseFloat((ml.vegetationPercent * mlWeight + physics.vegetationPercent * physWeight).toFixed(1)),
    cloudPercent: parseFloat((ml.cloudPercent * mlWeight + physics.cloudPercent * physWeight).toFixed(1)),
  };
}
