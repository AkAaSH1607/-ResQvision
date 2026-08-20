import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Expose-Headers": "X-Satellite-Date, X-Satellite-Layer, X-Satellite-Source, X-Days-Back",
};

// NASA GIBS WMS base URL
const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

// Available IR/thermal layers with their descriptions
const LAYERS: Record<string, { name: string; description: string; updateFreq: string }> = {
  "MODIS_Terra_Land_Surface_Temp_Day": {
    name: "MODIS Terra LST (Day)",
    description: "Land Surface Temperature from MODIS Terra — thermal IR channel",
    updateFreq: "Daily (~10:30 AM local)"
  },
  "MODIS_Aqua_Land_Surface_Temp_Day": {
    name: "MODIS Aqua LST (Day)",
    description: "Land Surface Temperature from MODIS Aqua",
    updateFreq: "Daily (~1:30 PM local)"
  },
  "MODIS_Terra_Thermal_Anomalies_All": {
    name: "MODIS Terra Fire & Thermal Anomalies",
    description: "Active fire and thermal hotspot detection",
    updateFreq: "Daily"
  },
  "VIIRS_SNPP_BrightnessTemp_BandI5_Day": {
    name: "VIIRS SNPP Brightness Temp (IR)",
    description: "High-resolution VIIRS infrared brightness temperature",
    updateFreq: "Daily"
  },
  "MODIS_Terra_CorrectedReflectance_Bands721": {
    name: "MODIS Terra False Color (7-2-1)",
    description: "False color composite — vegetation, soil, water visible",
    updateFreq: "Daily"
  },
  "MODIS_Terra_CorrectedReflectance_Bands367": {
    name: "MODIS Terra Flood & Water Detection (3-6-7)",
    description: "NASA's documented band combo for distinguishing liquid water/flooding from land and vegetation",
    updateFreq: "Daily"
  },
};

function buildGIBSUrl(layer: string, date: string, bbox: string, width = 1024, height = 1024): string {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    FORMAT: "image/jpeg",
    TRANSPARENT: "false",
    LAYERS: layer,
    CRS: "EPSG:4326",
    STYLES: "",
    WIDTH: String(width),
    HEIGHT: String(height),
    BBOX: bbox,
    TIME: date,
  });
  return `${GIBS_WMS}?${params.toString()}`;
}

// Compute today's date in IST (UTC+5:30). Using raw UTC would shift the
// "freshest frame" one day older for Indian users after 18:30 UTC, which is
// exactly the window in which ResQvision runs live (IST afternoon/evening).
function getRecentDate(daysBack = 1): string {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const d = new Date(now.getTime() + istOffsetMs);
  d.setDate(d.getUTCDate() - daysBack);
  return d.toISOString().split("T")[0];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "fetch";

    // Return available layers list
    if (action === "layers") {
      return new Response(JSON.stringify({ layers: LAYERS }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch satellite image
    const layer = url.searchParams.get("layer") ?? "MODIS_Terra_Land_Surface_Temp_Day";
    const bbox = url.searchParams.get("bbox") ?? "8,68,37,98"; // India default
    const width = parseInt(url.searchParams.get("width") ?? "1024");
    const height = parseInt(url.searchParams.get("height") ?? "1024");
    // Try yesterday first (freshest possible frame GIBS ever has for MODIS
    // land products — same-day imagery isn't available for these layers);
    // auto-falls back to -2, -3 below if unavailable
    let daysBack = parseInt(url.searchParams.get("days_back") ?? "1");
    const date = url.searchParams.get("date") ?? getRecentDate(daysBack);

    const gibsUrl = buildGIBSUrl(layer, date, bbox, width, height);

    const response = await fetch(gibsUrl, {
      headers: {
        "User-Agent": "ResQvision-IR-Platform/1.0",
      },
    });

    if (!response.ok) {
      // If this date has no data yet, walk backward up to 3 more days
      if (response.status === 400 || response.status === 404) {
        for (let extra = 1; extra <= 3; extra++) {
          const fallbackDaysBack = daysBack + extra;
          const fallbackDate = getRecentDate(fallbackDaysBack);
          const fallbackUrl = buildGIBSUrl(layer, fallbackDate, bbox, width, height);
          const fallbackRes = await fetch(fallbackUrl);
          if (fallbackRes.ok) {
            const imageBuffer = await fallbackRes.arrayBuffer();
            return new Response(imageBuffer, {
              headers: {
                ...corsHeaders,
                "Content-Type": "image/jpeg",
                "X-Satellite-Date": fallbackDate,
                "X-Satellite-Layer": layer,
                "X-Satellite-Source": "NASA GIBS",
                "X-Days-Back": String(fallbackDaysBack),
                "Cache-Control": "public, max-age=3600",
              },
            });
          }
        }
      }
      throw new Error(`GIBS request failed: ${response.status} for date ${date} (and fallbacks up to 3 days earlier)`);
    }

    const imageBuffer = await response.arrayBuffer();

    return new Response(imageBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/jpeg",
        "X-Satellite-Date": date,
        "X-Satellite-Layer": layer,
        "X-Satellite-Source": "NASA GIBS",
        "X-Days-Back": String(daysBack),
        "Cache-Control": "public, max-age=3600",
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
