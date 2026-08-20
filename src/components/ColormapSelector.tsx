import { getColormapPreview } from '../lib/colormaps';
import type { ColormapName } from '../lib/types';

interface Props {
  selected: ColormapName;
  onChange: (c: ColormapName) => void;
  intensity: number;
  onIntensityChange: (v: number) => void;
}

const MAPS: ColormapName[] = ['JET', 'TURBO', 'INFERNO', 'PLASMA'];

const descriptions: Record<ColormapName, string> = {
  JET: 'Blue→Cyan→Yellow→Red. Classic thermal mapping.',
  TURBO: 'Improved rainbow. Better perceptual uniformity.',
  INFERNO: 'Black→Purple→Yellow. High contrast dark scenes.',
  PLASMA: 'Purple→Pink→Yellow. Smooth scientific visualization.',
};

export default function ColormapSelector({ selected, onChange, intensity, onIntensityChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Color Map</div>
        <div className="grid grid-cols-2 gap-2">
          {MAPS.map(name => (
            <button
              key={name}
              onClick={() => onChange(name)}
              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                selected === name
                  ? 'border-accent-orange shadow-lg shadow-accent-orange/20'
                  : 'border-satellite-border hover:border-slate-500'
              }`}
            >
              <div
                className="h-6 w-full"
                style={{ background: getColormapPreview(name) }}
              />
              <div className={`px-2 py-1 text-[11px] font-mono ${selected === name ? 'text-accent-orange bg-accent-orange/10' : 'text-slate-400 bg-satellite-card'}`}>
                {name}
              </div>
            </button>
          ))}
        </div>
        {selected && (
          <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
            {descriptions[selected]}
          </p>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <div className="text-xs text-slate-400 uppercase tracking-wider">Intensity</div>
          <div className="text-xs font-mono text-accent-orange">{intensity.toFixed(2)}x</div>
        </div>
        <input
          type="range"
          min={0.3}
          max={2.5}
          step={0.05}
          value={intensity}
          onChange={e => onIntensityChange(parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-slate-600 mt-1">
          <span>0.3×</span>
          <span>1.0×</span>
          <span>2.5×</span>
        </div>
      </div>
    </div>
  );
}
