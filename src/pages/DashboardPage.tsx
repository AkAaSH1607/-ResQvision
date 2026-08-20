import { useEffect, useState } from 'react';
import { Satellite, Zap, Shield, Globe, ArrowRight, Activity } from 'lucide-react';
import { getAnalyticsSummary } from '../lib/supabase';
import { getColormapPreview } from '../lib/colormaps';
import { useLanguage } from '../lib/i18n';

interface Props {
  onNavigate: (page: string) => void;
}

const FEATURES = [
  {
    icon: '🎨',
    title: 'dash.featColorizeTitle',
    desc: 'dash.featColorizeDesc',
    page: 'colorize',
    color: '#FF6B35',
    tags: ['JET', 'TURBO', 'INFERNO', 'PLASMA'],
  },
  {
    icon: '📊',
    title: 'dash.featQualityTitle',
    desc: 'dash.featQualityDesc',
    page: 'colorize',
    color: '#10B981',
    tags: ['PSNR', 'SSIM', 'FID', 'Cloud%'],
  },
  {
    icon: '🌍',
    title: 'dash.featSceneTitle',
    desc: 'dash.featSceneDesc',
    page: 'colorize',
    color: '#3B82F6',
    tags: ['NDVI', 'Weather', 'Water', 'UHI'],
  },
  {
    icon: '⚡',
    title: 'dash.featChangeTitle',
    desc: 'dash.featChangeDesc',
    page: 'change',
    color: '#EF4444',
    tags: ['Before/After', 'Severity', 'Alert'],
  },
  {
    icon: '🛰️',
    title: 'dash.featMultiTitle',
    desc: 'dash.featMultiDesc',
    page: 'colorize',
    color: '#F59E0B',
    tags: ['INSAT-3DS', 'Sentinel-1', 'Cartosat-3'],
  },
  {
    icon: '🔔',
    title: 'dash.featAlertsTitle',
    desc: 'dash.featAlertsDesc',
    page: 'alerts',
    color: '#8B5CF6',
    tags: ['Auto-detect', 'Threshold', 'Severity'],
  },
];

const COLORMAPS = ['JET', 'TURBO', 'INFERNO', 'PLASMA'] as const;

export default function DashboardPage({ onNavigate }: Props) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState({ totalAnalyses: 0, avgPsnr: 0, avgCloudCoverage: 0, highSeverityCount: 0 });

  useEffect(() => {
    getAnalyticsSummary().then(setSummary);
  }, []);

  return (
    <div className="space-y-8 pb-8">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden border border-satellite-border bg-satellite-card">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent-orange/5 rounded-full -translate-y-32 translate-x-32 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent-blue/10 rounded-full translate-y-24 -translate-x-24 blur-3xl" />

        <div className="relative px-6 py-8 md:px-10 md:py-12">
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div className="max-w-2xl">

              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                <span className="text-accent-orange">IR {t('cp.colormap')}</span> {t('cp.colorizeNow')}<br />
                & Disaster Analysis
              </h1>
              <p className="mt-3 text-slate-400 text-sm leading-relaxed max-w-lg">
                {t('dash.heroSubtitle')}
              </p>
              <div className="flex flex-wrap gap-3 mt-6">
                <button
                  onClick={() => onNavigate('colorize')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-orange text-white text-sm font-medium hover:bg-accent-orange/90 transition-all shadow-lg shadow-accent-orange/20"
                >
                  <Zap size={15} />
                  {t('dash.startAnalysis')}
                </button>
                <button
                  onClick={() => onNavigate('change')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-satellite-muted/50 text-slate-200 text-sm border border-satellite-border hover:border-slate-500 transition-all"
                >
                  <Shield size={15} />
                  {t('dash.disasterDetection')}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {COLORMAPS.map(name => (
                <div key={name} className="flex items-center gap-2">
                  <div
                    className="w-24 h-4 rounded"
                    style={{ background: getColormapPreview(name) }}
                  />
                  <span className="text-[10px] font-mono text-slate-500">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t('an.totalAnalyses'), value: summary.totalAnalyses, icon: Activity, color: '#FF6B35' },
          { label: t('an.avgPSNR'), value: summary.avgPsnr > 0 ? `${summary.avgPsnr.toFixed(1)} dB` : '—', icon: Satellite, color: '#10B981' },
          { label: t('an.avgCloud'), value: summary.avgCloudCoverage > 0 ? `${summary.avgCloudCoverage.toFixed(0)}%` : '—', icon: Globe, color: '#3B82F6' },
          { label: t('an.highSeverity'), value: summary.highSeverityCount, icon: Shield, color: '#EF4444' },
        ].map(stat => (
          <div key={stat.label} className="bg-satellite-card border border-satellite-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={12} style={{ color: stat.color }} />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">{stat.label}</span>
            </div>
            <div className="text-2xl font-mono font-bold" style={{ color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">{t('dash.featureCards')}</h2>
                <span className="text-[10px] text-slate-500 font-mono">{t('dash.modulesActive')}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {FEATURES.map(f => (
            <button
              key={f.title}
              onClick={() => onNavigate(f.page)}
              className="text-left bg-satellite-card border border-satellite-border rounded-xl p-5 hover:border-opacity-60 transition-all group"
              style={{ '--hover-color': f.color } as React.CSSProperties}
              onMouseEnter={e => (e.currentTarget.style.borderColor = f.color + '60')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <div className="text-sm font-semibold text-slate-200 mb-1.5">{t(f.title)}</div>
              <div className="text-xs text-slate-500 leading-relaxed mb-3">{t(f.desc)}</div>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {f.tags.map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ color: f.color, backgroundColor: f.color + '15', border: `1px solid ${f.color}25` }}>
                      {t}
                    </span>
                  ))}
                </div>
                <ArrowRight size={12} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Process Flow */}
      <div className="bg-satellite-card border border-satellite-border rounded-xl p-6">
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-5">{t('dash.workflow')}</div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { step: '01', label: t('cp.upload'), color: '#FF6B35' },
            { step: '02', label: 'Preprocessing', color: '#F59E0B' },
            { step: '03', label: 'Colorization Engine', color: '#10B981' },
            { step: '04', label: t('cp.qualityMetrics'), color: '#3B82F6' },
            { step: '05', label: t('cp.sceneAnalysis'), color: '#8B5CF6' },
            { step: '06', label: `${t('al.title')} & ${t('cp.export')}`, color: '#EF4444' },
          ].map((s, i, arr) => (
            <div key={s.step} className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-satellite-bg border border-satellite-border">
                <span className="text-[9px] font-mono text-slate-500">{s.step}</span>
                <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
              </div>
              {i < arr.length - 1 && <ArrowRight size={12} className="text-slate-700 flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
