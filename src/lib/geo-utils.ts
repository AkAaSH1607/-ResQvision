/**
 * Geographic utilities: convert pixel zones within a satellite frame to
 * real-world lat/lon, then to human-readable local area names.
 *
 * Reverse-geocoding uses Nominatim (OpenStreetMap) — free, no API key.
 * Results are cached in localStorage so repeated zone lookups stay
 * instant and frugal (zero extra network cost on re-render).
 *
 * India bounding box (WGS84): south, west, north, east = 8, 68, 37, 98
 * — matches `SATELLITE_SOURCES[...].bbox` in live-feed.ts.
 */

export interface GeoBBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const INDIA_BBOX: GeoBBox = { south: 8, west: 68, north: 37, east: 98 };

export function parseBBox(bbox: string): GeoBBox | null {
  const parts = bbox.split(',').map(s => Number(s.trim()));
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return null;
  const [south, west, north, east] = parts;
  return { south, west, north, east };
}

/**
 * Maps a pixel bounding box (within the image) to a real-world lat/lon
 * centroid using the frame's geographic bounding box.
 *
 * The frame renders the geographic bbox with an equirectangular mapping
 * (lon maps linearly to x, lat maps linearly to y), which matches how the
 * map tiles are drawn. Pixel coordinates (x0,y0)-(x1,y1) therefore convert
 * directly to the corresponding geographic window.
 */
export function zoneCenterGeo(
  bbox: GeoBBox,
  zoneBbox: { x0: number; y0: number; x1: number; y1: number },
  imageWidth: number,
  imageHeight: number
): { lat: number; lon: number } {
  const cx = (zoneBbox.x0 + zoneBbox.x1) / 2 / imageWidth;
  const cy = (zoneBbox.y0 + zoneBbox.y1) / 2 / imageHeight;
  const lon = bbox.west + cx * (bbox.east - bbox.west);
  const lat = bbox.north - cy * (bbox.north - bbox.south);
  return { lat, lon };
}

/** Nominatim reverse-geocode with localStorage caching and polite 1s spacing. */
let lastNominatimCall = 0;
export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<string | null> {
  const key = `geo:${lat.toFixed(1)},${lon.toFixed(1)}`;
  const cached = localStorage.getItem(key);
  if (cached) return cached === 'null' ? null : cached;

  try {
    // Respect Nominatim's usage policy (<=1 req/s).
    const now = Date.now();
    const wait = Math.max(0, 1050 - (now - lastNominatimCall));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastNominatimCall = Date.now();

    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json` +
      `&lat=${lat}&lon=${lon}&zoom=11&addressdetails=1` +
      `&accept-language=en`;
    const res = await fetch(url, { headers: { 'User-Agent': 'ResQvision-Hackathon/1.0' } });
    if (!res.ok) { localStorage.setItem(key, 'null'); return null; }
    const data = await res.json();
    const a = data?.address ?? {};

    // Build a concise local name: suburb/hamlet/village → city/town → district → state
    const place =
      a.suburb || a.quarter || a.neighbourhood ||
      a.hamlet || a.village || a.town || a.city ||
      a.county || a.district;
    const region = a.state_district || a.state;
    const name = place ? (region ? `${place}, ${region}` : place) : region ?? null;

    localStorage.setItem(key, name ?? 'null');
    return name;
  } catch {
    return null;
  }
}

/**
 * Resolves human-readable local names for every zone in a region analysis.
 * Uses a GeoBBox string (e.g. "8,68,37,98") and image dimensions; returns
 * a map from zone name -> local area label (falls back to the zone name).
 */
export async function resolveZoneLocalNames(params: {
  bbox: string;
  width: number;
  height: number;
  zones: { name: string; x0: number; y0: number; x1: number; y1: number }[];
}): Promise<Map<string, string>> {
  const geo = parseBBox(params.bbox);
  const out = new Map<string, string>();
  if (!geo) {
    for (const z of params.zones) out.set(z.name, z.name);
    return out;
  }

  // Only the worst zone needs a network lookup (keep it frugal + fast).
  const results = await Promise.all(
    params.zones.map(async z => {
      const { lat, lon } = zoneCenterGeo(geo, z, params.width, params.height);
      const local = await reverseGeocode(lat, lon);
      return { name: z.name, local };
    })
  );
  for (const r of results) {
    out.set(r.name, r.local ? `${r.name} — near ${r.local}` : r.name);
  }
  return out;
}
