import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, ImageOverlay, Marker, Popup, LayersControl, useMapEvents, ZoomControl } from 'react-leaflet';
import L from 'leaflet';

// Fix default marker icon path broken by Vite bundler
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Today's date in IST (UTC+5:30) — the badge shows the scan date (when the
// frame was analysed), not the NASA capture date, so users see "today".
function getTodayIST(): string {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const d = new Date(now.getTime() + istOffsetMs);
  return d.toISOString().split('T')[0];
}

// Custom divIcon markers for cities
function cityIcon(type: 'capital' | 'metro' | 'city'): L.DivIcon {
  const size = type === 'capital' ? 10 : type === 'metro' ? 8 : 6;
  const color = type === 'capital' ? '#FF6B35' : type === 'metro' ? '#F59E0B' : '#94A3B8';
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.8);box-shadow:0 0 6px ${color}88;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function alertIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#EF4444;border:2px solid #fff;box-shadow:0 0 12px #EF444488;animation:pulse 1.5s infinite;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const CITIES = [
  { name: 'New Delhi', lat: 28.6139, lon: 77.2090, type: 'capital' as const, pop: '32M — National Capital' },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777, type: 'metro' as const, pop: '21M — Financial Capital' },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639, type: 'metro' as const, pop: '15M — Eastern Hub' },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707, type: 'metro' as const, pop: '11M — Southern Gateway' },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946, type: 'metro' as const, pop: '13M — Tech Capital' },
  { name: 'Hyderabad', lat: 17.3850, lon: 78.4867, type: 'metro' as const, pop: '10M' },
  { name: 'Ahmedabad', lat: 23.0225, lon: 72.5714, type: 'city' as const, pop: '8M' },
  { name: 'Jaipur', lat: 26.9124, lon: 75.7873, type: 'city' as const, pop: '4M — Pink City' },
  { name: 'Pune', lat: 18.5204, lon: 73.8567, type: 'city' as const, pop: '7M' },
  { name: 'Lucknow', lat: 26.8467, lon: 80.9462, type: 'city' as const, pop: '4M' },
  { name: 'Srinagar', lat: 34.0837, lon: 74.7973, type: 'city' as const, pop: '1.5M — J&K' },
  { name: 'Guwahati', lat: 26.1445, lon: 91.7362, type: 'city' as const, pop: '1M — Northeast Gateway' },
  { name: 'Bhopal', lat: 23.2599, lon: 77.4126, type: 'city' as const, pop: '2.5M' },
  { name: 'Kochi', lat: 9.9312, lon: 76.2673, type: 'city' as const, pop: '2M — Kerala' },
  { name: 'Visakhapatnam', lat: 17.6868, lon: 83.2185, type: 'city' as const, pop: '2M — Naval Base' },
];

// Key geographic landmarks
const LANDMARKS = [
  { name: 'Bay of Bengal', lat: 14.0, lon: 86.0, icon: '🌊' },
  { name: 'Arabian Sea', lat: 15.0, lon: 67.0, icon: '🌊' },
  { name: 'Himalaya Range', lat: 31.0, lon: 79.0, icon: '🏔️' },
  { name: 'Thar Desert', lat: 27.0, lon: 71.5, icon: '🏜️' },
  { name: 'Western Ghats', lat: 13.5, lon: 75.5, icon: '🌿' },
  { name: 'Sundarbans', lat: 21.9, lon: 89.2, icon: '🌿' },
  { name: 'Chilika Lake', lat: 19.7, lon: 85.3, icon: '💧' },
];

function landmarkIcon(emoji: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:16px;filter:drop-shadow(0 0 4px rgba(0,0,0,0.8));cursor:default;">${emoji}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// Component that shows mouse coordinates and map move events
function MapEvents({ onCoords, onMove }: { onCoords: (lat: number, lng: number) => void, onMove?: (lat: number, lon: number) => void }) {
  useMapEvents({
    mousemove(e) { onCoords(e.latlng.lat, e.latlng.lng); },
    moveend(e) {
      const center = e.target.getCenter();
      if (onMove) onMove(center.lat, center.lng);
    },
  });
  return null;
}

export interface AlertMarker {
  id: string;
  lat: number;
  lon: number;
  message: string;
  severity: string;
  created_at: string;
}

interface SatelliteMapProps {
  activeLayer: string;
  opacity: number;
  showCities: boolean;
  showLandmarks: boolean;
  alertMarkers?: AlertMarker[];
  dataDate?: string;
  colorizedOverlay?: { dataUrl: string; bounds: [[number, number], [number, number]] } | null;
  sourceLabel?: string;
  onMove?: (lat: number, lon: number) => void;
}

export default function SatelliteMap({
  activeLayer,
  opacity,
  showCities,
  showLandmarks,
  alertMarkers = [],
  dataDate,
  colorizedOverlay = null,
  sourceLabel = 'NASA GIBS',
  onMove,
}: SatelliteMapProps) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const scanDate = getTodayIST();
  // The NASA frame captured ~24h before the scan (GIBS land products have a
  // ~1-day processing delay) — kept in the caption for traceability.
  const frameDate = dataDate ?? scanDate;

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        minZoom={4}
        maxZoom={18}
        style={{ width: '100%', height: '100%', background: '#0a1628' }}
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />

        <LayersControl position="topright">
          {/* Base layers */}
          <LayersControl.BaseLayer checked name="Satellite (Esri)">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Esri World Imagery"
              maxZoom={18}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Street Map (OSM)">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="OpenStreetMap contributors"
              maxZoom={18}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Dark (CartoDB)">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="CartoDB"
              maxZoom={18}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* ResQvision-colorized live IR overlay (replaces NASA's own pre-colored imagery) */}
        {activeLayer !== 'none' && colorizedOverlay && (
          <ImageOverlay
            key={colorizedOverlay.dataUrl.slice(0, 32)}
            url={colorizedOverlay.dataUrl}
            bounds={colorizedOverlay.bounds}
            opacity={opacity}
          />
        )}

        {/* City markers */}
        {showCities && CITIES.map(city => (
          <Marker key={city.name} position={[city.lat, city.lon]} icon={cityIcon(city.type)}>
            <Popup>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', minWidth: '140px' }}>
                <div style={{ fontWeight: 'bold', color: '#FF6B35', marginBottom: '4px' }}>{city.name}</div>
                <div style={{ color: '#64748B' }}>{city.pop}</div>
                <div style={{ color: '#94A3B8', marginTop: '4px', fontSize: '10px' }}>
                  {city.lat.toFixed(4)}°N, {city.lon.toFixed(4)}°E
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Geographic landmarks */}
        {showLandmarks && LANDMARKS.map(lm => (
          <Marker key={lm.name} position={[lm.lat, lm.lon]} icon={landmarkIcon(lm.icon)}>
            <Popup>
              <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                <div style={{ fontWeight: 'bold', color: '#60A5FA' }}>{lm.name}</div>
                <div style={{ color: '#94A3B8', fontSize: '10px', marginTop: '4px' }}>
                  {lm.lat.toFixed(2)}°N, {lm.lon.toFixed(2)}°E
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Alert markers */}
        {alertMarkers.map(a => (
          <Marker key={a.id} position={[a.lat, a.lon]} icon={alertIcon()}>
            <Popup>
              <div style={{ fontFamily: 'monospace', fontSize: '11px', maxWidth: '200px' }}>
                <div style={{ fontWeight: 'bold', color: '#EF4444', marginBottom: '4px' }}>
                  {a.severity.toUpperCase()} ALERT
                </div>
                <div style={{ color: '#374151' }}>{a.message}</div>
                <div style={{ color: '#9CA3AF', marginTop: '4px', fontSize: '10px' }}>
                  {new Date(a.created_at).toLocaleString('en-IN')}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        <MapEvents onCoords={(lat, lng) => setCoords({ lat, lng })} onMove={onMove} />
      </MapContainer>

      {/* Coordinate bar at bottom */}
      {coords && (
        <div className="absolute bottom-10 left-3 z-[1000] bg-black/80 backdrop-blur-sm border border-white/10 rounded px-2 py-1 font-mono text-[10px] text-white/70 pointer-events-none">
          {coords.lat.toFixed(6)}°N &nbsp; {coords.lng.toFixed(6)}°E
        </div>
      )}

      {/* Data date badge — compact single line */}
      <div className="absolute top-14 left-3 z-[1000] bg-black/75 backdrop-blur-sm border border-white/10 rounded-md px-2 py-1 pointer-events-none max-w-[220px]">
        <div className="text-[10px] font-semibold text-white leading-tight truncate">{scanDate}</div>
        <div className="text-[8px] text-white/40 font-mono truncate">
          {colorizedOverlay ? sourceLabel : 'ResQvision · MODIS Terra (GIBS)'}
        </div>
        <div className="text-[8px] text-white/40 font-mono truncate">
          Scan (IST) · {frameDate === scanDate ? 'latest frame' : `frame: ${frameDate}`}
        </div>
      </div>
    </div>
  );
}
