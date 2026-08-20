export type ColormapName = 'JET' | 'TURBO' | 'INFERNO' | 'PLASMA';

export type SatelliteType = 'INSAT-3DS' | 'Landsat 8/9' | 'Sentinel-1' | 'Cartosat-3';

export type WeatherCondition = 'Clear' | 'Partly Cloudy' | 'Overcast' | 'Storm';

export type ChangeSeverity = 'None' | 'Low' | 'Moderate' | 'High' | 'Critical';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AlertType = 'high_cloud' | 'heat_anomaly' | 'change_detected' | 'storm' | 'vegetation_loss';

export interface QualityMetrics {
  psnr: number;
  ssim: number;
  fid: number;
  cloudCoverage: number;
}

export interface SceneAnalysisResult {
  weather: WeatherCondition;
  ndvi: number;
  waterBodiesPercent: number;
  urbanHeatPercent: number;
  vegetationPercent: number;
  cloudPercent: number;
  confidence?: number;
  isML?: boolean;
}

export interface ZoneStats {
  name: string;
  col: number;
  row: number;
  changePercent: number;
  intensity: number;
  noDataPercent: number; // % of the zone covered by satellite swath gaps (no-data)
  lowCoverage: boolean;  // true if swath gaps dominate the zone → scoring unreliable
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface RegionAnalysis {
  worstZone: ZoneStats | null;
  zones: ZoneStats[];
  gridCols: number;
  gridRows: number;
}

export interface ChangeDetectionResult {
  affectedAreaPercent: number;
  severity: ChangeSeverity;
  changedPixels: number;
  totalPixels: number;
  changeMapData: ImageData | null;
  region?: RegionAnalysis;
}

export interface AutoChangeReport {
  baselineDate: string; // fetch_date of the stored frame used as "before"
  currentDate: string;  // fetch_date of the fresh frame ("after")
  result: ChangeDetectionResult;
}

export interface ProcessedImage {
  canvas: HTMLCanvasElement;
  originalData: Uint8ClampedArray;
  width: number;
  height: number;
  colormap: ColormapName;
  intensity: number;
}

export interface AnalysisRecord {
  id: string;
  created_at: string;
  image_name: string;
  analysis_type: string;
  colormap_used: string | null;
  intensity_applied: number | null;
  psnr: number | null;
  ssim: number | null;
  fid_score: number | null;
  cloud_coverage: number | null;
  weather_condition: string | null;
  ndvi: number | null;
  water_bodies_percent: number | null;
  urban_heat_percent: number | null;
  affected_area_percent: number | null;
  change_severity: string | null;
  image_width: number | null;
  image_height: number | null;
  processing_time_ms: number | null;
  satellite_type: string | null;
  metadata: Record<string, unknown>;
}

export interface AlertRecord {
  id: string;
  analysis_id: string | null;
  alert_type: string;
  severity: string;
  message: string;
  is_dismissed: boolean;
  created_at: string;
}

export interface SaveAnalysisPayload {
  image_name: string;
  analysis_type: string;
  colormap_used?: string;
  intensity_applied?: number;
  psnr?: number;
  ssim?: number;
  fid_score?: number;
  cloud_coverage?: number;
  weather_condition?: string;
  ndvi?: number;
  water_bodies_percent?: number;
  urban_heat_percent?: number;
  affected_area_percent?: number;
  change_severity?: string;
  image_width?: number;
  image_height?: number;
  processing_time_ms?: number;
  satellite_type?: string;
  metadata?: Record<string, unknown>;
}
