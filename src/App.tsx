import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import Header from './components/Header';
import DashboardPage from './pages/DashboardPage';
import ColorizePage from './pages/ColorizePage';
import ChangeDetectionPage from './pages/ChangeDetectionPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AlertsPage from './pages/AlertsPage';
import LiveMonitorPage from './pages/LiveMonitorPage';
import { fetchAlerts, unsubscribeFromAlerts } from './lib/supabase';

type Page = 'dashboard' | 'live' | 'colorize' | 'change' | 'history' | 'alerts';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [alertCount, setAlertCount] = useState(0);
  const [unsubscribeStatus, setUnsubscribeStatus] = useState<'checking' | 'done' | 'error' | null>(null);

  const refreshAlertCount = useCallback(async () => {
    const alerts = await fetchAlerts(false);
    setAlertCount(alerts.length);
  }, []);

  useEffect(() => {
    refreshAlertCount();
  }, [refreshAlertCount]);

  // Handle alert-email unsubscribe links: /?unsubscribe=<subscriber-id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('unsubscribe');
    if (!id) return;
    setUnsubscribeStatus('checking');
    unsubscribeFromAlerts(id).then(({ error }) => {
      setUnsubscribeStatus(error ? 'error' : 'done');
    });
  }, []);

  const navigate = (p: string) => setPage(p as Page);

  if (unsubscribeStatus) {
    return (
      <div className="min-h-screen bg-satellite-bg grid-bg flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-satellite-card border border-satellite-border rounded-xl p-6 text-center">
          {unsubscribeStatus === 'checking' && <p className="text-slate-400 text-sm">Processing...</p>}
          {unsubscribeStatus === 'done' && (
            <>
              <CheckCircle2 size={32} className="text-green-400 mx-auto mb-3" />
              <p className="text-slate-200 font-medium">You've been unsubscribed</p>
              <p className="text-slate-500 text-xs mt-1">You won't receive ResQvision disaster alerts anymore.</p>
            </>
          )}
          {unsubscribeStatus === 'error' && (
            <>
              <XCircle size={32} className="text-red-400 mx-auto mb-3" />
              <p className="text-slate-200 font-medium">Something went wrong</p>
              <p className="text-slate-500 text-xs mt-1">That unsubscribe link may be invalid or already used.</p>
            </>
          )}
          <a href="/" className="inline-block mt-4 text-xs text-accent-orange hover:underline">Return to ResQvision</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-satellite-bg grid-bg">
      <Header activePage={page} onNavigate={navigate} alertCount={alertCount} />

      <main className="pt-14 min-h-screen">
        <div className="max-w-screen-2xl mx-auto px-4 py-5">
          {page === 'dashboard' && <DashboardPage onNavigate={navigate} />}
          {page === 'live' && <LiveMonitorPage onAlertsChanged={refreshAlertCount} />}
          {page === 'colorize' && <ColorizePage onAlertsChanged={refreshAlertCount} />}
          {page === 'change' && <ChangeDetectionPage onAlertsChanged={refreshAlertCount} />}
          {page === 'history' && <AnalyticsPage />}
          {page === 'alerts' && <AlertsPage onAlertsChanged={refreshAlertCount} />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-satellite-border bg-satellite-card/60 py-3 px-6">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between flex-wrap gap-2 text-[10px] text-slate-600 font-mono">
          <span>ResQvision — IR Satellite Image Analysis Platform</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span>All systems operational</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
