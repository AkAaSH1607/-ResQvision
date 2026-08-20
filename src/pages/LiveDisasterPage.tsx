import { useEffect, useState } from 'react';
import { Siren, Check, RefreshCw, FileText, AlertTriangle, Activity, TrendingUp, Users, Crosshair } from 'lucide-react';
import { fetchAlerts, fetchAnalyses, dismissAlert, dismissAllAlerts } from '../lib/supabase';
import type { AlertRecord, AnalysisRecord } from '../lib/types';
import { generateIncidentReport, type IncidentReport } from '../lib/incident-report';
import { SATELLITE_SOURCES } from '../lib/live-feed';
import { parseBBox, zoneCenterGeo, reverseGeocode } from '../lib/geo-utils';
import { useLanguage, formatAlertMessage } from '../lib/i18n';

const SEVERITY_META: Record<string, { color: string; labelKey: string; ring: string }> = {
  critical: { color: '#DC2626', labelKey: 'critical', ring: 'border-red-500/50' },
  high: { color: '#EF4444', labelKey: 'high', ring: 'border-red-400/40' },
  medium: { color: '#F59E0B', labelKey: 'medium', ring: 'border-amber-400/40' },
  low: { color: '#84CC16', labelKey: 'low', ring: 'border-lime-400/40' },
};

const TYPE_LABELS: Record<string, string> = {
  change_detected: 'change_detected',
  high_cloud: 'high_cloud',
  heat_anomaly: 'heat_anomaly',
  storm: 'storm',
  vegetation_loss: 'vegetation_loss',
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
  const { t } = useLanguage();
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
      const w = analysis.image_width ?? 1024;
      const h = analysis.image_height ?? 1024;
      const pct = analysis.affected_area_percent ?? 0;
      // Reconstruct a minimal region with a worst zone from the alert message
      // (e.g. "worst affected zone: South-Central (S), 61.8% changed")
      const wzMatch = alert.message.match(/worst affected zone:\s*([^,]+),\s*([\d.]+)%/);
      let worstZone: { name: string; changePercent: number; bbox: { x0: number; y0: number; x1: number; y1: number }; intensity: number; lowCoverage?: boolean } | null = null;
      if (wzMatch) {
        const zoneName = wzMatch[1].trim();
        const zonePct = parseFloat(wzMatch[2]);
        // Estimate zone bbox from % — a zone is 1/9 of frame (3x3 grid)
        const zoneW = w / 3;
        const zoneH = h / 3;
        worstZone = {
          name: zoneName,
          changePercent: zonePct,
          bbox: { x0: 0, y0: 0, x1: zoneW, y1: zoneH },
          intensity: 120,
          lowCoverage: false,
        };
      }
      const det = {
        affectedAreaPercent: pct,
        severity: (analysis.change_severity ?? 'Low') as any,
        changedPixels: Math.round(pct * w * h / 100),
        totalPixels: w * h,
        region: worstZone
          ? { worstZone, zones: [worstZone] }
          : undefined,
        changeMapData: null,
      } as any;
      const rep = await generateIncidentReport(det, {} as any, source.bbox, w, h);
      setReports(prev => new Map(prev).set(alert.id, rep));
    } catch {
      setDismissError('Failed to generate report');
    } finally {
      setGeneratingFor(null);
    }
  };

  const resolveLocation = async (alert: AlertRecord) => {
    const source = SATELLITE_SOURCES[0];
    const geo = parseBBox(source.bbox);
    if (!geo) return null;
    const analysis = analyses.find(a => a.id === alert.analysis_id);
    const w = analysis?.image_width ?? 1024;
    const h = analysis?.image_height ?? 1024;
    // Try to extract zone name from alert message, default to center of frame
    const wzMatch = alert.message.match(/worst affected zone:\s*([^,]+),/);
    let zoneBbox = { x0: Math.floor(w / 3), y0: 0, x1: Math.floor((2 * w) / 3), y1: Math.floor(h / 3) };
    if (wzMatch) {
      // Zone name like "South-Central (S)" — map grid position
      const name = wzMatch[1].trim().toLowerCase();
      const zoneW = w / 3;
      const zoneH = h / 3;
      let col = 1, row = 0;
      if (name.includes('west') || name.includes('(w)')) col = 0;
      else if (name.includes('east') || name.includes('(e)')) col = 2;
      if (name.includes('south')) row = 1;
      else if (name.includes('north')) row = 0;
      zoneBbox = { x0: col * zoneW, y0: row * zoneH, x1: (col + 1) * zoneW, y1: (row + 1) * zoneH };
    }
    const { lat, lon } = zoneCenterGeo(geo, zoneBbox, w, h);
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
  const totalAffectedPct = Math.max(
    ...activeAlerts
      .map(a => analyses.find(x => x.id === a.analysis_id)?.affected_area_percent)
      .filter((p): p is number => typeof p === 'number'),
    0
  );
  const maxSeverity = criticalCount > 0 ? 'critical' : activeAlerts.some(a => a.severity === 'high') ? 'high' : activeAlerts.some(a => a.severity === 'medium') ? 'medium' : activeAlerts.length > 0 ? 'low' : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-satellite-card border border-satellite-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Siren size={18} className={maxSeverity ? 'text-red-400 animate-pulse' : 'text-green-400'} />
          <div>
            <div className="text-sm font-semibold text-slate-200">{t('ld.title')}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
                  {maxSeverity ? (
                <span style={{ color: SEVERITY_META[maxSeverity].color }}>
                  {t('ld.statusActive', { sev: SEVERITY_META[maxSeverity].labelKey.toUpperCase(), count: activeCount, plural: activeCount === 1 ? '' : 's'})}
                </span>
              ) : (
                <span className="text-green-400">{t('ld.noActive')}</span>
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
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> {t('ld.refresh')}
          </button>
          {activeCount > 0 && (
            <button
              onClick={handleDismissAll}
              className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
            >
              <Check size={10} /> {t('ld.dismissAll')}
            </button>
          )}
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="metric-card">
          <div className="flex items-center gap-2 mb-1">
            <Siren size={11} className="text-red-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('ld.activeAlerts')}</span>
          </div>
          <div className="text-2xl font-mono font-bold text-slate-200">{activeCount}</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={11} className="text-amber-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('ld.critical')}</span>
          </div>
          <div className="text-2xl font-mono font-bold text-slate-200">{criticalCount}</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-2 mb-1">
            <Crosshair size={11} className="text-red-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('ld.totalAffected')}</span>
          </div>
          <div className="text-2xl font-mono font-bold text-slate-200">{totalAffectedPct.toFixed(1)}%</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={11} className="text-accent-orange" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('ld.scansProcessed')}</span>
          </div>
          <div className="text-2xl font-mono font-bold text-slate-200">{analyses.length}</div>
        </div>
      </div>

      {/* Event feed */}
      <div className="bg-satellite-card border border-satellite-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-satellite-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={13} className="text-accent-orange" />
            <span className="text-xs text-slate-300">{t('ld.eventFeed')}</span>
          </div>
          <span className="text-[10px] text-slate-500">{t('ld.sorted')}</span>
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
              <div className="text-sm text-slate-300">{t('ld.allClear')}</div>
              <div className="text-[11px] text-slate-500 mt-1">
                {t('ld.allClearDesc')}
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
                            {alert.severity.toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-200">
                              {TYPE_LABELS[alert.alert_type] ?? alert.alert_type}
                              {analysis && analysis.image_name.startsWith('AUTO: baseline ') && (() => {
                                const parts = analysis.image_name.slice('AUTO: baseline '.length).split(' vs ');
                                return <span> · {t('cd.msgBaselineVs', { base: parts[0] ?? '', cur: parts[1] ?? '' })}</span>;
                              })()}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 break-words">{formatAlertMessage(alert.message, t)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] text-slate-500">{timeAgo(alert.created_at) === 'just now' ? t('ld.justNow') : timeAgo(alert.created_at)}</span>
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
                            <Crosshair size={10} /> {analysis.affected_area_percent.toFixed(1)}% {t('an.affected')}
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
                            <span className="font-semibold text-red-400 uppercase tracking-wider">{t('ld.reportGen')}</span>
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
                              <FileText size={10} /> {t('cd.download')}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5">
                            <div><span className="text-slate-500">{t('cd.disaster')}</span><div className="text-slate-200">{rep.disaster}</div></div>
                            <div><span className="text-slate-500">{t('cd.location')}</span><div className="text-slate-200">{rep.location}</div></div>
                            <div><span className="text-slate-500">{t('cd.affectedArea')}</span><div className="text-slate-200">{rep.affectedAreaKm2.toLocaleString()} km²</div></div>
                            <div><span className="text-slate-500">Population</span><div className="text-slate-200">~{rep.populationExposed.toLocaleString()} exposed</div></div>
                            <div><span className="text-slate-500">{t('cd.expansion')}</span><div className="text-slate-200">{rep.expansion}</div></div>
                            <div><span className="text-slate-500">{t('cd.priority')}</span><div className="text-slate-200">{rep.recommendedPriority}</div></div>
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
                          {generatingFor === alert.id ? t('ld.generating') : rep ? t('ld.reportGen') : t('ld.genReportBtn')}
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
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">{t('ld.severityLegend')}</div>
        <div className="flex flex-wrap gap-4 text-[11px]">
          {Object.entries(SEVERITY_META).map(([sev, meta]) => (
            <div key={sev} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: `${meta.color}66`, border: `1px solid ${meta.color}` }} />
              <span className="text-slate-400">{sev.toUpperCase()}</span>
            </div>
          ))}
        </div>
        {dismissError && <div className="text-[10px] text-red-400 mt-1">{dismissError}</div>}
      </div>
    </div>
  );
}
