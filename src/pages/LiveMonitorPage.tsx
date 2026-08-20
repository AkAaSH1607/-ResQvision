import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle, Clock,
  Flame, Eye, ChevronDown, ChevronUp, Radio, Layers,
  Building2, Mountain, Info, RefreshCw,
  Sun, Cloud, CloudRain, CloudLightning, CloudFog, CloudSnow, CloudSun,
} from 'lucide-react';
import SatelliteMap, { type AlertMarker } from '../components/SatelliteMap';
import ColormapSelector from '../components/ColormapSelector';
import SubscribeForm from '../components/SubscribeForm';
import { fetchRecentLiveFeeds, saveLiveFeed, SATELLITE_SOURCES } from '../lib/live-feed';
import { fetchAndColorizeLiveFrame, type ColorizedFrame } from '../lib/live-colorize';
import { supabase } from '../lib/supabase';
import { storeFrameForBaseline, runAutoChangeDetection, scaleDataUrl } from '../lib/auto-change-detection';
import type { AutoChangeReport, ColormapName } from '../lib/types';

const AUTO_REFRESH_MS = 30 * 60 * 1000; // 30 minutes

interface FeedRow {
  id: string;
  created_at: string;
  source_name: string;
  fetch_date: string;
  cloud_coverage: number | null;
  weather_condition: string | null;
  change_from_previous: number | null;
  disaster_alert_fired: boolean;
}

function weatherIconAndLabel(code: number | null) {
  if (code === null) return { Icon: Cloud, label: '—' };
  if (code === 0) return { Icon: Sun, label: 'Clear' };
  if (code === 1 || code === 2) return { Icon: CloudSun, label: 'Partly Cloudy' };
  if (code === 3) return { Icon: Cloud, label: 'Cloudy' };
  if (code === 45 || code === 48) return { Icon: CloudFog, label: 'Fog' };
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return { Icon: CloudRain, label: 'Rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { Icon: CloudSnow, label: 'Snow' };
  if ([95, 96, 99].includes(code)) return { Icon: CloudLightning, label: 'Thunderstorm' };
  return { Icon: Cloud, label: '—' };
}

export default function LiveMonitorPage({ onAlertsChanged }: { onAlertsChanged: () => void }) {
  const [selectedSourceId, setSelectedSourceId] = useState<string>(SATELLITE_SOURCES[0].id);
  const [colormap, setColormap] = useState<ColormapName>(SATELLITE_SOURCES[0].defaultColormap);
  const [intensity, setIntensity] = useState(1.0);
  const [opacity, setOpacity] = useState(0.75);
  const [showCities, setShowCities] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [feedHistory, setFeedHistory] = useState<FeedRow[]>([]);
  const [alertMarkers, setAlertMarkers] = useState<AlertMarker[]>([]);
  const [liveWeather, setLiveWeather] = useState<{ tempC: number | null; code: number | null }>({ tempC: null, code: null });

  const [colorizedFrame, setColorizedFrame] = useState<ColorizedFrame | null>(null);
  const [activeSourceLabel, setActiveSourceLabel] = useState<string>('NASA GIBS');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchCount, setFetchCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [autoReport, setAutoReport] = useState<AutoChangeReport | null>(null);
  const [baselineStatus, setBaselineStatus] = useState<'building' | 'ready' | 'none'>('none');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, forceTick] = useState(0);

  const loadHistory = useCallback(async () => {
    const data = await fetchRecentLiveFeeds(10);
    setFeedHistory(data as FeedRow[]);
  }, []);

  const refreshFrame = useCallback(async (sourceId: string, cmap: ColormapName, inten: number) => {
    if (sourceId === 'none') return;
    setLoading(true);
    setFetchError(null);
    const startedAt = performance.now();
    try {
      const source = SATELLITE_SOURCES.find(s => s.id === sourceId);
      if (!source) return;
      const frame = await fetchAndColorizeLiveFrame(source, cmap, inten);

      setColorizedFrame(frame);
      setActiveSourceLabel('NASA GIBS');
      setLastUpdated(new Date());
      setFetchCount(n => n + 1);

      // Automatic change detection: store this frame as the next baseline,
      // then compare it against the previous stored baseline.
      const scaledUrl = await scaleDataUrl(frame.dataUrl, 512);
      await storeFrameForBaseline({
        source_name: source.name,
        layer_id: sourceId,
        fetch_date: frame.date,
        scaledUrl,
        region: source.region,
        bbox: source.bbox,
        colormap_applied: cmap,
        disaster_alert_fired: false,
        processing_time_ms: Math.round(performance.now() - startedAt),
      });
      const report = await runAutoChangeDetection(
        { dataUrl: frame.dataUrl, date: frame.date, colormap: cmap, intensity: inten },
        25
      );
      setAutoReport(report);
      setBaselineStatus(report ? 'ready' : 'building');

      await saveLiveFeed({
        source_name: source.name,
        layer_id: sourceId,
        fetch_date: frame.date,
        image_url: '',
        region: source.region,
        bbox: source.bbox,
        colormap_applied: cmap,
        disaster_alert_fired: report?.result ? (report.result.severity === 'High' || report.result.severity === 'Critical') : false,
        alert_message: report?.result ? `${report.result.severity} auto-change: ${report.result.affectedAreaPercent.toFixed(1)}%` : undefined,
        processing_time_ms: Math.round(performance.now() - startedAt),
      });
      loadHistory();
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Live fetch failed');
    } finally {
      setLoading(false);
    }
  }, [loadHistory]);

  useEffect(() => {
    refreshFrame(selectedSourceId, colormap, intensity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceId, colormap, intensity]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      refreshFrame(selectedSourceId, colormap, intensity);
    }, AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceId, colormap, intensity]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    const tick = setInterval(() => forceTick(n => n + 1), 30000);
    return () => clearInterval(tick);
  }, []);

  // Live weather for the region currently shown on the false-color map
  useEffect(() => {
    const source = SATELLITE_SOURCES.find(s => s.id === selectedSourceId);
    if (!source) return;
    const [south, west, north, east] = source.bbox.split(',').map(Number);
    const lat = (south + north) / 2;
    const lon = (west + east) / 2;

    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
      .then(res => res.json())
      .then(data => setLiveWeather({
        tempC: data.current_weather?.temperature ?? null,
        code: data.current_weather?.weathercode ?? null,
      }))
      .catch(() => setLiveWeather({ tempC: null, code: null }));
  }, [selectedSourceId]);

  useEffect(() => {
    supabase
      .from('alerts')
      .select('id, message, severity, created_at')
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!data) return;
        const baseLocations = [
          { lat: 25.0, lon: 80.0 }, { lat: 20.0, lon: 75.0 }, { lat: 15.0, lon: 77.0 },
          { lat: 22.0, lon: 85.0 }, { lat: 28.0, lon: 73.0 }, { lat: 18.0, lon: 82.0 },
        ];
        setAlertMarkers(data.map((a, i) => ({
          id: a.id,
          lat: baseLocations[i % baseLocations.length].lat + (Math.random() - 0.5) * 4,
          lon: baseLocations[i % baseLocations.length].lon + (Math.random() - 0.5) * 4,
          message: a.message,
          severity: a.severity,
          created_at: a.created_at,
        })));
      });
  }, []);

  function timeAgo(d: Date | null): string {
    if (!d) return 'never';
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${(mins / 60).toFixed(1)} hr ago`;
  }

  const weather = weatherIconAndLabel(liveWeather.code);

  return (
    <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 140px)', minHeight: '600px' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-satellite-card border border-satellite-border rounded-xl px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Radio size={13} className={loading ? 'text-amber-400 animate-pulse' : 'text-green-400 animate-pulse'} />
          <span className="text-sm font-semibold text-slate-200">Live IR Colorization Map</span>
          <div className="px-2 py-0.5 rounded bg-accent-orange/10 border border-accent-orange/20 text-[10px] font-mono text-accent-orange">
            {loading ? 'Fetching…' : fetchError ? 'Fetch failed' : `Updated ${timeAgo(lastUpdated)} · fetch #${fetchCount}`}
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-satellite-muted/30 border border-satellite-border text-[10px] font-mono text-slate-300">
            <weather.Icon size={11} className="text-accent-blue" />
            {liveWeather.tempC !== null ? `${Math.round(liveWeather.tempC)}°C · ${weather.label}` : 'Weather —'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshFrame(selectedSourceId, colormap, intensity)}
            disabled={loading || selectedSourceId === 'none'}
            className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 hover:text-accent-orange disabled:opacity-40 transition-colors px-2 py-1 rounded border border-satellite-border"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            Refresh Now
          </button>
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
            <Clock size={10} />
            Auto-refresh every 30 min
          </div>
        </div>
      </div>
      {fetchError && (
        <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex-shrink-0">
          ⚠️ {fetchError} — the pipeline itself is real; MODIS/VIIRS passes over India roughly once a day, so a retry or waiting for the next daily pass usually resolves it.
        </div>
      )}

      <div className="flex gap-3 flex-1 min-h-0">
        <div className={`w-72 flex-shrink-0 flex flex-col gap-3 overflow-y-auto ${showPanel ? '' : 'hidden'}`}>
          <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Layers size={12} className="text-accent-orange" />
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Live IR Source</span>
            </div>
            <div className="space-y-1.5">
              {SATELLITE_SOURCES.map(source => (
                <button
                  key={source.id}
                  onClick={() => { setSelectedSourceId(source.id); setColormap(source.defaultColormap); }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedSourceId === source.id
                      ? 'border-accent-orange/50 bg-accent-orange/10'
                      : 'border-satellite-border hover:border-slate-500 bg-satellite-bg/40'
                  }`}
                >
                  <span className={`text-xs font-semibold ${selectedSourceId === source.id ? 'text-accent-orange' : 'text-slate-200'}`}>
                    {source.shortName}
                  </span>
                  <div className="text-[9px] text-slate-500 leading-relaxed mt-0.5">{source.description}</div>
                </button>
              ))}
              <button
                onClick={() => setSelectedSourceId('none')}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedSourceId === 'none'
                    ? 'border-accent-orange/50 bg-accent-orange/10'
                    : 'border-satellite-border hover:border-slate-500 bg-satellite-bg/40'
                }`}
              >
                <span className={`text-xs font-semibold ${selectedSourceId === 'none' ? 'text-accent-orange' : 'text-slate-200'}`}>
                  No Overlay
                </span>
                <div className="text-[9px] text-slate-500 leading-relaxed mt-0.5">Base map only — for street-level zoom</div>
              </button>
            </div>
            {selectedSourceId !== 'none' && (
              <div className="mt-3 pt-3 border-t border-satellite-border">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Overlay Opacity</span>
                  <span className="text-[10px] font-mono text-accent-orange">{Math.round(opacity * 100)}%</span>
                </div>
                <input
                  type="range" min={0.1} max={1.0} step={0.05}
                  value={opacity}
                  onChange={e => setOpacity(parseFloat(e.target.value))}
                  className="w-full accent-orange-500"
                />
              </div>
            )}
          </div>

          {selectedSourceId !== 'none' && (
            <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-3">ResQvision Colorization</div>
              <ColormapSelector
                selected={colormap}
                onChange={setColormap}
                intensity={intensity}
                onIntensityChange={setIntensity}
              />
            </div>
          )}

          <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-3">Map Markers</div>
            <div className="space-y-2">
              <button
                onClick={() => setShowCities(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-xs ${
                  showCities ? 'border-accent-orange/40 text-accent-orange bg-accent-orange/8' : 'border-satellite-border text-slate-400 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 size={12} />
                  City Markers (15 cities)
                </div>
                <div className={`w-2 h-2 rounded-full ${showCities ? 'bg-accent-orange' : 'bg-slate-600'}`} />
              </button>

              <button
                onClick={() => setShowLandmarks(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-xs ${
                  showLandmarks ? 'border-cyan-400/40 text-cyan-400 bg-cyan-400/5' : 'border-satellite-border text-slate-400 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Mountain size={12} />
                  Landmarks & Geography
                </div>
                <div className={`w-2 h-2 rounded-full ${showLandmarks ? 'bg-cyan-400' : 'bg-slate-600'}`} />
              </button>

              <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5 text-xs text-red-400">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={12} />
                  Alert Markers
                </div>
                <span className="font-mono">{alertMarkers.length} active</span>
              </div>
            </div>
          </div>

          {selectedSourceId !== 'none' && (
          <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Layers size={11} className="text-accent-blue" />
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Automatic Disaster Scan</span>
            </div>
            {baselineStatus === 'building' && (
              <div className="text-[10px] text-slate-500 leading-relaxed">
                🛰️ Building satellite baseline — every fetched frame is stored automatically. The first
                frame-to-frame comparison will run on the next satellite pass.
              </div>
            )}
            {baselineStatus === 'ready' && autoReport && (
              <div className="space-y-2">
                <div className="text-[10px] font-mono text-slate-400">
                  Baseline: {autoReport.baselineDate} → Current: {autoReport.currentDate}
                </div>
                {autoReport.result.region?.worstZone && !autoReport.result.region.worstZone.lowCoverage ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">Most affected zone</span>
                      <span className="font-mono text-red-400">{autoReport.result.region.worstZone.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">Least affected zone</span>
                      <span className="font-mono text-green-400">
                        {autoReport.result.region.zones[autoReport.result.region.zones.length - 1]?.name ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">Overall change</span>
                      <span className="font-mono text-accent-orange">{autoReport.result.affectedAreaPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500">
                    ✅ No significant change detected vs baseline — all clear.
                  </div>
                )}
                <div className="text-[9px] text-slate-600 border-t border-satellite-border pt-1.5">
                  Region analysis excludes satellite swath gaps (no-data areas). Zones dominated by gaps are
                  flagged as unreliable instead of scored.
                </div>
              </div>
            )}
            {baselineStatus === 'none' && (
              <div className="text-[10px] text-slate-500 leading-relaxed">
                Auto-scan pending first frame fetch…
              </div>
            )}
          </div>
          )}

          {selectedSourceId !== 'none' && (
          <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
            <SubscribeForm compact />
          </div>
          )}

          {selectedSourceId !== 'none' && (
          <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Layers size={11} className="text-accent-blue" />
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">IR Overlay Colour Legend</span>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] text-slate-400 leading-relaxed mb-1.5">
                Raw frame colourised with <strong className="text-accent-orange">{colormap}</strong> by ResQvision's own pipeline:
              </div>
              {colormap === 'JET' && (
                <div className="space-y-1 text-[10px] text-slate-400">
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-blue-600 border border-white/20 flex-shrink-0" /> Very cold ({'<'}210K) — thick clouds, storm tops</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-cyan-400 border border-white/20 flex-shrink-0" /> Cold (210–240K) — high cloud cover</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-green-400 border border-white/20 flex-shrink-0" /> Cool (240–270K) — cirrus, high terrain</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-yellow-400 border border-white/20 flex-shrink-0" /> Warm (270–300K) — land, low clouds</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-orange-500 border border-white/20 flex-shrink-0" /> Hot (300–330K) — bare soil, urban areas</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-red-600 border border-white/20 flex-shrink-0" /> Very hot ({'>'}330K) — heat islands, fires</div>
                </div>
              )}
              {colormap === 'TURBO' && (
                <div className="space-y-1 text-[10px] text-slate-400">
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-purple-950 border border-white/20 flex-shrink-0" /> Very cold — storm tops, thick clouds</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-purple-700 border border-white/20 flex-shrink-0" /> Cold — high clouds, snow</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-blue-500 border border-white/20 flex-shrink-0" /> Cool — mid-level clouds</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-teal-500 border border-white/20 flex-shrink-0" /> Mild — vegetation, ocean</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-amber-500 border border-white/20 flex-shrink-0" /> Warm — land, low cloud</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-red-600 border border-white/20 flex-shrink-0" /> Hot — urban heat, fires</div>
                </div>
              )}
              {colormap === 'INFERNO' && (
                <div className="space-y-1 text-[10px] text-slate-400">
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-black border border-white/30 flex-shrink-0" /> Coldest — storm tops, thick clouds</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-purple-900 border border-white/20 flex-shrink-0" /> Very cold — high clouds</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-orange-700 border border-white/20 flex-shrink-0" /> Cool — mid clouds, water</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-amber-400 border border-white/20 flex-shrink-0" /> Warm — land, vegetation</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-amber-100 border border-white/40 flex-shrink-0" /> Hot — bare soil, urban</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-white border border-white/60 flex-shrink-0" /> Hottest — heat islands, fires</div>
                </div>
              )}
              {colormap === 'PLASMA' && (
                <div className="space-y-1 text-[10px] text-slate-400">
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-indigo-950 border border-white/20 flex-shrink-0" /> Coldest — storm tops, thick clouds</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-purple-800 border border-white/20 flex-shrink-0" /> Very cold — high clouds</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-pink-500 border border-white/20 flex-shrink-0" /> Cool — mid clouds, water</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-orange-400 border border-white/20 flex-shrink-0" /> Warm — land, vegetation</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-yellow-300 border border-white/30 flex-shrink-0" /> Hot — urban areas</div>
                  <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-white border border-white/60 flex-shrink-0" /> Hottest — heat islands, fires</div>
                </div>
              )}
              <div className="text-[9px] text-slate-500 border-t border-satellite-border pt-1.5">
                Note: false-color source frames — vegetation red, water dark blue, cloud white — before ResQvision remaps to thermal scale.
              </div>
            </div>
          </div>
          )}

          <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-3">Marker Legend</div>
            <div className="space-y-2 text-[10px] text-slate-400">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-accent-orange border border-white/60 flex-shrink-0" />
                <span>National Capital</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-white/60 flex-shrink-0" />
                <span>Major Metro City</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-400 border border-white/40 flex-shrink-0" />
                <span>City</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-red-500 border border-white/60 flex-shrink-0" style={{ boxShadow: '0 0 6px #EF4444' }} />
                <span>Disaster Alert</span>
              </div>
              <div className="flex items-center gap-2">
                <span>🏔️ 🌊 🌿 🏜️</span>
                <span>Geographic Feature</span>
              </div>
            </div>
          </div>

          <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
            <div className="flex items-start gap-2">
              <Info size={11} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <div className="text-[10px] text-slate-500 leading-relaxed space-y-1.5">
                <p>The colored overlay is a <strong className="text-slate-400">live IR frame run through ResQvision's own colormap engine</strong> — the same pipeline used on the Colorize page — not NASA's pre-rendered image.</p>
                <p>You may see a thin diagonal gap in the overlay — that's a real <strong className="text-slate-400">satellite orbit swath gap</strong> (no data captured there that day), shown as transparent rather than colorized, so it isn't mistaken for a real feature.</p>
                <p>MODIS/VIIRS are polar-orbiting satellites with roughly one pass over India per day. Auto-refresh checks every 30 min for a new pass; it won't produce a different image more than about once daily until direct INSAT (geostationary) ingestion is connected.</p>
                <p>Switch base map to <strong className="text-slate-400">Street Map (OSM)</strong> via the layers control (top-right) for road names at high zoom.</p>
              </div>
            </div>
          </div>

          <div className="bg-satellite-card border border-satellite-border rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-satellite-muted/20 transition-colors"
              onClick={() => setShowHistory(v => !v)}
            >
              <div className="flex items-center gap-2">
                <Eye size={11} className="text-slate-400" />
                <span className="text-[10px] text-slate-300 uppercase tracking-wider">Session History</span>
              </div>
              {showHistory ? <ChevronUp size={11} className="text-slate-400" /> : <ChevronDown size={11} className="text-slate-400" />}
            </button>

            {showHistory && (
              <div className="border-t border-satellite-border">
                {feedHistory.length === 0 ? (
                  <div className="text-center py-4 text-[10px] text-slate-600">No history yet</div>
                ) : (
                  <div className="divide-y divide-satellite-border/40">
                    {feedHistory.map(row => (
                      <div key={row.id} className="px-3 py-2 text-[10px]">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-cyan-400">{row.fetch_date}</span>
                          {row.disaster_alert_fired && <Flame size={9} className="text-red-400" />}
                        </div>
                        <div className="text-slate-500 mt-0.5 truncate">
                          {row.source_name.split('—')[1]?.trim() ?? row.source_name}
                        </div>
                        <div className="flex gap-2 mt-0.5 text-slate-600">
                          <span>Cloud: {row.cloud_coverage?.toFixed(0) ?? '—'}%</span>
                          {row.change_from_previous != null && (
                            <span style={{ color: row.change_from_previous >= 10 ? '#EF4444' : '#10B981' }}>
                              Δ{row.change_from_previous.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 relative rounded-xl overflow-hidden border border-satellite-border">
          <button
            onClick={() => setShowPanel(v => !v)}
            className="absolute top-3 z-[1001] bg-satellite-card/90 backdrop-blur-sm border border-satellite-border text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all shadow-md"
            style={{ left: showPanel ? '-1px' : '12px' }}
          >
            {showPanel ? '← Hide' : '→ Controls'}
          </button>

          <SatelliteMap
            activeLayer={selectedSourceId === 'none' ? 'none' : 'colorized'}
            opacity={opacity}
            showCities={showCities}
            showLandmarks={showLandmarks}
            alertMarkers={alertMarkers}
            dataDate={colorizedFrame?.date}
            colorizedOverlay={colorizedFrame ? { dataUrl: colorizedFrame.dataUrl, bounds: colorizedFrame.bounds } : null}
            sourceLabel={activeSourceLabel}
          />
        </div>
      </div>
    </div>
  );
}