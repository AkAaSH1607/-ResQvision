import { TrendingUp, Eye, BarChart3, Cloud } from 'lucide-react';
import { useLanguage } from '../lib/i18n';
import type { QualityMetrics } from '../lib/types';

interface Props {
  metrics: QualityMetrics | null;
  loading?: boolean;
}

function MetricItem({
  icon: Icon,
  label,
  value,
  unit,
  description,
  color,
  progress,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  unit?: string;
  description: string;
  color: string;
  progress?: number;
}) {
  return (
    <div className="metric-card">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon size={13} className={color} />
          <span className="text-[11px] text-slate-400 uppercase tracking-wider">{label}</span>
        </div>
        <div className={`text-sm font-mono font-medium ${color}`}>
          {value}{unit && <span className="text-[10px] ml-0.5 text-slate-500">{unit}</span>}
        </div>
      </div>
      {progress !== undefined && (
        <div className="mt-2 h-1.5 bg-satellite-border rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              background: `linear-gradient(90deg, #004E89, ${color.includes('green') ? '#10B981' : color.includes('yellow') ? '#F59E0B' : '#FF6B35'})`,
            }}
          />
        </div>
      )}
      <div className="text-[10px] text-slate-600 mt-1">{description}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="metric-card animate-pulse">
      <div className="h-3 bg-satellite-border rounded w-20 mb-2" />
      <div className="h-5 bg-satellite-border rounded w-16" />
    </div>
  );
}

export default function QualityMetrics({ metrics, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} />)}
      </div>
    );
  }

  const { t } = useLanguage();

  if (!metrics) {
    return (
      <div className="text-center py-6 text-slate-600 text-sm">
        {t('cp.metricsEmpty')}
      </div>
    );
  }

  const psnrQuality = metrics.psnr >= 40 ? 'text-green-400' : metrics.psnr >= 30 ? 'text-yellow-400' : 'text-red-400';
  const ssimQuality = metrics.ssim >= 0.9 ? 'text-green-400' : metrics.ssim >= 0.7 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-2">
      <MetricItem
        icon={TrendingUp}
        label={t('cp.psnr')}
        value={metrics.psnr.toFixed(2)}
        unit="dB"
        description={t('cp.psnrDesc')}
        color={psnrQuality}
        progress={(metrics.psnr / 50) * 100}
      />
      <MetricItem
        icon={Eye}
        label={t('cp.ssim')}
        value={metrics.ssim.toFixed(4)}
        description={t('cp.ssimDesc')}
        color={ssimQuality}
        progress={metrics.ssim * 100}
      />
      <MetricItem
        icon={BarChart3}
        label={t('cp.fid')}
        value={metrics.fid.toFixed(2)}
        description={t('cp.fidDesc')}
        color="text-blue-400"
        progress={Math.max(0, 100 - metrics.fid * 5)}
      />
      <MetricItem
        icon={Cloud}
        label={t('cp.cloudCover')}
        value={metrics.cloudCoverage.toFixed(1)}
        unit="%"
        description={t('cp.cloudCoverDesc')}
        color={metrics.cloudCoverage > 60 ? 'text-yellow-400' : 'text-slate-300'}
        progress={metrics.cloudCoverage}
      />
    </div>
  );
}
