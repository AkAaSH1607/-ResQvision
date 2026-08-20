import { Satellite, Activity, Bell, Database, Radio } from 'lucide-react';

interface HeaderProps {
  activePage: string;
  onNavigate: (page: string) => void;
  alertCount: number;
}

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: Satellite },
  { id: 'live', label: 'Live Monitor', icon: Radio, highlight: true },
  { id: 'colorize', label: 'IR Colorize', icon: Activity },
  { id: 'change', label: 'Change Detection', icon: Activity },
  { id: 'history', label: 'Analytics', icon: Database },
];

export default function Header({ activePage, onNavigate, alertCount }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-satellite-border bg-satellite-card/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 h-14">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-orange to-accent-blue flex items-center justify-center">
            <Satellite size={16} className="text-white" />
          </div>
          <div className="leading-none">
            <div className="text-sm font-semibold text-white">ResQvision</div>
            <div className="text-[10px] text-slate-400 font-mono">IR Analysis Platform</div>
          </div>

        </div>

        {/* Nav Tabs */}
        <nav className="hidden md:flex items-center gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg transition-all ${
                activePage === tab.id
                  ? 'bg-accent-orange/15 text-accent-orange border border-accent-orange/25'
                  : tab.highlight
                  ? 'text-green-400 hover:text-green-300 hover:bg-green-400/10 border border-green-400/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-satellite-muted/50'
              }`}
            >
              {tab.highlight && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[11px] text-slate-400 font-mono">LIVE</span>
          </div>
          <button
            onClick={() => onNavigate('alerts')}
            className="relative p-2 rounded-lg hover:bg-satellite-muted/50 transition-colors"
          >
            <Bell size={16} className={alertCount > 0 ? 'text-accent-orange' : 'text-slate-400'} />
            {alertCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-accent-orange text-[9px] font-bold text-white flex items-center justify-center">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden flex overflow-x-auto border-t border-satellite-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            className={`flex-shrink-0 px-4 py-2 text-xs transition-all ${
              activePage === tab.id
                ? 'text-accent-orange border-b-2 border-accent-orange bg-accent-orange/10'
                : 'text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
}
