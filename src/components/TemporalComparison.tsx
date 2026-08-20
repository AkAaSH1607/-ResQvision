import { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar, ArrowRight, Landmark, X, Layers, Database } from 'lucide-react';
import type { ColormapName } from '../lib/types';
import { applyColormapToImageData } from '../lib/colormaps';
import { loadImageToCanvas } from '../lib/change-detection';

interface Props {
  colormap: ColormapName;
  intensity: number;
  currentDataUrl: string | null;
}

interface HistoricalImageData {
  originalData: ImageData;
  width: number;
  height: number;
}

/** Bundled sample archive imagery — simulates the agency's image archive.
 *  When the user picks a historical date, one of these loads automatically,
 *  so no manual second upload is needed. */
const ARCHIVE_SAMPLES = [
  {
    label: 'INSAT Thermal Archive',
    url: 'https://images.pexels.com/photos/87651/earth-blue-planet-globe-planet-87651.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    label: 'Landsat Desert Archive',
    url: 'https://images.pexels.com/photos/1169754/pexels-photo-1169754.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
  {
    label: 'Satellite Cloud Archive',
    url: 'https://images.pexels.com/photos/209831/pexels-photo-209831.jpeg?auto=compress&cs=tinysrgb&w=800',
  },
];

/** Colormap temperature meaning legend — shown on both comparison images. */
const COLORMAP_MEANING = {
  JET: [
    { color: '#0000FF', range: '< 210 K', label: 'Very Cold — high clouds, storm tops' },
    { color: '#00BFFF', range: '210–240 K', label: 'Cold — thick clouds' },
    { color: '#00FF00', range: '240–270 K', label: 'Cool — cirrus, high terrain' },
    { color: '#FFFF00', range: '270–300 K', label: 'Warm — land, low cloud' },
    { color: '#FF8000', range: '300–330 K', label: 'Hot — bare soil, urban areas' },
    { color: '#FF0000', range: '> 330 K', label: 'Very Hot — heat islands, active fires' },
  ],
  TURBO: [
    { color: '#30123B', range: 'Very Cold', label: 'Storm tops, thick clouds' },
    { color: '#6A1B9A', range: 'Cold', label: 'High clouds, snow' },
    { color: '#1E88E5', range: 'Cool', label: 'Mid-level clouds' },
    { color: '#26A69A', range: 'Mild', label: 'Vegetation, ocean' },
    { color: '#FFB300', range: 'Warm', label: 'Land, low cloud' },
    { color: '#E53935', range: 'Hot', label: 'Urban heat, fires' },
  ],
  INFERNO: [
    { color: '#000000', range: 'Coldest', label: 'Storm tops, thick clouds' },
    { color: '#440154', range: 'Very Cold', label: 'High clouds' },
    { color: '#D84B20', range: 'Cool', label: 'Mid clouds, water' },
    { color: '#FCA50A', range: 'Warm', label: 'Land, vegetation' },
    { color: '#FCFFA4', range: 'Hot', label: 'Bare soil, urban' },
    { color: '#FFFFFF', range: 'Hottest', label: 'Heat islands, fires' },
  ],
  PLASMA: [
    { color: '#0D0887', range: 'Coldest', label: 'Storm tops, thick clouds' },
    { color: '#7E03A8', range: 'Very Cold', label: 'High clouds' },
    { color: '#CC4778', range: 'Cool', label: 'Mid clouds, water' },
    { color: '#F89441', range: 'Warm', label: 'Land, vegetation' },
    { color: '#F0F921', range: 'Hot', label: 'Urban areas' },
    { color: '#FFFFFF', range: 'Hottest', label: 'Heat islands, fires' },
  ],
} as const;

export default function TemporalComparison({ colormap, intensity, currentDataUrl }: Props) {
  const [historicalDate, setHistoricalDate] = useState<string>('');
  const [historicalData, setHistoricalData] = useState<HistoricalImageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedFrom, setLoadedFrom] = useState<string>('');
  const [fetchError, setFetchError] = useState(false);

  const histCanvasRef = useRef<HTMLCanvasElement>(null);

  // Pick a (deterministic) archive sample based on the date string
  const pickSample = (dateStr: string) => {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) hash = (hash * 31 + dateStr.charCodeAt(i)) % ARCHIVE_SAMPLES.length;
    return ARCHIVE_SAMPLES[hash];
  };

  // Auto-load an archive image as soon as a historical date is picked
  const loadArchiveImage = useCallback(async (dateStr: string) => {
    if (!dateStr) return;
    const today = new Date().toISOString().slice(0, 10);
    if (dateStr >= today) {
      setHistoricalData(null);
      setFetchError(true);
      return;
    }
    setFetchError(false);
    setLoading(true);
    const sample = pickSample(dateStr);
    try {
      const response = await fetch(sample.url);
      const blob = await response.blob();
      const file = new File([blob], `archive-${dateStr}.jpg`, { type: 'image/jpeg' });
      const { imageData, width, height } = await loadImageToCanvas(file);
      setHistoricalData({ originalData: imageData, width, height });
      setLoadedFrom(sample.label);
    } catch (err) {
      console.error('Failed to load archive image:', err);
      setHistoricalData(null);
      setFetchError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadArchiveImage(historicalDate);
  }, [historicalDate, loadArchiveImage]);

  // Re-colorize historical image when colormap/intensity changes
  useEffect(() => {
    if (!historicalData || !histCanvasRef.current) return;
    const ctx = histCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const colorized = applyColormapToImageData(historicalData.originalData, colormap, intensity);
    histCanvasRef.current.width = historicalData.width;
    histCanvasRef.current.height = historicalData.height;
    ctx.putImageData(colorized, 0, 0);
  }, [colormap, intensity, historicalData]);

  // Optional manual override: user can still bring their own archive image
  const handleHistoricalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFetchError(false);

    try {
      const { imageData, width, height } = await loadImageToCanvas(file);
      setHistoricalData({ originalData: imageData, width, height });
      setLoadedFrom('Your upload');
    } catch (err) {
      console.error('Failed to process historical image:', err);
    }

    setLoading(false);
  };

  const clearHistorical = () => {
    setHistoricalData(null);
    setLoadedFrom('');
    const input = document.getElementById('historical-upload');
    if (input) (input as HTMLInputElement).value = '';
    if (historicalDate) loadArchiveImage(historicalDate);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const legend = COLORMAP_MEANING[colormap];

  return (
    <div className="bg-satellite-card border border-satellite-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-satellite-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-accent-orange" />
          <span className="text-xs text-slate-300 uppercase tracking-wider">Temporal Comparison</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent-blue/10 border border-accent-blue/20 text-[9px] text-accent-blue font-mono">
          <Landmark size={9} />
          Compare current image with any past date
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Controls: date + current reference + optional manual upload */}
        <div className="flex flex-col md:flex-row gap-3">
          {/* Historical date — picking one auto-loads the archive image */}
          <div className="flex-1 flex items-center gap-2 bg-satellite-bg/60 rounded-lg px-3 py-2 border border-satellite-border">
            <Calendar size={12} className="text-blue-400 flex-shrink-0" />
            <label className="text-[11px] text-slate-400 whitespace-nowrap">Historical Date:</label>
            <input
              type="date"
              value={historicalDate}
              onChange={(e) => setHistoricalDate(e.target.value)}
              className="flex-1 bg-transparent text-xs text-white focus:outline-none min-w-0"
            />
          </div>

          {/* Current reference */}
          <div className="flex-1 flex items-center gap-2 bg-satellite-bg/60 rounded-lg px-3 py-2 border border-satellite-border">
            <Layers size={12} className="text-green-400 flex-shrink-0" />
            <label className="text-[11px] text-slate-400 whitespace-nowrap">Current Reference:</label>
            <span className="text-xs text-green-400 font-mono truncate">
              {formatDate(new Date().toISOString().slice(0, 10))} — loaded from processed image
            </span>
          </div>

          {/* Optional manual archive upload */}
          <div className="flex-1">
            <input
              type="file"
              accept="image/*"
              onChange={handleHistoricalUpload}
              className="hidden"
              id="historical-upload"
            />
            {loadedFrom && loadedFrom !== 'Your upload' ? (
              <button
                onClick={() => document.getElementById('historical-upload')?.click()}
                className="w-full px-3 py-2 rounded-lg border border-dashed border-blue-500/40 text-xs text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center justify-center gap-2"
              >
                📄 Archive image loaded — click to replace
              </button>
            ) : (
              <button
                onClick={() => document.getElementById('historical-upload')?.click()}
                className="w-full px-3 py-2 rounded-lg border border-dashed border-satellite-border text-xs text-slate-400 hover:border-accent-orange/50 hover:text-accent-orange transition-colors"
              >
                Or upload your own archive image
              </button>
            )}
          </div>
        </div>

        {/* Archive loading status */}
        {historicalDate && !historicalData && !loading && fetchError && (
          <div className="text-center py-3 text-[11px] text-amber-400 border border-dashed border-amber-500/40 rounded-lg">
            ⚠ Pick a date earlier than today ({formatDate(new Date().toISOString().slice(0, 10))}) to load the archive image.
          </div>
        )}

        {historicalDate && !historicalData && loading && (
          <div className="flex items-center justify-center gap-2 py-3">
            <div className="w-4 h-4 border-2 border-accent-orange border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] text-slate-400">Loading archive image for {formatDate(historicalDate)}…</span>
          </div>
        )}

        {/* Side-by-side comparison — shown once a historical image exists */}
        {historicalData && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono uppercase">
              <span className="px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300">
                {formatDate(historicalDate) || 'Historical'}
              </span>
              <ArrowRight size={12} className="text-accent-orange" />
              <span className="px-2 py-0.5 rounded bg-green-500/15 border border-green-500/30 text-green-300">Today</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Historical image */}
              <div className="relative rounded-lg overflow-hidden border border-satellite-border bg-satellite-bg">
                <div className="absolute top-2 left-2 px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-[10px] text-blue-300 font-mono z-10">
                  {formatDate(historicalDate) || 'Historical'}
                </div>
                {loadedFrom && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-satellite-bg/80 border border-satellite-border rounded text-[10px] text-slate-400 font-mono z-10">
                    <Database size={9} className="text-blue-400" />
                    Archive
                  </div>
                )}
                <canvas
                  ref={histCanvasRef}
                  className="w-full max-h-[420px] object-contain"
                  style={{ imageRendering: 'auto' }}
                />
              </div>

              {/* Current image */}
              <div className="relative rounded-lg overflow-hidden border border-satellite-border bg-satellite-bg">
                <div className="absolute top-2 left-2 px-2 py-1 bg-green-500/20 border border-green-500/30 rounded text-[10px] text-green-300 font-mono z-10">
                  Current — Today
                </div>
                {currentDataUrl && (
                  <img
                    src={currentDataUrl}
                    alt="Current colorized"
                    className="w-full max-h-[420px] object-contain"
                  />
                )}
                {!currentDataUrl && (
                  <div className="w-full min-h-[200px] flex items-center justify-center text-[10px] text-slate-600">
                    Upload first
                  </div>
                )}
              </div>
            </div>

            {/* What changed summary */}
            <div className="text-[10px] text-slate-500 font-mono border-t border-satellite-border pt-2 flex flex-wrap gap-x-6 gap-y-1">
              <span>LEFT: <span className="text-blue-300">{formatDate(historicalDate) || 'Historical image'} (archive)</span></span>
              <span>RIGHT: <span className="text-green-300">Current colorized output</span></span>
              <span>Both run through the same {colormap} colormap for fair comparison</span>
            </div>
          </div>
        )}

        {!historicalData && !historicalDate && (
          <div className="text-center py-4 text-[11px] text-slate-500 border border-dashed border-satellite-border rounded-lg">
            📅 Pick a historical date above — the archive image for that date loads automatically, then appears side-by-side with today's image.
          </div>
        )}

        {/* Colour meaning legend */}
        <div className="bg-satellite-bg/50 rounded-lg border border-satellite-border p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Layers size={11} className="text-accent-blue" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Colour Legend — what each colour means ({colormap})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
            {legend.map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-4 h-3 rounded-sm border border-white/20 flex-shrink-0" style={{ background: item.color }} />
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-300">{item.label}</span>
                  <span className="text-[9px] text-slate-500 ml-1">({item.range})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
