import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AlertPayload {
  severity: string;
  message: string;
  alert_type?: string;
  region?: string; // optional — if set, only subscribers in this region get it
}

async function sendResendEmail(apiKey: string, to: string[], subject: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "ResQvision Alerts <onboarding@resend.dev>",
      to,
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

async function sendAdminEmail(payload: AlertPayload): Promise<string> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("ALERT_EMAIL_TO");
  if (!apiKey || !to) return "admin email skipped — RESEND_API_KEY or ALERT_EMAIL_TO not set";

  await sendResendEmail(
    apiKey,
    to.split(",").map((s) => s.trim()),
    `🚨 ResQvision ${payload.severity.toUpperCase()} Alert`,
    `${payload.message}\n\nType: ${payload.alert_type ?? "unspecified"}\nSeverity: ${payload.severity}\nTime: ${new Date().toISOString()}\n\nNo manual monitoring needed — this was raised automatically.`
  );
  return "admin email sent";
}

/**
 * Broadcasts to every active row in alert_subscribers — real members of the
 * public who signed up via the app, not just the fixed admin address. Each
 * email includes a personal unsubscribe link (the subscriber's own row id
 * acts as an unguessable token, so no login system is needed).
 */
async function sendPublicBroadcast(payload: AlertPayload): Promise<string> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return "public broadcast skipped — RESEND_API_KEY not set";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return "public broadcast skipped — service role env vars missing";

  const supabase = createClient(supabaseUrl, serviceKey);
  let query = supabase.from("alert_subscribers").select("id, email, region").eq("is_active", true);
  if (payload.region) {
    query = query.or(`region.eq.${payload.region},region.is.null`);
  }
  const { data: subscribers, error } = await query;
  if (error) throw new Error(`Failed to load subscribers: ${error.message}`);
  if (!subscribers || subscribers.length === 0) return "public broadcast: 0 active subscribers";

  const siteUrl = Deno.env.get("SITE_URL") ?? "";
  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    try {
      const unsubscribeLink = siteUrl
        ? `${siteUrl}/?unsubscribe=${sub.id}`
        : `(unsubscribe link needs SITE_URL env var configured)`;
      await sendResendEmail(
        apiKey,
        [sub.email],
        `🚨 ResQvision ${payload.severity.toUpperCase()} Disaster Alert`,
        `${payload.message}\n\nType: ${payload.alert_type ?? "unspecified"}\nSeverity: ${payload.severity}\nTime: ${new Date().toISOString()}\n\n---\nYou're receiving this because you subscribed to ResQvision disaster alerts.\nUnsubscribe: ${unsubscribeLink}`
      );
      sent++;
    } catch {
      failed++;
    }
  }
  return `public broadcast: ${sent} sent, ${failed} failed, out of ${subscribers.length} active subscribers`;
}

async function sendSMS(payload: AlertPayload): Promise<string> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  const to = Deno.env.get("ALERT_SMS_TO");
  if (!sid || !token || !from || !to) {
    return "sms skipped — TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER/ALERT_SMS_TO not all set";
  }

  const recipients = to.split(",").map((s) => s.trim());
  const results: string[] = [];

  for (const recipient of recipients) {
    const body = new URLSearchParams({
      To: recipient,
      From: from,
      Body: `ResQvision ${payload.severity.toUpperCase()} ALERT: ${payload.message}`,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );
    if (!res.ok) {
      const errBody = await res.text();
      results.push(`FAILED for ${recipient}: ${res.status} ${errBody}`);
    } else {
      results.push(`sent to ${recipient}`);
    }
  }
  return results.join("; ");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as AlertPayload;
    if (!payload?.message || !payload?.severity) {
      return new Response(JSON.stringify({ error: "message and severity are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [adminResult, broadcastResult, smsResult] = await Promise.allSettled([
      sendAdminEmail(payload),
      sendPublicBroadcast(payload),
      sendSMS(payload),
    ]);

    return new Response(
      JSON.stringify({
        admin_email: adminResult.status === "fulfilled" ? adminResult.value : `error: ${adminResult.reason}`,
        public_broadcast: broadcastResult.status === "fulfilled" ? broadcastResult.value : `error: ${broadcastResult.reason}`,
        sms: smsResult.status === "fulfilled" ? smsResult.value : `error: ${smsResult.reason}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
