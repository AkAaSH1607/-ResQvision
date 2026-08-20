import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, Download, ArrowRight, MapPin, Satellite, Radio } from 'lucide-react';
import { detectChanges } from '../lib/change-detection';
import type { AutoChangeReport, ChangeDetectionResult } from '../lib/types';
import { saveAnalysis, saveAlerts } from '../lib/supabase';
import {
  storeFrameForBaseline,
  runAutoChangeDetection,
  scaleDataUrl,
} from '../lib/auto-change-detection';
import { fetchAndColorizeLiveFrame, type ColorizedFrame } from '../lib/live-colorize';
import { SATELLITE_SOURCES } from '../lib/live-feed';
import type { ColormapName } from '../lib/types';

const SEVERITY_COLORS: Record<string, string> = {
  None: '#10B981',
  Low: '#84CC16',
  Moderate: '#F59E0B',
  High: '#EF4444',
  Critical: '#DC2626',
};

function zoneColor(pct: number) {
  if (pct >= 30) return '#EF4444';
  if (pct >= 15) return '#F59E0B';
  if (pct > 0) return '#84CC16';
  return '#64748B';
}

export default function ChangeDetectionPage({ onAlertsChanged }: { onAlertsChanged: () => void }) {
  const [result, setResult] = useState<ChangeDetectionResult | null>(null);
  const [report, setReport] = useState<AutoChangeReport | null>(null);
  const [processing, setProcessing] = useState(false);
  const [threshold, setThreshold] = useState(25);
  const [phase, setPhase] = useState<'no-baseline' | 'building' | 'ready' | 'error'>('no-baseline');
  const [latestFrame, setLatestFrame] = useState<ColorizedFrame | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const changeCanvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Render the change map (red = most affected, green-tinted least affected zone overlay)
  const renderChangeMap = useCallback((det: ChangeDetectionResult, fresh: ColorizedFrame) => {
    const canvas = changeCanvasRef.current;
    if (!canvas) return;
    const w = Math.min(fresh.width, 720);
    const scale = w / fresh.width;
    const h = Math.round(fresh.height * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Draw the fresh colorized frame scaled
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);

      // Overlay: most-affected zone = red translucent box with label
      const wz = det.region?.worstZone;
      if (wz && !wz.lowCoverage) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
        ctx.fillRect(wz.bbox.x0 * scale, wz.bbox.y0 * scale, (wz.bbox.x1 - wz.bbox.x0) * scale, (wz.bbox.y1 - wz.bbox.y0) * scale);
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(wz.bbox.x0 * scale, wz.bbox.y0 * scale, (wz.bbox.x1 - wz.bbox.x0) * scale, (wz.bbox.y1 - wz.bbox.y0) * scale);
        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillText(`MOST AFFECTED: ${wz.name} (${wz.changePercent}% changed)`, wz.bbox.x0 * scale + 6, wz.bbox.y0 * scale + 18);
      }

      // Overlay: least-affected zone = green translucent box with label
      const least = det.region?.zones.slice().sort((a, b) => a.changePercent - b.changePercent)[0];
      if (least && least.changePercent >= 0 && (!wz || least.name !== wz.name)) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
        ctx.fillRect(least.bbox.x0 * scale, least.bbox.y0 * scale, (least.bbox.x1 - least.bbox.x0) * scale, (least.bbox.y1 - least.bbox.y0) * scale);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2;
        ctx.strokeRect(least.bbox.x0 * scale, least.bbox.y0 * scale, (least.bbox.x1 - least.bbox.x0) * scale, (least.bbox.y1 - least.bbox.y0) * scale);
        ctx.fillStyle = '#10B981';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillText(`LEAST AFFECTED: ${least.name} (${least.changePercent}% changed)`, least.bbox.x0 * scale + 6, least.bbox.y1 * scale - 8);
      }
    };
    img.src = fresh.dataUrl;
  }, []);

  // Main automatic loop: fetch fresh frame → store as next baseline → compare vs previous baseline
  const runAutoScan = useCallback(async () => {
    setProcessing(true);
    setErrorMessage('');
    try {
      const source = SATELLITE_SOURCES[0];
      const colormap = source.defaultColormap as ColormapName;
      const frame = await fetchAndColorizeLiveFrame(source, colormap, 1.0);
      setLatestFrame(frame);

      // Store this frame as the next baseline (keeps only last 3, auto-cleanup)
      const scaledUrl = await scaleDataUrl(frame.dataUrl, 512);
      await storeFrameForBaseline({
        source_name: source.name,
        layer_id: source.id,
        fetch_date: frame.date,
        scaledUrl,
        region: source.region,
        bbox: source.bbox,
        colormap_applied: colormap,
        disaster_alert_fired: false,
      });

      // Compare fresh frame against the previously stored baseline
      const autoReport = await runAutoChangeDetection({ dataUrl: frame.dataUrl, date: frame.date, colormap, intensity: 1.0 }, threshold);

      // Also run region analysis for the UI breakdown (auto path uses severity-only alerts)
      if (autoReport) {
        const det = autoReport.result;
        setResult(det);
        setReport(autoReport);
        setPhase('ready');
        renderChangeMap(det, frame);

        // Persist analysis record + alerts with the exact affected region
        const record = await saveAnalysis({
          image_name: `AUTO: baseline ${autoReport.baselineDate} vs ${autoReport.currentDate}`,
          analysis_type: 'change_detection',
          affected_area_percent: det.affectedAreaPercent,
          change_severity: det.severity,
          image_width: Math.min(frame.width, frame.height ? frame.width : 1),
          image_height: frame.height,
          processing_time_ms: 0,
          satellite_type: 'Sentinel-1',
          metadata: { threshold, automatic: true, baselineDate: autoReport.baselineDate },
        });
        if (record && (det.severity === 'High' || det.severity === 'Critical')) {
          const wz = det.region?.worstZone;
          const regionMsg = wz
            ? ` — worst affected zone: ${wz.name} (${wz.bbox.x0},${wz.bbox.y0})→(${wz.bbox.x1},${wz.bbox.y1}), ${wz.changePercent}% of zone pixels changed (intensity ${wz.intensity}/255)`
            : '';
          await saveAlerts(record.id, [{
            alert_type: 'change_detected',
            severity: det.severity.toLowerCase(),
            message: `${det.severity} change detected: ${det.affectedAreaPercent.toFixed(1)}% of area affected${regionMsg}`,
          }]);
          onAlertsChanged();
        }
      } else {
        setPhase('building');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Automatic scan failed');
      setPhase('error');
    } finally {
      setProcessing(false);
    }
  }, [threshold, onAlertsChanged, renderChangeMap]);

  useEffect(() => {
    runAutoScan();
    intervalRef.current = setInterval(runAutoScan, 30 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runAutoScan]);

  const downloadChangeMap = () => {
    if (!changeCanvasRef.current) return;
    const link = document.createElement('a');
    link.download = `disaster_map_${Date.now()}.png`;
    link.href = changeCanvasRef.current.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className="bg-satellite-card border border-satellite-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Radio size={15} className={phase === 'building' ? 'text-accent-orange animate-pulse' : 'text-green-400'} />
          <div>
            <div className="text-xs font-semibold text-slate-200">
              Automatic Disaster Detection — {phase === 'no-baseline' ? 'Waiting for first satellite frame' : phase === 'building' ? 'Building satellite baseline' : phase === 'error' ? 'Scan error' : 'Active & Monitoring'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {phase === 'no-baseline' && 'The first fetch stores the baseline frame. Frame-to-frame comparison starts on the next satellite pass.'}
              {phase === 'building' && 'Baseline stored. Fetching and comparing the fresh frame now…'}
              {phase === 'ready' && report && `Comparing ${report.currentDate} against baseline ${report.baselineDate}.`}
              {phase === 'error' && errorMessage}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Satellite size={12} className="text-slate-500" />
          <span className="text-[10px] font-mono text-slate-500">NASA GIBS · MODIS Terra · auto-refresh 30min</span>
        </div>
      </div>

      {/* Damage map */}
      <div className="bg-satellite-card border border-satellite-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-satellite-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-xs text-slate-300">Damage Map — Most & Least Affected Regions</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500/60 border border-red-400" /> Most affected
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/60 border border-emerald-400 ml-2" /> Least affected
            </span>
            {result && (
              <button onClick={downloadChangeMap} className="p-1 rounded hover:bg-satellite-muted/50 transition-colors">
                <Download size={12} className="text-slate-400" />
              </button>
            )}
          </div>
        </div>
        <div className="p-4">
          <div className="relative rounded-lg overflow-hidden bg-satellite-bg flex items-center justify-center" style={{ minHeight: 320 }}>
            {processing && (
              <div className="absolute inset-0 flex items-center justify-center bg-satellite-bg/90 z-10">
                <div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!result && !processing && (
              <div className="text-center p-4">
                <ArrowRight size={24} className="text-slate-600 mx-auto mb-2" />
                <div className="text-xs text-slate-600">Fetching satellite frame and establishing baseline…</div>
              </div>
            )}
            <canvas
              ref={changeCanvasRef}
              className="w-full h-full object-contain"
              style={{ imageRendering: 'auto', display: result ? 'block' : 'none' }}
            />
          </div>
        </div>
      </div>

      {/* Controls & Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Controls */}
        <div className="bg-satellite-card border border-satellite-border rounded-xl p-4 space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Detection Threshold</span>
              <span className="text-xs font-mono text-accent-orange">{threshold} px</span>
            </div>
            <input
              type="range"
              min={5}
              max={80}
              step={5}
              value={threshold}
              onChange={e => setThreshold(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-1">
              <span>Sensitive (5)</span>
              <span>Moderate (40)</span>
              <span>Strict (80)</span>
            </div>
          </div>

          {/* Map legend */}
          <div className="border-t border-satellite-border pt-3 space-y-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Map Legend</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-red-500/60 border border-red-400" /> <span className="text-slate-400">Most affected zone</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-emerald-500/60 border border-emerald-400" /> <span className="text-slate-400">Least affected zone</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-slate-700 border border-slate-600" /> <span className="text-slate-400">Swath gap (no data)</span></div>
              <div className="flex items-center gap-2"><span className="text-slate-400">Base layer</span> <span className="text-slate-500">= current IR frame</span></div>
            </div>
          </div>

          <button
            onClick={runAutoScan}
            disabled={processing}
            className="w-full py-2.5 rounded-lg bg-accent-orange text-white text-sm font-medium hover:bg-accent-orange/90 disabled:opacity-50 transition-all"
          >
            {processing ? 'Scanning…' : 'Re-run Automatic Scan Now'}
          </button>
          <div className="text-[9px] text-slate-600 text-center">
            Auto-scans run every 30 minutes. Stored baselines are limited to the 3 most recent frames (auto-cleanup).
          </div>
        </div>

        {/* Results */}
        <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} style={{ color: SEVERITY_COLORS[result.severity] }} />
                <div>
                  <div className="text-sm font-medium text-slate-200">Disaster Assessment</div>
                  <div className="text-xs font-mono mt-0.5" style={{ color: SEVERITY_COLORS[result.severity] }}>
                    {result.severity.toUpperCase()} SEVERITY
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="metric-card text-center">
                  <div className="text-2xl font-mono font-bold" style={{ color: SEVERITY_COLORS[result.severity] }}>
                    {result.affectedAreaPercent.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Affected Area</div>
                </div>
                <div className="metric-card text-center">
                  <div className="text-2xl font-mono font-bold text-slate-200">{result.changedPixels.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Changed Pixels</div>
                </div>
              </div>

              {result.region?.worstZone && !result.region.worstZone.lowCoverage && (
                <div className="bg-satellite-card border border-red-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={13} className="text-red-400" />
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Most Affected Region</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-100">{result.region.worstZone.name}</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                    Bounding box: ({result.region.worstZone.bbox.x0}, {result.region.worstZone.bbox.y0}) → ({result.region.worstZone.bbox.x1}, {result.region.worstZone.bbox.y1}) px
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>Zone impact</span>
                      <span className="font-mono text-red-400">{result.region.worstZone.changePercent}% changed</span>
                    </div>
                    <div className="h-2 bg-satellite-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, result.region.worstZone.changePercent * 1.6)}%`, background: `linear-gradient(90deg, #F59E0B, ${SEVERITY_COLORS[result.severity]})` }} />
                    </div>
                  </div>
                </div>
              )}

              {result.region?.worstZone?.lowCoverage && (
                <div className="bg-satellite-card border border-slate-500/30 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Coverage Warning</div>
                  <div className="text-xs text-slate-300">
                    The worst-scoring zone falls inside a satellite swath gap (no data). Results are unreliable for that
                    area — re-check after the next satellite pass.
                  </div>
                </div>
              )}

              {result.region && (
                <div className="bg-satellite-card border border-satellite-border rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">Region Breakdown</div>
                  <div className="space-y-1.5">
                    {result.region.zones.slice(0, 6).map((z: { name: string; changePercent: number; lowCoverage?: boolean }) => (
                      <div key={z.name} className="flex items-center gap-2 text-[11px]">
                        <span className="w-24 text-slate-400 shrink-0">{z.name}</span>
                        <div className="flex-1 h-2 bg-satellite-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, z.changePercent * 1.6)}%`, background: zoneColor(z.changePercent) }} />
                        </div>
                        <span className="font-mono text-slate-500 w-12 text-right">{z.changePercent}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[9px] text-slate-600 mt-2 border-t border-satellite-border pt-1.5">
                    Zones dominated by satellite swath gaps are excluded from scoring and flagged as unreliable.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-10">
              <Satellite size={20} className="text-slate-600 mx-auto mb-2" />
              <div className="text-xs text-slate-500">
                {phase === 'no-baseline' ? 'Establishing the first baseline frame…' : 'Waiting for comparison results…'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
