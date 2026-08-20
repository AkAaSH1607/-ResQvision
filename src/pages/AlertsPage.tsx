import { useEffect, useState } from 'react';
import { Bell, CheckCheck, AlertTriangle, Info, Flame, CloudRain, Leaf, Mail, Send, MapPin } from 'lucide-react';
import SubscribeForm from '../components/SubscribeForm';
import { fetchAlerts, dismissAlert, dismissAllAlerts } from '../lib/supabase';
import type { AlertRecord } from '../lib/types';

function alertIcon(type: string) {
  switch (type) {
    case 'high_cloud': return <CloudRain size={14} className="text-blue-400" />;
    case 'heat_anomaly': return <Flame size={14} className="text-orange-400" />;
    case 'storm': return <AlertTriangle size={14} className="text-red-400" />;
    case 'change_detected': return <AlertTriangle size={14} className="text-red-400" />;
    case 'vegetation_loss': return <Leaf size={14} className="text-yellow-400" />;
    default: return <Info size={14} className="text-slate-400" />;
  }
}

const SEVERITY_STYLES: Record<string, string> = {
  low: 'border-green-900/40 bg-green-900/10 text-green-400',
  medium: 'border-yellow-900/40 bg-yellow-900/10 text-yellow-400',
  high: 'border-red-900/40 bg-red-900/10 text-red-400',
  critical: 'border-red-700/60 bg-red-900/20 text-red-300',
};

/**
 * Parses the structured region suffix appended by ChangeDetectionPage alerts:
 * " — worst affected zone: North-West (NW) (10,20)→(300,400), 68.5% of zone pixels changed (intensity 94.2/255)"
 */
function extractAffectedRegion(message: string): {
  zone: string; bbox: string; zonePercent: string; intensity: string; base: string;
} | null {
  const match = message.match(/ — worst affected zone: (.+?) \((\d+,\d+)→(\d+,\d+)\), ([\d.]+)% of zone pixels changed \(intensity ([\d.]+)\/255\)/);
  if (!match) return null;
  const [, zone, from, to, pct, intensity] = match;
  return {
    zone: zone.replace(/ \(.*?\)$/, ''),
    bbox: `${from} → ${to}`,
    zonePercent: `${pct}%`,
    intensity: `${intensity}/255`,
    base: message.split(' — worst affected zone:')[0],
  };
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SubscribeFormBlock() {
  return (
    <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Mail size={13} className="text-accent-orange" />
        <span className="text-sm font-semibold text-slate-200">Get Disaster Alerts by Email</span>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        Sign up to receive a real email the moment a high-severity change is detected — this is a
        real, working notification, not a demo. Alerts now include the most affected region. Unsubscribe
        anytime via the link in any alert email.
      </p>
      <SubscribeForm />
    </div>
  );
}

export default function AlertsPage({ onAlertsChanged }: { onAlertsChanged: () => void }) {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await fetchAlerts(false);
    setAlerts(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDismiss = async (id: string) => {
    await dismissAlert(id);
    setAlerts(prev => prev.filter(a => a.id !== id));
    onAlertsChanged();
  };

  const handleDismissAll = async () => {
    await dismissAllAlerts();
    setAlerts([]);
    onAlertsChanged();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <SubscribeFormBlock />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-accent-orange" />
          <span className="text-sm text-slate-200">
            {loading ? '...' : `${alerts.length} Active Alert${alerts.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        {alerts.length > 0 && (
          <button
            onClick={handleDismissAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 border border-satellite-border hover:border-slate-500 transition-all"
          >
            <CheckCheck size={12} />
            Dismiss All
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-16 bg-satellite-card rounded-xl animate-pulse border border-satellite-border" />
          ))}
        </div>
      )}

      {!loading && alerts.length === 0 && (
        <div className="text-center py-16 bg-satellite-card border border-satellite-border rounded-xl">
          <CheckCheck size={32} className="text-green-400 mx-auto mb-3" />
          <div className="text-slate-300 font-medium">All clear</div>
          <div className="text-slate-500 text-sm mt-1">No active alerts at this time</div>
        </div>
      )}

      <div className="space-y-2">
        {alerts.map(alert => {
          const region = extractAffectedRegion(alert.message);
          return (
          <div
            key={alert.id}
            className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.low}`}
          >
            <div className="mt-0.5 flex-shrink-0">{alertIcon(alert.alert_type)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-200">{region ? region.base : alert.message}</div>
              {region && (
                <div className="mt-2 rounded-lg border border-current/15 bg-black/15 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <MapPin size={11} className="text-current" />
                    <span className="text-[10px] uppercase tracking-wider opacity-70">Most Affected Region</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    <div className="text-slate-500">Zone</div>
                    <div className="text-slate-200 font-medium">{region.zone}</div>
                    <div className="text-slate-500">Bounding Box</div>
                    <div className="text-slate-200 font-mono text-[10px]">{region.bbox} px</div>
                    <div className="text-slate-500">Zone Change</div>
                    <div className="text-current font-mono">{region.zonePercent}</div>
                    <div className="text-slate-500">Change Intensity</div>
                    <div className="text-slate-200 font-mono">{region.intensity}</div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px] font-mono uppercase text-slate-500">{alert.alert_type.replace(/_/g, ' ')}</span>
                <span className="text-[10px] text-slate-600">{formatRelative(alert.created_at)}</span>
              </div>
            </div>
            <button
              onClick={() => handleDismiss(alert.id)}
              className="flex-shrink-0 px-2 py-1 text-[10px] rounded-lg border border-current/20 hover:bg-current/10 transition-colors"
            >
              Dismiss
            </button>
          </div>
          );
        })}
      </div>
    </div>
  );
}
