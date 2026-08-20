import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Expose-Headers": "X-IMD-Fetched-At",
};

/**
 * India Meteorological Department's public INSAT-3D/3DR infrared quicklook —
 * the real IMD satellite, not a stand-in. This is a static URL (always
 * "whatever the current image is"), publicly embedded on IMD's own site with
 * no login required. IMD states INSAT-3D/3DR imagery refreshes roughly every
 * 15-60 minutes. No timestamp math needed here (unlike the Himawari attempt) —
 * just fetch this URL fresh each time.
 *
 * UNVERIFIED: the exact geographic bounds of this "Asia sector" crop. Using
 * a reasonable estimate for now (roughly matching INSAT's typical published
 * Asia-sector extent) — surfaced clearly in the UI as needing visual
 * confirmation, same honesty standard as everything else in this app.
 */
const IMD_IMAGE_URL = "https://mausam.imd.gov.in/Satellite/3Dasiasec_ir1.jpg";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const imgRes = await fetch(IMD_IMAGE_URL, {
      headers: {
        // Some government sites reject requests with no browser-like UA
        "User-Agent": "Mozilla/5.0 (compatible; ResQvision/1.0)",
      },
    });
    if (!imgRes.ok) {
      throw new Error(`IMD image fetch failed: HTTP ${imgRes.status}`);
    }
    const contentType = imgRes.headers.get("Content-Type") ?? "";
    if (!contentType.includes("image")) {
      throw new Error(`IMD did not return an image (Content-Type: ${contentType})`);
    }
    const imgBuffer = await imgRes.arrayBuffer();

    return new Response(imgBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/jpeg",
        "X-IMD-Fetched-At": new Date().toISOString(),
        "Cache-Control": "no-store",
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
