import { Cloud, Droplets, Thermometer, Leaf, Sun, CloudRain } from 'lucide-react';
import type { SceneAnalysisResult } from '../lib/types';

interface Props {
  result: SceneAnalysisResult | null;
  loading?: boolean;
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 bg-satellite-border rounded-full overflow-hidden mt-1">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, value)}%`, background: color }}
      />
    </div>
  );
}

function WeatherIcon({ condition }: { condition: string }) {
  const size = 20;
  switch (condition) {
    case 'Clear': return <Sun size={size} className="text-yellow-400" />;
    case 'Partly Cloudy': return <Cloud size={size} className="text-slate-300" />;
    case 'Overcast': return <Cloud size={size} className="text-slate-400" />;
    case 'Storm': return <CloudRain size={size} className="text-blue-400" />;
    default: return <Sun size={size} className="text-yellow-400" />;
  }
}

function ndviColor(ndvi: number): string {
  if (ndvi > 0.5) return '#10B981';
  if (ndvi > 0.2) return '#84CC16';
  if (ndvi > 0) return '#EAB308';
  return '#EF4444';
}

function ndviLabel(ndvi: number): string {
  if (ndvi > 0.6) return 'Dense Vegetation';
  if (ndvi > 0.3) return 'Moderate Vegetation';
  if (ndvi > 0.1) return 'Sparse Vegetation';
  if (ndvi > -0.1) return 'Bare Soil';
  return 'Water / No Vegetation';
}

export default function SceneAnalysis({ result, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-12 bg-satellite-border rounded-lg" />
        ))}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-6 text-slate-600 text-sm">
        Upload an image to analyze scene content
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Weather */}
      <div className="metric-card flex items-center gap-3">
        <WeatherIcon condition={result.weather} />
        <div className="flex-1">
          <div className="text-xs text-slate-400">Weather Condition</div>
          <div className="text-sm text-white font-medium">{result.weather}</div>
          <div className="text-[10px] text-slate-500">{result.cloudPercent.toFixed(1)}% cloud cover detected</div>
        </div>
      </div>

      {/* NDVI */}
      <div className="metric-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf size={13} className="text-green-400" />
            <span className="text-[11px] text-slate-400 uppercase tracking-wider">NDVI Index</span>
          </div>
          <span className="text-sm font-mono" style={{ color: ndviColor(result.ndvi) }}>
            {result.ndvi > 0 ? '+' : ''}{result.ndvi.toFixed(3)}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">{ndviLabel(result.ndvi)}</div>
        <div className="mt-2 relative h-1.5 bg-satellite-border rounded-full overflow-hidden">
          <div
            className="absolute h-full rounded-full transition-all duration-700"
            style={{
              left: '50%',
              width: `${Math.abs(result.ndvi) * 50}%`,
              transform: result.ndvi < 0 ? 'translateX(-100%)' : 'none',
              background: ndviColor(result.ndvi),
            }}
          />
          <div className="absolute top-0 left-1/2 w-0.5 h-full bg-slate-500" />
        </div>
        <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
          <span>-1.0</span><span>0</span><span>+1.0</span>
        </div>
      </div>

      {/* Water Bodies */}
      <div className="metric-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplets size={13} className="text-blue-400" />
            <span className="text-[11px] text-slate-400 uppercase tracking-wider">Water Bodies</span>
          </div>
          <span className="text-sm font-mono text-blue-400">{result.waterBodiesPercent.toFixed(1)}%</span>
        </div>
        <Bar value={result.waterBodiesPercent} color="linear-gradient(90deg, #1D4ED8, #3B82F6)" />
        <div className="text-[10px] text-slate-500 mt-1">Rivers, lakes, coastal areas identified</div>
      </div>

      {/* Urban Heat */}
      <div className="metric-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Thermometer size={13} className="text-orange-400" />
            <span className="text-[11px] text-slate-400 uppercase tracking-wider">Urban Heat Islands</span>
          </div>
          <span className="text-sm font-mono text-orange-400">{result.urbanHeatPercent.toFixed(1)}%</span>
        </div>
        <Bar value={result.urbanHeatPercent} color="linear-gradient(90deg, #EA580C, #F97316)" />
        <div className="text-[10px] text-slate-500 mt-1">Hotspot regions detected</div>
      </div>

      {/* Vegetation */}
      <div className="metric-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf size={13} className="text-green-400" />
            <span className="text-[11px] text-slate-400 uppercase tracking-wider">Vegetation Cover</span>
          </div>
          <span className="text-sm font-mono text-green-400">{result.vegetationPercent.toFixed(1)}%</span>
        </div>
        <Bar value={result.vegetationPercent} color="linear-gradient(90deg, #065F46, #10B981)" />
        <div className="text-[10px] text-slate-500 mt-1">Forest, crops, grasslands</div>
      </div>

      {/* Legend */}
      <div className="mt-2 p-3 bg-satellite-bg/50 rounded-lg border border-satellite-border">
        <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">Scene Legend</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {[
            { color: '#3B82F6', label: 'Water' },
            { color: '#10B981', label: 'Vegetation' },
            { color: '#F97316', label: 'Urban/Hot' },
            { color: '#94A3B8', label: 'Cloud' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
              <span className="text-[10px] text-slate-400">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
