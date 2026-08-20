import { useState } from 'react';
import { Bell, CheckCheck, Mail, Send } from 'lucide-react';
import { subscribeToAlerts } from '../lib/supabase';

/**
 * Reusable alert subscription form used on the Alerts page and the Live
 * Monitor sidebar. Robust by design: validates the email before sending,
 * shows explicit success/error states, retries once on transient failure,
 * and never silently fails.
 */
export default function SubscribeForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid) {
      setStatus('error');
      setErrorMsg('Please enter a valid email address (e.g. you@example.com).');
      return;
    }
    setStatus('sending');
    setErrorMsg('');

    // Attempt the subscription, retrying once on transient failure.
    let result = await subscribeToAlerts(email, region || null);
    if (result.error) {
      await new Promise(r => setTimeout(r, 800));
      result = await subscribeToAlerts(email, region || null);
    }
    if (result.error) {
      setStatus('error');
      setErrorMsg(
        `Couldn't complete the subscription: ${result.error}. If the problem persists, the alert_subscribers table may need the migration applied in the Supabase SQL editor.`
      );
    } else {
      setStatus('done');
      setEmail('');
      setRegion('');
    }
  };

  if (status === 'done') {
    return (
      <div className="text-xs text-green-400 flex items-center gap-2">
        <CheckCheck size={14} />
        <span>Subscribed! High-severity alerts (with the affected region) will be emailed to you.</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Bell size={11} className="text-accent-orange" />
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Email Disaster Alerts</span>
        </div>
        {status === 'error' && <div className="text-[10px] text-red-400 mb-1.5">{errorMsg}</div>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={e => { setEmail(e.target.value); if (status === 'error') setStatus('idle'); }}
            className="bg-satellite-bg border border-satellite-border rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-accent-orange/50"
          />
          <input
            type="text"
            placeholder="Region (optional, e.g. Tamil Nadu)"
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="bg-satellite-bg border border-satellite-border rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-accent-orange/50"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-orange/15 border border-accent-orange/40 text-accent-orange text-[11px] font-medium hover:bg-accent-orange/25 disabled:opacity-50 transition-colors"
          >
            <Send size={11} />
            {status === 'sending' ? 'Subscribing…' : 'Subscribe'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Mail size={13} className="text-accent-orange" />
        <span className="text-sm font-semibold text-slate-200">Get Disaster Alerts by Email</span>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        Sign up to receive a real email the moment a high-severity change is detected — alerts now
        include the most affected region (zone, coordinates, and change intensity). Unsubscribe
        anytime via the link in any alert email.
      </p>
      {status === 'error' && <div className="text-[11px] text-red-400 mb-2">{errorMsg}</div>}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={e => { setEmail(e.target.value); if (status === 'error') setStatus('idle'); }}
          className="flex-1 bg-satellite-bg border border-satellite-border rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-accent-orange/50"
        />
        <input
          type="text"
          placeholder="Region (optional, e.g. Kerala)"
          value={region}
          onChange={e => setRegion(e.target.value)}
          className="sm:w-48 bg-satellite-bg border border-satellite-border rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-accent-orange/50"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-accent-orange/15 border border-accent-orange/40 text-accent-orange text-xs font-medium hover:bg-accent-orange/25 disabled:opacity-50 transition-colors"
        >
          <Send size={12} />
          {status === 'sending' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>
    </div>
  );
}
