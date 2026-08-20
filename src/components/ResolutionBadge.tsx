import type { SatelliteType } from '../lib/types';

interface Props {
  selected: SatelliteType;
  onChange: (s: SatelliteType) => void;
}

const OPTIONS: Array<{ value: SatelliteType; resolution: string; level: string; color: string }> = [
  { value: 'INSAT-3DS', resolution: '4 km/px', level: 'State Level', color: '#FF6B35' },
  { value: 'Landsat 8/9', resolution: '30 m/px', level: 'Region Level', color: '#F59E0B' },
  { value: 'Sentinel-1', resolution: '10 m/px', level: 'District Level', color: '#10B981' },
  { value: 'Cartosat-3', resolution: '0.25 m/px', level: 'Street Level', color: '#3B82F6' },
];

export default function ResolutionBadge({ selected, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Satellite / Resolution</div>
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-left ${
            selected === opt.value
              ? 'border-opacity-60 bg-opacity-10'
              : 'border-satellite-border bg-satellite-card/30 hover:border-slate-500'
          }`}
          style={selected === opt.value ? {
            borderColor: opt.color + '99',
            backgroundColor: opt.color + '18',
          } : {}}
        >
          <div>
            <div className="text-xs font-medium text-slate-200">{opt.value}</div>
            <div className="text-[10px] text-slate-500">{opt.level}</div>
          </div>
          <div
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={selected === opt.value ? { color: opt.color, backgroundColor: opt.color + '20' } : { color: '#64748b' }}
          >
            {opt.resolution}
          </div>
        </button>
      ))}
    </div>
  );
}
