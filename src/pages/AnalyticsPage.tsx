import { useEffect, useState } from 'react';
import { Database, TrendingUp, CloudLightning, Thermometer, Activity } from 'lucide-react';
import { fetchAnalyses, getAnalyticsSummary } from '../lib/supabase';
import type { AnalysisRecord } from '../lib/types';
import { useLanguage } from '../lib/i18n';

function formatDate(str: string) {
  return new Date(str).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const SEVERITY_DOT: Record<string, string> = {
  None: '#10B981',
  Low: '#84CC16',
  Moderate: '#F59E0B',
  High: '#EF4444',
  Critical: '#DC2626',
};

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-satellite-card border border-satellite-border rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <div className="text-xl font-mono font-bold text-slate-100">{value}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useLanguage();
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [summary, setSummary] = useState({ totalAnalyses: 0, avgPsnr: 0, avgCloudCoverage: 0, highSeverityCount: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [data, sum] = await Promise.all([fetchAnalyses(100), getAnalyticsSummary()]);
      setRecords(data);
      setSummary(sum);
      setLoading(false);
    })();
  }, []);

  const filtered = filter === 'all' ? records : records.filter(r => r.analysis_type === filter);

  return (
    <div className="space-y-5">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Activity} label={t('an.totalAnalyses')} value={summary.totalAnalyses} color="#FF6B35" />
        <StatCard icon={TrendingUp} label={t('an.avgPSNR')} value={summary.avgPsnr.toFixed(1)} color="#10B981" />
        <StatCard icon={CloudLightning} label={t('an.avgCloud')} value={`${summary.avgCloudCoverage.toFixed(0)}%`} color="#3B82F6" />
        <StatCard icon={Thermometer} label={t('an.highSeverity')} value={summary.highSeverityCount} color="#EF4444" />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Database size={12} className="text-slate-500" />
        <span className="text-xs text-slate-500">{t('an.filter')}:</span>
        {['all', 'full', 'change_detection'].map(k => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1 rounded-lg text-xs transition-all ${
              filter === k
                ? 'bg-accent-orange/15 text-accent-orange border border-accent-orange/25'
                : 'text-slate-400 hover:text-slate-200 border border-satellite-border hover:border-slate-500'
            }`}
          >
            {k === 'all' ? t('an.allTypes') : k === 'full' ? t('cp.colorizeNow') : t('cd.title')}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-satellite-card border border-satellite-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-satellite-border bg-satellite-bg/50">
                <th className="px-4 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider">{t('an.date')}</th>
                <th className="px-4 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider">Image</th>
                <th className="px-4 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider">{t('an.type')}</th>
                <th className="px-4 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider">{t('an.satellite')}</th>
                <th className="px-4 py-3 text-right text-[10px] text-slate-500 uppercase tracking-wider">{t('an.psnr')}</th>
                <th className="px-4 py-3 text-right text-[10px] text-slate-500 uppercase tracking-wider">{t('an.ssim')}</th>
                <th className="px-4 py-3 text-right text-[10px] text-slate-500 uppercase tracking-wider">Cloud%</th>
                <th className="px-4 py-3 text-right text-[10px] text-slate-500 uppercase tracking-wider">Weather</th>
                <th className="px-4 py-3 text-right text-[10px] text-slate-500 uppercase tracking-wider">{t('an.severity')}</th>
                <th className="px-4 py-3 text-right text-[10px] text-slate-500 uppercase tracking-wider">ms</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-satellite-border/50">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-satellite-border rounded animate-pulse" style={{ width: `${60 + j * 5}%` }} />
                    </td>
                  ))}
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-600">
                    {t('an.noHistory')} — {t('an.noHistoryDesc')}
                  </td>
                </tr>
              )}

              {!loading && filtered.map(r => (
                <tr key={r.id} className="border-b border-satellite-border/40 hover:bg-satellite-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-slate-500 font-mono whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-slate-300 max-w-32 truncate">{r.image_name}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent-orange/10 text-accent-orange border border-accent-orange/20">
                      {r.analysis_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{r.satellite_type ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-green-400">{r.psnr?.toFixed(1) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-blue-400">{r.ssim?.toFixed(3) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-300">{r.cloud_coverage?.toFixed(0) ?? '—'}%</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{r.weather_condition ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.change_severity && r.change_severity !== 'None' ? (
                      <span className="flex items-center justify-end gap-1">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: SEVERITY_DOT[r.change_severity] ?? '#94A3B8' }} />
                        <span style={{ color: SEVERITY_DOT[r.change_severity] ?? '#94A3B8' }}>{r.change_severity}</span>
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-500">{r.processing_time_ms ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
