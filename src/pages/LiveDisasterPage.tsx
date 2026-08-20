import { useEffect, useState } from 'react';
import { Siren, Check, RefreshCw, FileText, AlertTriangle, Activity, TrendingUp, Users, Crosshair } from 'lucide-react';
import { fetchAlerts, fetchAnalyses, dismissAlert, dismissAllAlerts } from '../lib/supabase';
import type { AlertRecord, AnalysisRecord } from '../lib/types';
import { generateIncidentReport, type IncidentReport } from '../lib/incident-report';
import { SATELLITE_SOURCES } from '../lib/live-feed';
import { parseBBox, zoneCenterGeo, reverseGeocode } from '../lib/geo-utils';

const SEVERITY_META: Record<string, { color: string; label: string; ring: string }> = {
  critical: { color: '#DC2626', label: 'CRITICAL', ring: 'border-red-500/50' },
  high: { color: '#EF4444', label: 'HIGH', ring: 'border-red-400/40' },
  medium: { color: '#F59E0B', label: 'MODERATE', ring: 'border-amber-400/40' },
  low: { color: '#84CC16', label: 'LOW', ring: 'border-lime-400/40' },
};

const TYPE_LABELS: Record<string, string> = {
  change_detected: 'Change Detected',
  high_cloud: 'High Cloud Coverage',
  heat_anomaly: 'Heat Anomaly',
  storm: 'Storm Warning',
  vegetation_loss: 'Vegetation Loss',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function LiveDisasterPage() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<Map<string, IncidentReport>>(new Map());
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [dismissError, setDismissError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setDismissError('');
    const [alertRows, analysisRows] = await Promise.all([
      fetchAlerts(false),
      fetchAnalyses(50),
    ]);
    setAlerts(alertRows);
    setAnalyses(analysisRows);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const buildReportFor = async (alert: AlertRecord) => {
    const analysis = analyses.find(a => a.id === alert.analysis_id);
    if (!analysis) return;
    setGeneratingFor(alert.id);
    try {
      const source = SATELLITE_SOURCES[0];
      const det = {
        affectedAreaPercent: analysis.affected_area_percent ?? 0,
        severity: (analysis.change_severity ?? 'Low') as any,
        changedPixels: Math.round((analysis.affected_area_percent ?? 0) * ((analysis.image_width ?? 1024) * (analysis.image_height ?? 1024)) / 100),
        totalPixels: (analysis.image_width ?? 1024) * (analysis.image_height ?? 1024),
        changeMapData: null,
      };
      const rep = await generateIncidentReport(det, {} as any, source.bbox, analysis.image_width ?? 1024, analysis.image_height ?? 1024);
      setReports(prev => new Map(prev).set(alert.id, rep));
    } catch {
      setDismissError('Failed to generate report');
    } finally {
      setGeneratingFor(null);
    }
  };

  const resolveLocation = async (analysis: AnalysisRecord) => {
    const source = SATELLITE_SOURCES[0];
    const geo = parseBBox(source.bbox);
    if (!geo) return null;
    const w = analysis.image_width ?? 1024;
    const h = analysis.image_height ?? 1024;
    const { lat, lon } = zoneCenterGeo(geo, { x0: Math.floor(w / 3), y0: 0, x1: Math.floor((2 * w) / 3), y1: Math.floor(h / 3) }, w, h);
    return reverseGeocode(lat, lon);
  };

  const handleDismiss = async (id: string) => {
    await dismissAlert(id);
    setAlerts(prev => prev.map(a => (a.id === id ? { ...a, is_dismissed: true } : a)));
  };

  const handleDismissAll = async () => {
    await dismissAllAlerts();
    setAlerts(prev => prev.map(a => ({ ...a, is_dismissed: true })));
  };

  const activeAlerts = alerts.filter(a => !a.is_dismissed);
  const activeCount = activeAlerts.length;
  const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
  const totalAffectedPct = activeAlerts
    .map(a => analyses.find(x => x.id === a.analysis_id)?.affected_area_percent)
    .filter((p): p is number => typeof p === 'number')
    .reduce((s, p) => s + p, 0);
  const maxSeverity = criticalCount > 0 ? 'critical' : activeAlerts.some(a => a.severity === 'high') ? 'high' : activeAlerts.some(a => a.severity === 'medium') ? 'medium' : activeAlerts.length > 0 ? 'low' : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-satellite-card border border-satellite-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Siren size={18} className={maxSeverity ? 'text-red-400 animate-pulse' : 'text-green-400'} />
          <div>
            <div className="text-sm font-semibold text-slate-200">Live Disaster Intelligence</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {maxSeverity ? (
                <span style={{ color: SEVERITY_META[maxSeverity].color }}>
                  {SEVERITY_META[maxSeverity].label} threat active — {activeCount} live alert{activeCount === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="text-green-400">No active disaster events. System is monitoring.</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {activeCount > 0 && (
            <button
              onClick={handleDismissAll}
              className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
            >
              <Check size={10} /> Dismiss all
            </button>
          )}
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="metric-card">
          <div className="flex items-center gap-2 mb-1">
            <Siren size={11} className="text-red-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Active Alerts</span>
          </div>
          <div className="text-2xl font-mono font-bold text-slate-200">{activeCount}</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={11} className="text-amber-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Critical</span>
          </div>
          <div className="text-2xl font-mono font-bold text-slate-200">{criticalCount}</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-2 mb-1">
            <Crosshair size={11} className="text-red-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Total Affected</span>
          </div>
          <div className="text-2xl font-mono font-bold text-slate-200">{totalAffectedPct.toFixed(1)}%</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={11} className="text-accent-orange" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Scans Processed</span>
          </div>
          <div className="text-2xl font-mono font-bold text-slate-200">{analyses.length}</div>
        </div>
      </div>

      {/* Event feed */}
      <div className="bg-satellite-card border border-satellite-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-satellite-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={13} className="text-accent-orange" />
            <span className="text-xs text-slate-300">Live Event Feed</span>
          </div>
          <span className="text-[10px] text-slate-500">Sorted by severity, newest first</span>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-accent-orange border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeAlerts.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <Check size={20} className="text-green-400" />
              </div>
              <div className="text-sm text-slate-300">All Clear</div>
              <div className="text-[11px] text-slate-500 mt-1">
                No disaster events detected right now. The system continuously monitors satellite feeds and will surface alerts here the moment a change is detected.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {activeAlerts
                .sort((a, b) => {
                  const order = { critical: 0, high: 1, medium: 2, low: 3 };
                  return (order[a.severity as keyof typeof order] ?? 4) - (order[b.severity as keyof typeof order] ?? 4) ||
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                })
                .map(alert => {
                  const analysis = analyses.find(a => a.id === alert.analysis_id);
                  const meta = SEVERITY_META[alert.severity] ?? SEVERITY_META.low;
                  const rep = reports.get(alert.id);

                  return (
                    <div
                      key={alert.id}
                      className={`rounded-lg border ${meta.ring} bg-satellite-bg/50 p-3 space-y-2`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <span
                            className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider"
                            style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55` }}
                          >
                            {meta.label}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-200">
                              {TYPE_LABELS[alert.alert_type] ?? alert.alert_type}
                              {analysis && ` · ${analysis.image_name}`}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 break-words">{alert.message}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] text-slate-500">{timeAgo(alert.created_at)}</span>
                          <button
                            onClick={() => handleDismiss(alert.id)}
                            className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
                          >
                            <Check size={10} />
                          </button>
                        </div>
                      </div>

                      {analysis && analysis.affected_area_percent !== null && (
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="flex items-center gap-1 text-slate-500">
                            <Crosshair size={10} /> {analysis.affected_area_percent.toFixed(1)}% affected
                          </span>
                          <span className="flex items-center gap-1 text-slate-500">
                            <Users size={10} /> ~{Math.round(analysis.affected_area_percent * 400 * (analysis.image_width ?? 1024) * (analysis.image_height ?? 1024) / 100 / 100) * 100} exposed
                          </span>
                        </div>
                      )}

                      {/* Inline incident report */}
                      {rep && (
                        <div className="bg-satellite-bg rounded-lg border border-red-500/30 p-3 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-red-400 uppercase tracking-wider">Incident Report</span>
                            <button
                              onClick={() => {
                                const blob = new Blob(
                                  [JSON.stringify(rep, null, 2)],
                                  { type: 'application/json' }
                                );
                                const link = document.createElement('a');
                                link.download = `incident_report_${Date.now()}.json`;
                                link.href = URL.createObjectURL(blob);
                                link.click();
                              }}
                              className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
                            >
                              <FileText size={10} /> Download
                            </button>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5">
                            <div><span className="text-slate-500">Disaster</span><div className="text-slate-200">{rep.disaster}</div></div>
                            <div><span className="text-slate-500">Location</span><div className="text-slate-200">{rep.location}</div></div>
                            <div><span className="text-slate-500">Affected</span><div className="text-slate-200">{rep.affectedAreaKm2.toLocaleString()} km²</div></div>
                            <div><span className="text-slate-500">Population</span><div className="text-slate-200">~{rep.populationExposed.toLocaleString()} exposed</div></div>
                            <div><span className="text-slate-500">Expansion</span><div className="text-slate-200">{rep.expansion}</div></div>
                            <div><span className="text-slate-500">Priority</span><div className="text-slate-200">{rep.recommendedPriority}</div></div>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          onClick={() => buildReportFor(alert)}
                          disabled={generatingFor === alert.id || rep !== undefined}
                          className="text-[10px] px-2 py-1 rounded bg-red-600/30 text-red-300 hover:bg-red-600/50 disabled:opacity-50 flex items-center gap-1 transition-colors"
                        >
                          <FileText size={10} />
                          {generatingFor === alert.id ? 'Generating…' : rep ? 'Report Generated' : 'Generate Incident Report'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-satellite-card border border-satellite-border rounded-xl p-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Severity Legend</div>
        <div className="flex flex-wrap gap-4 text-[11px]">
          {Object.entries(SEVERITY_META).map(([sev, meta]) => (
            <div key={sev} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: `${meta.color}66`, border: `1px solid ${meta.color}` }} />
              <span className="text-slate-400">{meta.label}</span>
            </div>
          ))}
        </div>
        {dismissError && <div className="text-[10px] text-red-400 mt-1">{dismissError}</div>}
      </div>
    </div>
  );
}
