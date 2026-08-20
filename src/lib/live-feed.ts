import { supabase, notifyAlert } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const SATELLITE_SOURCES = [
  {
    id: 'MODIS_Terra_CorrectedReflectance_Bands721',
    name: 'MODIS Terra — Real-Time False Color (7-2-1)',
    shortName: 'Real-Time False Color',
    agency: 'NASA Terra',
    updateFreq: 'Daily ~10:30 AM IST',
    description: 'Full-coverage false color — vegetation shows red, water dark blue, cloud white. Best for general scene reading.',
    bbox: '8,68,37,98',
    region: 'India',
    latRange: '8°N – 37°N',
    lonRange: '68°E – 98°E',
    defaultColormap: 'TURBO' as const,
    note: 'Full scene coverage — no black gaps',
  },
];

export type SatelliteSource = (typeof SATELLITE_SOURCES)[number];

export function buildProxyUrl(source: SatelliteSource, daysBack = 1): string {
  const params = new URLSearchParams({
    action: 'fetch',
    layer: source.id,
    bbox: source.bbox,
    width: '1024',
    height: '1024',
    days_back: String(daysBack),
  });
  return `${SUPABASE_URL}/functions/v1/satellite-proxy?${params.toString()}`;
}

export async function fetchSatelliteImageAsBlob(source: SatelliteSource, daysBack = 1): Promise<{ blob: Blob; date: string; daysBack: number }> {
  const url = buildProxyUrl(source, daysBack);
  // Abort after 20s to prevent indefinite buffering if the proxy is slow.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      signal: controller.signal,
    });
  } catch {
    throw new Error('Satellite frame timed out — try again in a moment');
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `Failed to fetch satellite data`);
  }
  const date = res.headers.get('X-Satellite-Date') ?? 'unknown';
  const actualDaysBack = parseInt(res.headers.get('X-Days-Back') ?? String(daysBack));
  const blob = await res.blob();
  return { blob, date, daysBack: actualDaysBack };
}

export async function saveLiveFeed(payload: {
  source_name: string;
  layer_id: string;
  fetch_date: string;
  image_url: string;
  region: string;
  bbox: string;
  colormap_applied: string;
  cloud_coverage?: number;
  weather_condition?: string;
  ndvi?: number;
  water_bodies_percent?: number;
  urban_heat_percent?: number;
  change_from_previous?: number;
  disaster_alert_fired: boolean;
  alert_message?: string;
  processing_time_ms?: number;
}) {
  const { data, error } = await supabase.from('live_feeds').insert(payload).select().maybeSingle();
  if (error) console.error('saveLiveFeed error:', error);
  return data;
}

export async function fetchRecentLiveFeeds(limit = 20) {
  const { data, error } = await supabase
    .from('live_feeds')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) console.error('fetchRecentLiveFeeds error:', error);
  return data ?? [];
}

export async function saveDisasterAlert(analysisId: string | null, message: string, severity: string) {
  const payload = {
    analysis_id: analysisId,
    alert_type: 'change_detected',
    severity,
    message,
    is_dismissed: false,
  };
  const { error } = await supabase.from('alerts').insert(payload);
  if (error) console.error('saveDisasterAlert error:', error);

  if (severity === 'high' || severity === 'critical') {
    notifyAlert({ alert_type: 'change_detected', severity, message }).catch(err =>
      console.error('notifyAlert error:', err)
    );
  }
}
export function buildProxyUrlForDate(source: SatelliteSource, date: string): string {
  const params = new URLSearchParams({
    action: 'fetch',
    layer: source.id,
    bbox: source.bbox,
    width: '1024',
    height: '1024',
    date,
  });
  return `${SUPABASE_URL}/functions/v1/satellite-proxy?${params.toString()}`;
}

export async function fetchSatelliteImageByDate(source: SatelliteSource, date: string): Promise<{ blob: Blob; date: string }> {
  const url = buildProxyUrlForDate(source, date);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `No satellite image available for ${date}`);
  }
  const actualDate = res.headers.get('X-Satellite-Date') ?? date;
  const blob = await res.blob();
  return { blob, date: actualDate };
}