import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, Download, ArrowRight, MapPin, Satellite, Radio, FileText, TrendingUp, Activity } from 'lucide-react';
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
import { generateIncidentReport, type IncidentReport } from '../lib/incident-report';
import { parseBBox, zoneCenterGeo, reverseGeocode } from '../lib/geo-utils';
import { recordScan, readSamples, computePrediction, type PredictionResult } from '../lib/disaster-prediction';
import { useLanguage } from '../lib/i18n';

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
  const { t } = useLanguage();
  const [result, setResult] = useState<ChangeDetectionResult | null>(null);
  const [report, setReport] = useState<AutoChangeReport | null>(null);
  const [processing, setProcessing] = useState(false);
  const [threshold, setThreshold] = useState(25);
  const [phase, setPhase] = useState<'no-baseline' | 'building' | 'ready' | 'error'>('no-baseline');
  const [latestFrame, setLatestFrame] = useState<ColorizedFrame | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const changeCanvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Local area names resolved via reverse-geocoding (OpenStreetMap Nominatim — free).
  // Kept in a ref and committed to React state ONCE per scan (after all zones
  // resolve) so the page does not re-render 9 times and the map does not
  // flicker while names are loading (fixes the "buffering again and again"
  // loop caused by per-zone state updates).
  const namesRef = useRef<Map<string, string>>(new Map());
  const [zoneNames, setZoneNames] = useState<Map<string, string> | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [incidentReport, setIncidentReport] = useState<IncidentReport | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const frameDimRef = useRef<{ width: number; height: number } | null>(null);
  const lastDrawnFrameRef = useRef<string | null>(null);

  // Resolve human-readable local names for every zone (cached in localStorage
  // so only the first lookup per scan triggers a network call)
  const resolveZoneNames = useCallback(async (det: ChangeDetectionResult, fresh: ColorizedFrame) => {
    if (!det.region || det.region.zones.length === 0) return;
    const source = SATELLITE_SOURCES[0];
    const geo = parseBBox(source.bbox);
    if (!geo) return;
    // Fill the ref incrementally (map overlays read from the ref directly),
    // then commit exactly ONE React state update when every zone is done.
    const map = new Map<string, string>();
    for (const z of det.region.zones) {
      const { lat, lon } = zoneCenterGeo(geo, z.bbox, fresh.width, fresh.height);
      const local = await reverseGeocode(lat, lon);
      const label = local ? `${local} (${z.name})` : z.name;
      map.set(z.name, label);
      namesRef.current.set(z.name, label);
    }
    setZoneNames(new Map(map));
  }, []);

  // Render the change map (red = most affected, green-tinted least affected zone overlay)
  const renderChangeMap = useCallback((det: ChangeDetectionResult, fresh: ColorizedFrame) => {
    const canvas = changeCanvasRef.current;
    if (!canvas) return;
    // Guard: if nothing changed (same frame + same result zones), don't
    // redraw — stops the map "buffering" again and again on React re-renders.
    const drawKey = `${fresh.dataUrl.length}|${det.changedPixels}|${det.region?.worstZone?.changePercent ?? -1}`;
    if (lastDrawnFrameRef.current === drawKey) return;
    lastDrawnFrameRef.current = drawKey;
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
        const wzLabel = namesRef.current.get(wz.name) ?? wz.name;
        ctx.fillText(`MOST AFFECTED: ${wzLabel} (${wz.changePercent}% changed)`, wz.bbox.x0 * scale + 6, wz.bbox.y0 * scale + 18);
      }

      // Overlay: least-affected zone = green translucent box with label.
      // Only consider zones with real coverage (skip swath-gap zones whose
      // 0% change is just missing data, not a healthy region).
      const least = det.region?.zones
        .filter(z => !z.lowCoverage)
        .sort((a, b) => a.changePercent - b.changePercent)[0];
      if (least && (!wz || least.name !== wz.name)) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
        ctx.fillRect(least.bbox.x0 * scale, least.bbox.y0 * scale, (least.bbox.x1 - least.bbox.x0) * scale, (least.bbox.y1 - least.bbox.y0) * scale);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2;
        ctx.strokeRect(least.bbox.x0 * scale, least.bbox.y0 * scale, (least.bbox.x1 - least.bbox.x0) * scale, (least.bbox.y1 - least.bbox.y0) * scale);
        ctx.fillStyle = '#10B981';
        ctx.font = 'bold 12px ui-monospace, monospace';
        const leastLabel = namesRef.current.get(least.name) ?? least.name;
        ctx.fillText(`LEAST AFFECTED: ${leastLabel} (${least.changePercent}% changed)`, least.bbox.x0 * scale + 6, least.bbox.y1 * scale - 8);
      }

      // Overlay: predicted next-step zone (T3) — dashed purple box
      const pred = prediction;
      if (pred?.available && pred.predictedBbox) {
        const pb = pred.predictedBbox;
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#A855F7';
        ctx.lineWidth = 2;
        ctx.strokeRect(pb.x0 * scale, pb.y0 * scale, (pb.x1 - pb.x0) * scale, (pb.y1 - pb.y0) * scale);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.18)';
        ctx.fillRect(pb.x0 * scale, pb.y0 * scale, (pb.x1 - pb.x0) * scale, (pb.y1 - pb.y0) * scale);
        ctx.fillStyle = '#C084FC';
        ctx.font = 'bold 12px ui-monospace, monospace';
        const predLabel = pred.predictedZoneName ?? `${pred.direction} (${pred.predictedChangePercent.toFixed(1)}%)`;
        ctx.fillText(`PREDICTED T3: ${predLabel} (${pred.direction})`, pb.x0 * scale + 6, pb.y0 * scale + 18);
      }
    };
    img.src = fresh.dataUrl;
  }, [prediction]);

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
        lastDrawnFrameRef.current = null; // new scan = fresh draw (clear guard)
        namesRef.current.clear();
        setResult(det);
        setReport(autoReport);
        setPhase('ready');
        renderChangeMap(det, frame);
        resolveZoneNames(det, frame);
        recordScan({ worstZone: det.region?.worstZone ?? null, width: frame.width, height: frame.height });
        frameDimRef.current = { width: frame.width, height: frame.height };
        setPredictionLoading(true);
        void computePrediction({ bbox: source.bbox, width: frame.width, height: frame.height })
          .then(r => {
            if (r.available) renderChangeMap(det, frame);
            setPrediction(r);
          })
          .catch(() => setPrediction(null))
          .finally(() => setPredictionLoading(false));

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
            ? ` — worst affected zone: ${wz.name}, ${wz.changePercent}% changed`
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

  const buildIncidentReport = async () => {
    if (!report || !latestFrame) return;
    setGeneratingReport(true);
    try {
      const rep = await generateIncidentReport(
        report.result,
        report,
        SATELLITE_SOURCES[0].bbox,
        latestFrame.width,
        latestFrame.height
      );
      setIncidentReport(rep);
    } catch {
      setErrorMessage('Failed to generate incident report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const downloadIncidentReport = () => {
    if (!incidentReport) return;
    const rep = incidentReport;
    const lines = [
      '══════════════════════════════════════════════════════',
      '           RESQVISION — INCIDENT REPORT',
      '══════════════════════════════════════════════════════',
      '',
      `Detected       : ${rep.detected}`,
      `Disaster Type  : ${rep.disaster}`,
      `Location       : ${rep.location}`,
      `Severity       : ${rep.severity.toUpperCase()}`,
      `Confidence     : ${rep.confidence}`,
      '',
      '─ IMPACT ESTIMATE ──────────────────────────────────',
      `Affected Area  : ${rep.affectedAreaKm2.toLocaleString()} km²`,
      `Population     : ~${rep.populationExposed.toLocaleString()} people exposed`,
      `Critical Infra : ~${rep.criticalInfrastructure} facilities at risk`,
      '',
      '─ EVOLUTION ────────────────────────────────────────',
      `Expansion      : ${rep.expansion}`,
      `Priority       : ${rep.recommendedPriority}`,
      '',
      '─ DETECTION METADATA ───────────────────────────────',
      `Method         : Client-side change detection (3×3 zone grid)`,
      `Baseline       : ${report?.baselineDate ?? '—'}`,
      `Compared With  : ${report?.currentDate ?? '—'}`,
      `Changed Pixels : ${report?.result.changedPixels.toLocaleString() ?? '—'}`,
      '',
      'Generated by ResQvision — zero-cost, client-side AI',
      'For official verification, cross-check with local disaster',
      'management authorities before dispatch.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = `incident_report_${rep.location.replace(/[^a-z0-9]+/gi, '_')}_${Date.now()}.txt`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  const downloadChangeMap = () => {
    if (!changeCanvasRef.current) return;
    const link = document.createElement('a');
    link.download = `disaster_map_${Date.now()}.png`;
    link.href = changeCanvasRef.current.toDataURL('image/png');
    link.click();
  };

  // Region breakdown labels: prefer the local area name (town + state),
  // keeping only the most meaningful parts so zones don't look identical.
  const shortZoneLabel = (z: { name: string }, map: Map<string, string> | null) => {
    const full = map?.get(z.name);
    if (!full) return z.name;
    // full format: "<local>, <state> (<zone>)" — keep "<local>, <state>"
    const core = full.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return core || z.name;
  };

  // Download a per-region breakdown report — every zone with its local area
  // name, bounding box, change % and intensity, so each affected region can be
  // reviewed and acted on separately.
  const downloadRegionReport = () => {
    const det = result;
    if (!det?.region || !zoneNames) return;
    const lines = [
      '══════════════════════════════════════════════════════',
      '        RESQVISION — REGION BREAKDOWN REPORT',
      '══════════════════════════════════════════════════════',
      '',
      `Overall severity : ${det.severity}`,
      `Affected area    : ${det.affectedAreaPercent.toFixed(1)}% of scanned area`,
      `Changed pixels   : ${det.changedPixels.toLocaleString()}`,
      `Baseline         : ${report?.baselineDate ?? '—'}`,
      `Current frame    : ${report?.currentDate ?? '—'}`,
      '',
      '─ ZONE-BY-ZONE (sorted worst → best) ───────────────',
      ...det.region.zones
        .slice()
        .sort((a, b) => b.changePercent - a.changePercent)
        .map((z, i) => {
          const full = zoneNames.get(z.name) ?? z.name;
          const core = full.replace(/\s*\([^)]*\)\s*$/, '').trim();
          const flag = z.lowCoverage ? '  [swath gap — unreliable]' : '';
          return [
            `#${i + 1}  ${z.name}`,
            `   Local area : ${core || z.name}`,
            `   Change     : ${z.changePercent}% (${z.lowCoverage ? 'unreliable' : 'measured'})`,
            `   Intensity  : ${z.intensity.toFixed(3)} / 1.0`,
            `   Bounding px: (${z.bbox.x0}, ${z.bbox.y0}) → (${z.bbox.x1}, ${z.bbox.y1})${flag}`,
            '',
          ].join('\n');
        }),
      'Zones dominated by satellite swath gaps are flagged unreliable.',
      '',
      'Generated by ResQvision — zero-cost, client-side AI',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = `region_breakdown_${Date.now()}.txt`;
    link.href = URL.createObjectURL(blob);
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
              {t('cd.title')} — {phase === 'no-baseline' ? t('cd.waitingFirst') : phase === 'building' ? t('cd.building') : phase === 'error' ? t('cd.error') : t('cd.active')}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {phase === 'no-baseline' && t('cd.baselineMsg')}
              {phase === 'building' && t('cd.fetchingMsg')}
              {phase === 'ready' && report && `${t('cd.comparing')} ${report.currentDate} / ${report.baselineDate}`}
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
              <>
                <button onClick={downloadChangeMap} className="p-1 rounded hover:bg-satellite-muted/50 transition-colors">
                  <Download size={12} className="text-slate-400" />
                </button>
                <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm border border-dashed border-purple-400 bg-purple-400/40 ml-2" /> Predicted T3
                </span>
              </>
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
              <span className="text-xs text-slate-400 uppercase tracking-wider">{t('cd.threshold')}</span>
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
              <span>{t('cd.sensitive')}</span>
              <span>{t('cd.moderate')}</span>
              <span>{t('cd.strict')}</span>
            </div>
          </div>

          {/* Map legend */}
          <div className="border-t border-satellite-border pt-3 space-y-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">{t('cd.mapLegend')}</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-red-500/60 border border-red-400" /> <span className="text-slate-400">{t('cd.mostAffected')}</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-emerald-500/60 border border-emerald-400" /> <span className="text-slate-400">{t('cd.leastAffected')}</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-slate-700 border border-slate-600" /> <span className="text-slate-400">{t('cd.swathGap')}</span></div>
              <div className="flex items-center gap-2"><span className="text-slate-400">{t('cd.baseLayer')}</span></div>
            </div>
          </div>

          <button
            onClick={runAutoScan}
            disabled={processing}
            className="w-full py-2.5 rounded-lg bg-accent-orange text-white text-sm font-medium hover:bg-accent-orange/90 disabled:opacity-50 transition-all"
          >
            {processing ? t('cd.scanning') : t('cd.scanNow')}
          </button>
          <div className="text-[9px] text-slate-600 text-center">
            {t('cd.autoNote')}
          </div>
        </div>

        {/* Results */}
        <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} style={{ color: SEVERITY_COLORS[result.severity] }} />
                <div>
                  <div className="text-sm font-medium text-slate-200">{t('cd.assessment')}</div>
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
                  <div className="text-[10px] text-slate-500 mt-1">{t('cd.affectedArea')}</div>
                </div>
                <div className="metric-card text-center">
                  <div className="text-2xl font-mono font-bold text-slate-200">{result.changedPixels.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{t('cd.changedPixels')}</div>
                </div>
              </div>

              {result.region?.worstZone && !result.region.worstZone.lowCoverage && (
                <div className="bg-satellite-card border border-red-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={13} className="text-red-400" />
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">{t('cd.mostAffectedRegion')}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-100">{zoneNames?.get(result.region.worstZone.name) ?? result.region.worstZone.name}</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                    {t('cd.boundingBox')}: ({result.region.worstZone.bbox.x0}, {result.region.worstZone.bbox.y0}) → ({result.region.worstZone.bbox.x1}, {result.region.worstZone.bbox.y1}) px
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>{t('cd.zoneImpact')}</span>
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
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{t('cd.coverageWarning')}</div>
                  <div className="text-xs text-slate-300">
                    {t('cd.coverageWarningDesc')}
                  </div>
                </div>
              )}

              {result.region && (
                <div className="bg-satellite-card border border-satellite-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('cd.regionBreakdown')}</span>
                    {zoneNames && (
                      <button onClick={downloadRegionReport} className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1">
                        <Download size={10} /> {t('cd.download')}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {result.region.zones.map((z: { name: string; changePercent: number; lowCoverage?: boolean }) => (
                      <div key={z.name} className="flex items-center gap-2 text-[11px]">
                        <span className="w-44 text-slate-300 shrink-0 truncate">{shortZoneLabel(z, zoneNames)}</span>
                        <div className="flex-1 h-2 bg-satellite-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, z.changePercent * 1.6)}%`, background: zoneColor(z.changePercent) }} />
                        </div>
                        <span className="font-mono text-slate-500 w-12 text-right">{z.changePercent}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[9px] text-slate-600 mt-2 border-t border-satellite-border pt-1.5">
                    {t('cd.unreliableNote')}
                  </div>
                </div>
              )}

              {/* Generate Incident Report */}
              <div className="pt-3 border-t border-satellite-border space-y-3">
                <button
                  onClick={buildIncidentReport}
                  disabled={!result || generatingReport}
                  className="w-full py-2.5 rounded-lg bg-red-600/80 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-600/80 transition-all flex items-center justify-center gap-2"
                >
                  <FileText size={14} />
                  {generatingReport ? t('cd.generating') : t('cd.genReport')}
                </button>

                {incidentReport && (
                  <div className="bg-satellite-bg rounded-lg border border-red-500/30 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-red-400 uppercase tracking-wider">{t('cd.incidentReport')}</span>
                    <button onClick={downloadIncidentReport} className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1">
                      <Download size={10} /> {t('cd.download')}
                    </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div><span className="text-slate-500">{t('cd.disaster')}</span><div className="text-slate-200">{incidentReport.disaster}</div></div>
                    <div><span className="text-slate-500">{t('cd.location')}</span><div className="text-slate-200">{incidentReport.location}</div></div>
                    <div><span className="text-slate-500">{t('cd.affectedArea')}</span><div className="text-slate-200">{incidentReport.affectedAreaKm2.toLocaleString()} km²</div></div>
                    <div><span className="text-slate-500">Population</span><div className="text-slate-200">~{incidentReport.populationExposed.toLocaleString()} exposed</div></div>
                    <div><span className="text-slate-500">{t('cd.expansion')}</span><div className="text-slate-200">{incidentReport.expansion}</div></div>
                    <div><span className="text-slate-500">{t('cd.priority')}</span><div className="text-slate-200">{incidentReport.recommendedPriority}</div></div>
                    </div>
                    <div className="text-[9px] text-slate-600 border-t border-satellite-border pt-1.5">
                      {t('cd.estimateNote')}
                    </div>
                  </div>
                )}

                {/* Disaster Progression Prediction */}
                <div className="pt-3 border-t border-satellite-border">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp size={13} className="text-purple-400" />
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Disaster Progression Prediction</span>
                    {predictionLoading && <Activity size={11} className="text-purple-400 animate-pulse" />}
                  </div>
                  {prediction?.available ? (
                    <div className="bg-satellite-bg rounded-lg border border-purple-500/30 p-3 text-xs space-y-2">
                      {/* T0→T1→T2→T3 mini timeline */}
                      <div className="flex items-stretch justify-between gap-1">
                        {(() => {
                          const hist = readSamples();
                          const steps = ['T0', 'T1', 'T2', 'T3'];
                          return steps.map((step, i) => {
                            const s = hist[i];
                            const pct = s ? `${s.worstChangePercent.toFixed(1)}%` : '?%';
                            const name = s?.worstZoneName ?? prediction.predictedZoneName ?? '—';
                            return (
                              <div key={step} className={`flex-1 rounded-md p-1.5 text-center ${i === 3 ? 'bg-purple-500/15 border border-dashed border-purple-400' : 'bg-satellite-card border border-satellite-border'}`}>
                                <div className={`text-[9px] font-mono ${i === 3 ? 'text-purple-300' : 'text-slate-500'}`}>{step}</div>
                                <div className={`text-[10px] font-semibold truncate ${i === 3 ? 'text-purple-300' : 'text-slate-300'}`}>{name}</div>
                                <div className={`text-[10px] font-mono ${i === 3 ? 'text-purple-400' : 'text-slate-500'}`}>{pct}</div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        <div><span className="text-slate-500">Direction</span><div className="text-slate-200">{prediction.direction}</div></div>
                        <div><span className="text-slate-500">Est. Speed</span><div className="text-slate-200">~{prediction.speedKmh.toLocaleString()} km/h</div></div>
                        <div><span className="text-slate-500">Trend</span><div className="text-slate-200">{prediction.trend}</div></div>
                        <div><span className="text-slate-500">Confidence</span><div className="text-slate-200">{prediction.confidence}</div></div>
                      </div>
                      <div className="text-slate-400 leading-relaxed border-t border-satellite-border pt-1.5">
                        {prediction.summary}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-satellite-bg rounded-lg border border-satellite-border p-3 text-[11px] text-slate-500">
                      Forecast builds from repeated scans. Each automatic scan (every 30 min) records one checkpoint — the next checkpoint appears here. Run a scan now to seed the timeline.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-10">
              <Satellite size={20} className="text-slate-600 mx-auto mb-2" />
              <div className="text-xs text-slate-500">
                {phase === 'no-baseline' ? t('cd.estFirst') : t('cd.estWaiting')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
