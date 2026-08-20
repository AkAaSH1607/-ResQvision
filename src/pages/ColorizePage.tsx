import { useState, useRef, useCallback, useEffect } from 'react';
import { Download, RefreshCw, Zap, ChevronDown, ChevronUp, Brain, CalendarDays } from 'lucide-react';
import ImageUpload from '../components/ImageUpload';
import ColormapSelector from '../components/ColormapSelector';
import QualityMetricsPanel from '../components/QualityMetrics';
import SceneAnalysisPanel from '../components/SceneAnalysis';
import ResolutionBadge from '../components/ResolutionBadge';
import TemporalComparison from '../components/TemporalComparison';
import { applyColormapToImageData, extractGrayscale } from '../lib/colormaps';
import { computeAllMetrics } from '../lib/metrics';
import { analyzeScene } from '../lib/scene-analysis';
import { analyzeSceneML, getModelStatus, preloadModel } from '../lib/scene-analysis-ml';
import { saveAnalysis, saveAlerts } from '../lib/supabase';
import type { ColormapName, SatelliteType, QualityMetrics, SceneAnalysisResult } from '../lib/types';
import { loadImageToCanvas } from '../lib/change-detection';

interface AlertPayload { alert_type: string; severity: string; message: string }

function generateAlerts(metrics: QualityMetrics, scene: SceneAnalysisResult): AlertPayload[] {
  const alerts: AlertPayload[] = [];
  if (metrics.cloudCoverage > 65) {
    alerts.push({ alert_type: 'high_cloud', severity: 'high', message: `High cloud coverage detected: ${metrics.cloudCoverage.toFixed(1)}%` });
  }
  if (scene.urbanHeatPercent > 35) {
    alerts.push({ alert_type: 'heat_anomaly', severity: 'high', message: `Urban heat island detected: ${scene.urbanHeatPercent.toFixed(1)}%` });
  }
  if (scene.weather === 'Storm') {
    alerts.push({ alert_type: 'storm', severity: 'critical', message: 'Storm conditions identified in satellite imagery' });
  }
  if (scene.vegetationPercent < 5 && scene.waterBodiesPercent < 5) {
    alerts.push({ alert_type: 'vegetation_loss', severity: 'medium', message: 'Low vegetation coverage — possible drought or desertification' });
  }
  return alerts;
}

export default function ColorizePage({ onAlertsChanged }: { onAlertsChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [colormap, setColormap] = useState<ColormapName>('JET');
  const [intensity, setIntensity] = useState(1.0);
  const [satellite, setSatellite] = useState<SatelliteType>('INSAT-3DS');
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [scene, setScene] = useState<SceneAnalysisResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const [showScene, setShowScene] = useState(true);
  const [modelReady, setModelReady] = useState(false);
  const [mlLoading, setMlLoading] = useState(false);
  const [showTemporal, setShowTemporal] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<ImageData | null>(null);
  const grayRef = useRef<Uint8Array | null>(null);

  const renderColorized = useCallback(() => {
    if (!originalRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const colorized = applyColormapToImageData(originalRef.current, colormap, intensity);
    ctx.putImageData(colorized, 0, 0);
  }, [colormap, intensity]);

  useEffect(() => {
    if (processed) renderColorized();
  }, [colormap, intensity, processed, renderColorized]);

  // Pre-load the ML model on mount
  useEffect(() => {
    let cancelled = false;
    const status = getModelStatus();
    if (status === 'ready') {
      setModelReady(true);
      return;
    }
    // Trigger model load in background
    preloadModel();
    const timer = setInterval(() => {
      if (cancelled) return;
      const s = getModelStatus();
      if (s === 'ready') {
        setModelReady(true);
        clearInterval(timer);
      } else if (s === 'error') {
        clearInterval(timer);
      }
    }, 500);
    // Give it up to 10 seconds to load
    const timeout = setTimeout(() => { clearInterval(timer); }, 10000);
    return () => { cancelled = true; clearInterval(timer); clearTimeout(timeout); };
  }, []);

  const processImage = useCallback(async (f: File) => {
    setProcessing(true);
    setProcessed(false);
    const start = Date.now();

    try {
      const { imageData, width, height } = await loadImageToCanvas(f);
      originalRef.current = imageData;
      const gray = extractGrayscale(imageData);
      grayRef.current = gray;

      if (!canvasRef.current) return;
      canvasRef.current.width = width;
      canvasRef.current.height = height;

      const colorized = applyColormapToImageData(imageData, colormap, intensity);
      canvasRef.current.getContext('2d')!.putImageData(colorized, 0, 0);

      const m = computeAllMetrics(gray, null, width, height);
      const s = analyzeScene(gray);

      // Run ML analysis if model is ready
      let mlResult = s;
      if (modelReady && canvasRef.current) {
        setMlLoading(true);
        try {
          const mlScene = await analyzeSceneML(canvasRef.current, imageData);
          // Use ML results (they're more accurate for semantic understanding)
          mlResult = mlScene;
        } catch (mlErr) {
          console.warn('ML analysis failed, using physics-based results:', mlErr);
        }
        setMlLoading(false);
      }

      setMetrics(m);
      setScene(mlResult);
      setProcessed(true);

      const elapsed = Date.now() - start;
      const record = await saveAnalysis({
        image_name: f.name,
        analysis_type: 'full',
        colormap_used: colormap,
        intensity_applied: intensity,
        psnr: m.psnr,
        ssim: m.ssim,
        fid_score: m.fid,
        cloud_coverage: m.cloudCoverage,
        weather_condition: mlResult.weather,
        ndvi: mlResult.ndvi,
        water_bodies_percent: mlResult.waterBodiesPercent,
        urban_heat_percent: mlResult.urbanHeatPercent,
        image_width: width,
        image_height: height,
        processing_time_ms: elapsed,
        satellite_type: satellite,
        change_severity: 'None',
        metadata: { ml_analysis: modelReady, confidence: 'confidence' in mlResult ? (mlResult as any).confidence : undefined },
      });

      if (record) {
        const alerts = generateAlerts(m, mlResult);
        if (alerts.length > 0) {
          await saveAlerts(record.id, alerts);
          onAlertsChanged();
        }
      }
    } catch (err) {
      console.error('Processing error:', err);
    }

    setProcessing(false);
  }, [colormap, intensity, satellite, onAlertsChanged, modelReady]);

  const handleFileLoaded = (f: File) => {
    setFile(f);
    processImage(f);
  };

  const handleReprocess = () => {
    if (file) processImage(file);
  };

  const downloadResult = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `resqvision_${colormap}_${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  return (
    <>
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Left Panel */}
      <div className="w-full lg:w-72 flex-shrink-0 space-y-4">
        <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">Data Input</div>
          <ImageUpload onImageLoaded={handleFileLoaded} currentFile={file} />
        </div>

        <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
          <ColormapSelector
            selected={colormap}
            onChange={c => { setColormap(c); }}
            intensity={intensity}
            onIntensityChange={v => { setIntensity(v); }}
          />
        </div>

        <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
          <ResolutionBadge selected={satellite} onChange={setSatellite} />
        </div>
      </div>

      {/* Center Canvas */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="bg-satellite-card border border-satellite-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-satellite-border">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${processing ? 'bg-accent-orange animate-pulse' : processed ? 'bg-green-400' : 'bg-slate-600'}`} />
              <span className="text-xs text-slate-300 font-mono">
                {processing ? 'Processing...' : processed ? 'Colorized Output' : 'Awaiting input'}
              </span>
              {processed && file && (
                <span className="text-[10px] text-slate-500">{file.name}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {modelReady && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-400 font-mono">
                  <Brain size={10} />
                  AI Model Active
                </div>
              )}
              {processed && (
                <>
                  <button onClick={handleReprocess} className="p-1.5 rounded-lg hover:bg-satellite-muted/50 transition-colors" title="Re-process">
                    <RefreshCw size={14} className="text-slate-400" />
                  </button>
                  <button onClick={downloadResult} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-orange/15 text-accent-orange text-xs border border-accent-orange/25 hover:bg-accent-orange/25 transition-all">
                    <Download size={12} />
                    Export
                  </button>
                </>
              )}
            </div>
          </div>

          <div className={`relative bg-satellite-bg min-h-[300px] flex items-center justify-center ${processed ? 'scan-line' : ''}`}>
            {processing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-satellite-bg/80 z-10">
                <div className="w-8 h-8 border-2 border-accent-orange border-t-transparent rounded-full animate-spin mb-3" />
                <div className="text-sm text-accent-orange font-mono">Applying colormap...</div>
                <div className="text-xs text-slate-500 mt-1">Computing metrics & scene analysis</div>
                {modelReady && mlLoading && (
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-purple-400 font-mono">
                    <Brain size={12} />
                    Running neural network inference...
                  </div>
                )}
              </div>
            )}

            {!processed && !processing && (
              <div className="text-center p-12">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-satellite-card border border-satellite-border flex items-center justify-center mb-4">
                  <Zap size={24} className="text-slate-600" />
                </div>
                <div className="text-slate-500 text-sm">Upload an IR satellite image to begin colorization</div>
                <div className="text-slate-600 text-xs mt-1">Supports INSAT, Landsat, Sentinel, Cartosat data</div>
              </div>
            )}

            <canvas
              ref={canvasRef}
              className="max-w-full max-h-[600px] object-contain"
              style={{
                display: processed ? 'block' : 'none',
                imageRendering: 'auto',
                width: '100%',
                height: 'auto',
              }}
            />
          </div>

          {processed && (
            <div className="px-4 py-2 border-t border-satellite-border flex flex-wrap gap-4 text-[10px] text-slate-500 font-mono">
              <span>COLORMAP: <span className="text-accent-orange">{colormap}</span></span>
              <span>INTENSITY: <span className="text-accent-orange">{intensity.toFixed(2)}x</span></span>
              <span>SAT: <span className="text-accent-orange">{satellite}</span></span>
              {canvasRef.current && <span>SIZE: <span className="text-accent-orange">{canvasRef.current.width}×{canvasRef.current.height}</span></span>}
              {modelReady && <span className="text-purple-400">AI: DeepLab v3 + MobileNetV2</span>}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel — Metrics */}
      <div className="w-full lg:w-64 lg:flex-shrink-0 flex flex-col gap-4">
        <div className="bg-satellite-card border border-satellite-border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 border-b border-satellite-border hover:bg-satellite-muted/20 transition-colors"
            onClick={() => setShowMetrics(v => !v)}
          >
            <span className="text-xs text-slate-300 uppercase tracking-wider">Quality Metrics</span>
            {showMetrics ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
          </button>
          {showMetrics && (
            <div className="p-3">
              <QualityMetricsPanel metrics={metrics} loading={processing} />
            </div>
          )}
        </div>

        <div className="bg-satellite-card border border-satellite-border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 border-b border-satellite-border hover:bg-satellite-muted/20 transition-colors"
            onClick={() => setShowScene(v => !v)}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-300 uppercase tracking-wider">Scene Analysis</span>
              {modelReady && <Brain size={12} className="text-purple-400" />}
            </div>
            {showScene ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
          </button>
          {showScene && (
            <div className="p-3">
              <SceneAnalysisPanel result={scene} loading={processing} />
              {modelReady && scene && 'confidence' in scene && (
                <div className="mt-2 px-2 py-1 bg-purple-500/5 border border-purple-500/20 rounded text-[10px] text-purple-300 font-mono">
                  ML Confidence: {((scene as any).confidence * 100).toFixed(0)}%
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Bottom — Temporal / Historical Comparison (full width, only show after processing) */}
    {processed && (
      <div className="mt-4">
        <TemporalComparison
          colormap={colormap}
          intensity={intensity}
          currentDataUrl={processed && canvasRef.current ? canvasRef.current.toDataURL('image/png') : null}
        />
      </div>
    )}
    </>
  );
}
