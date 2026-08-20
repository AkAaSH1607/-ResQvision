import { createClient } from '@supabase/supabase-js';
import type { SaveAnalysisPayload, AnalysisRecord, AlertRecord } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function saveAnalysis(payload: SaveAnalysisPayload): Promise<AnalysisRecord | null> {
  const { data, error } = await supabase
    .from('analyses')
    .insert(payload)
    .select()
    .maybeSingle();

  if (error) {
    console.error('saveAnalysis error:', error);
    return null;
  }
  return data;
}

export async function saveAlerts(
  analysisId: string,
  alerts: Array<{ alert_type: string; severity: string; message: string }>
): Promise<void> {
  if (alerts.length === 0) return;
  const rows = alerts.map(a => ({ ...a, analysis_id: analysisId }));
  const { error } = await supabase.from('alerts').insert(rows);
  if (error) console.error('saveAlerts error:', error);

  // Real delivery — only for high/critical, so low-severity alerts don't spam
  const urgent = alerts.filter(a => a.severity === 'high' || a.severity === 'critical');
  for (const alert of urgent) {
    notifyAlert(alert).catch(err => console.error('notifyAlert error:', err));
  }
}

/**
 * Sends a real email/SMS via the send-alert-notification edge function.
 * Requires RESEND_API_KEY + ALERT_EMAIL_TO (for email) and/or
 * TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER + ALERT_SMS_TO
 * (for SMS) set as Supabase secrets. Silently reports "skipped" for whichever
 * channel isn't configured — see the edge function for details.
 */
export async function notifyAlert(alert: { alert_type: string; severity: string; message: string }) {
  const { data, error } = await supabase.functions.invoke('send-alert-notification', {
    body: alert,
  });
  if (error) {
    console.error('notifyAlert failed:', error);
    return;
  }
  console.log('notifyAlert result:', data);
  return data;
}

export async function fetchAnalyses(limit = 50): Promise<AnalysisRecord[]> {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('fetchAnalyses error:', error);
    return [];
  }
  return data ?? [];
}

export async function fetchAlerts(dismissed = false): Promise<AlertRecord[]> {
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('is_dismissed', dismissed)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('fetchAlerts error:', error);
    return [];
  }
  return data ?? [];
}

export async function dismissAlert(id: string): Promise<void> {
  const { error } = await supabase
    .from('alerts')
    .update({ is_dismissed: true })
    .eq('id', id);
  if (error) console.error('dismissAlert error:', error);
}

export async function dismissAllAlerts(): Promise<void> {
  const { error } = await supabase
    .from('alerts')
    .update({ is_dismissed: true })
    .eq('is_dismissed', false);
  if (error) console.error('dismissAllAlerts error:', error);
}

export async function getAnalyticsSummary(): Promise<{
  totalAnalyses: number;
  avgPsnr: number;
  avgCloudCoverage: number;
  highSeverityCount: number;
}> {
  const { data, error } = await supabase
    .from('analyses')
    .select('psnr, cloud_coverage, change_severity');

  if (error || !data) {
    return { totalAnalyses: 0, avgPsnr: 0, avgCloudCoverage: 0, highSeverityCount: 0 };
  }

  const totalAnalyses = data.length;
  const avgPsnr = data.filter(d => d.psnr).reduce((s, d) => s + (d.psnr ?? 0), 0) / (totalAnalyses || 1);
  const avgCloudCoverage = data.filter(d => d.cloud_coverage).reduce((s, d) => s + (d.cloud_coverage ?? 0), 0) / (totalAnalyses || 1);
  const highSeverityCount = data.filter(d => d.change_severity === 'High' || d.change_severity === 'Critical').length;

  return {
    totalAnalyses,
    avgPsnr: parseFloat(avgPsnr.toFixed(2)),
    avgCloudCoverage: parseFloat(avgCloudCoverage.toFixed(1)),
    highSeverityCount,
  };
}

export async function subscribeToAlerts(email: string, region: string | null): Promise<{ error: string | null }> {
  const { error } = await supabase.from('alert_subscribers').insert({
    email: email.trim().toLowerCase(),
    region: region?.trim() || null,
  });
  return { error: error ? error.message : null };
}

export async function unsubscribeFromAlerts(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('alert_subscribers').update({ is_active: false }).eq('id', id);
  return { error: error ? error.message : null };
}
