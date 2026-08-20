import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Expose-Headers": "X-Himawari-Timestamp",
};

/**
 * Himawari-8/9 real-time full-disk infrared imagery, published by NICT/JMA
 * at himawari8-dl.nict.go.jp — confirmed as NICT's own official domain,
 * not a third-party wrapper. Free, no key, new frame every 10 minutes.
 *
 * We deliberately do NOT depend on any third-party "latest timestamp"
 * lookup service (an earlier version of this used himawari-8.appspot.com,
 * an unofficial community wrapper from ~2015 with no guarantee it's still
 * maintained). Instead we compute the expected latest 10-minute slot
 * ourselves and walk backward a few slots if needed to account for
 * publishing lag — using only the confirmed-official NICT image domain.
 */
function tileUrlForSlot(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `https://himawari8-dl.nict.go.jp/himawari8/img/INFRARED_FULL/1d/550/${yyyy}/${mm}/${dd}/${hh}${min}00_0_0.png`;
}

function roundDownTo10Min(d: Date): Date {
  const rounded = new Date(d);
  rounded.setUTCMinutes(Math.floor(rounded.getUTCMinutes() / 10) * 10, 0, 0);
  return rounded;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // First attempt used plain UTC and failed across a full hour of slots —
    // that pattern (consistent failure, not just the newest slot) suggests
    // a systematic offset rather than "not published yet". NICT is a Japan
    // based service, so try JST (UTC+9) folder timestamps as the primary
    // theory, then fall back to plain UTC, each swept over a wider 3-hour
    // window as a safety margin against an unknown publish delay.
    let imgBuffer: ArrayBuffer | null = null;
    let usedSlot: Date | null = null;
    let lastStatus = 0;
    let triedUrls: string[] = [];

    for (const baseOffset of [JST_OFFSET_MS, 0]) {
      let slot = roundDownTo10Min(new Date(Date.now() + baseOffset - 10 * 60 * 1000));
      for (let attempt = 0; attempt < 18; attempt++) {
        const tileUrl = tileUrlForSlot(slot);
        triedUrls.push(tileUrl);
        const imgRes = await fetch(tileUrl);
        lastStatus = imgRes.status;
        if (imgRes.ok) {
          imgBuffer = await imgRes.arrayBuffer();
          usedSlot = new Date(slot.getTime() - baseOffset); // convert back to true UTC for the label
          break;
        }
        slot = new Date(slot.getTime() - 10 * 60 * 1000);
      }
      if (imgBuffer) break;
    }

    if (!imgBuffer || !usedSlot) {
      throw new Error(
        `No Himawari frame found across JST/UTC sweep (last status: HTTP ${lastStatus}). ` +
        `Last URL tried: ${triedUrls[triedUrls.length - 1]}`
      );
    }

    const dateStr = usedSlot.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

    return new Response(imgBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/png",
        "X-Himawari-Timestamp": dateStr,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
