/**
 * ResQvision UI strings — English only.
 * Zero external dependencies, zero cost.
 *
 * Usage:
 *   const { t } = useLanguage();
 *   <span>{t('dashboard.title')}</span>
 *
 * t(key, params) returns the English value, never the raw key.
 * {placeholder} values in templates are replaced from params.
 * Data values, numbers and technical terms stay as-is.
 */
import { createContext, useContext, type ReactNode } from 'react';

export type Language = 'en';

// English is the full source dictionary (fallback when Tamil missing)
const en: Record<string, string> = {
  'app.footerAllSystems': 'All systems operational',

  // — Navigation (kept English, as in the original app) —
  'nav.dashboard': 'Dashboard',
  'nav.live': 'Live Monitor',
  'nav.colorize': 'IR Colorize',
  'nav.change': 'Change Detection',
  'nav.disaster': 'Live Disaster',
  'nav.analytics': 'Analytics',

  // — Dashboard —
  'dash.title': 'ResQvision Dashboard',
  'dash.subtitle': 'Zero-cost, client-side IR satellite image analysis',
  'dash.quickActions': 'Quick Actions',
  'dash.liveIR': 'Live IR Monitor',
  'dash.liveIRDesc': 'View real-time false-color thermal views of India',
  'dash.colorize': 'Colorize IR Image',
  'dash.colorizeDesc': 'Convert your uploaded IR image into a thermal color map',
  'dash.changeDetection': 'Disaster Change Detection',
  'dash.changeDetectionDesc': 'Automatic change analysis to identify affected regions',
  'dash.analytics': 'Analytics History',
  'dash.analyticsDesc': 'View past analyses and alerts',
  'dash.liveDisaster': 'Live Disaster Intelligence',
  'dash.liveDisasterDesc': 'Active disaster events and severity tracking',
  'dash.systemHealth': 'System Health',
  'dash.techInfo': 'Tech Info',
  'dash.frugalNote': '₹0 cost — everything runs in your browser',
  'dash.clientSideAI': 'Client-side AI',
  'dash.clientSideAIDesc': 'TensorFlow.js models run on your device — no server, no cost',
  'dash.zeroCost': 'Zero Cost',
  'dash.zeroCostDesc': 'No API keys, GPU or licensed software needed',
  'dash.opensource': 'Open Source',
  'dash.opensourceDesc': 'All code available on GitHub',
  'dash.howItWorks': 'How it works?',
  'dash.howStep1Title': 'Fetch live satellite imagery',
  'dash.howStep1Desc': 'We fetch MODIS infrared imagery from NASA GIBS in real time',
  'dash.howStep2Title': 'Colorize as thermal scale',
  'dash.howStep2Desc': 'The raw satellite frame is mapped to a temperature color scale in your browser',
  'dash.howStep3Title': 'Client-side AI analysis',
  'dash.howStep3Desc': 'A TensorFlow.js network computes weather, NDVI and heat anomalies on your device',
  'dash.howStep4Title': 'Change detection & alerts',
  'dash.howStep4Desc': 'Compared against the baseline, worst regions are flagged and alerts are fired',

  // — Change Detection —
  'cd.title': 'Automatic Disaster Detection',
  'cd.waitingFirst': 'Waiting for first satellite frame',
  'cd.building': 'Building satellite baseline',
  'cd.error': 'Scan error',
  'cd.active': 'Active & Monitoring',
  'cd.baselineMsg': 'The first fetch stores the baseline frame. Frame-to-frame comparison starts on the next satellite pass.',
  'cd.fetchingMsg': 'Baseline stored. Fetching and comparing the fresh frame now…',
  'cd.comparing': 'Comparing',
  'cd.msgChangeDetected': '{sev} change detected: {pct}% of area affected{zoneMsg}',
  'cd.msgZone': ' — worst affected zone: {name}, {pct}% changed',
  'cd.msgAutoBaseline': 'AUTO: change vs baseline {date}: {pct}% of area affected',
  'cd.msgHighCloud': 'High cloud coverage detected: {pct}%',
  'cd.msgHeatIsland': 'Urban heat island detected: {pct}%',
  'cd.msgStorm': 'Storm conditions identified in satellite imagery',
  'cd.msgVegetationLoss': 'Low vegetation coverage — possible drought or desertification',
  'cd.msgAutoChange': 'AUTO: {sev} change: {pct}%',
  'cd.msgBaselineVs': 'baseline {base} vs {cur}',
  'ld.statusActive': '{sev} — {count} live alert{plural} active',
  'lm.cloudCoverageLabel': 'Cloud:',
  'cd.dmgMap': 'Damage Map — most & least affected regions',
  'cd.mostAffected': 'Most affected zone',
  'cd.leastAffected': 'Least affected zone',
  'cd.swathGap': 'Swath gap (no data)',
  'cd.baseLayer': 'Base layer = current IR frame',
  'cd.threshold': 'Detection Threshold',
  'cd.sensitive': 'Sensitive (5)',
  'cd.moderate': 'Moderate (40)',
  'cd.strict': 'Strict (80)',
  'cd.mapLegend': 'Map Legend',
  'cd.scanNow': 'Re-run Automatic Scan Now',
  'cd.scanning': 'Scanning…',
  'cd.autoNote': 'Auto-scans run every 30 minutes. Stored baselines are limited to the 3 most recent frames (auto-cleanup).',
  'cd.assessment': 'Disaster Assessment',
  'cd.affectedArea': 'Affected Area',
  'cd.changedPixels': 'Changed Pixels',
  'cd.mostAffectedRegion': 'Most Affected Region',
  'cd.boundingBox': 'Bounding box',
  'cd.zoneImpact': 'Zone impact',
  'cd.coverageWarning': 'Coverage Warning',
  'cd.coverageWarningDesc': 'The worst-scoring zone falls inside a satellite swath gap (no data). Results are unreliable for that area — re-check after the next satellite pass.',
  'cd.regionBreakdown': 'Region Breakdown',
  'cd.unreliableNote': 'Zones dominated by satellite swath gaps are excluded from scoring and flagged as unreliable.',
  'cd.generating': 'Generating…',
  'cd.genReport': 'Generate Incident Report',
  'cd.incidentReport': 'Incident Report',
  'cd.download': 'Download',
  'cd.disaster': 'Disaster',
  'cd.location': 'Location',
  'cd.expansion': 'Expansion',
  'cd.priority': 'Priority',
  'cd.estimateNote': 'Estimates use MODIS 4km pixel resolution × census-scale density (~400 people/km²). Verify with local disaster management authorities before dispatch.',
  'cd.estFirst': 'Establishing the first baseline frame…',
  'cd.estWaiting': 'Waiting for comparison results…',
  'cd.reRun': 'Re-run Automatic Scan Now',

  // — Live Disaster —
  'ld.title': 'Live Disaster Intelligence',
  'ld.noActive': 'No active disaster events. System is monitoring.',
  'ld.refresh': 'Refresh',
  'ld.dismissAll': 'Dismiss all',
  'ld.activeAlerts': 'Active Alerts',
  'ld.critical': 'Critical',
  'ld.totalAffected': 'Total Affected',
  'ld.scansProcessed': 'Scans Processed',
  'ld.eventFeed': 'Live Event Feed',
  'ld.sorted': 'Sorted by severity, newest first',
  'ld.allClear': 'All Clear',
  'ld.allClearDesc': 'No disaster events detected right now. The system continuously monitors satellite feeds and will surface alerts here the moment a change is detected.',
  'ld.justNow': 'just now',
  'ld.reportGen': 'Report Generated',
  'ld.genReportBtn': 'Generate Incident Report',
  'ld.generating': 'Generating…',
  'ld.severityLegend': 'Severity Legend',

  // — Live Monitor —
  'lm.title': 'Live IR Monitoring',
  'lm.mapTitle': 'Live IR Colorization Map',
  'lm.fetching': 'Fetching…',
  'lm.fetchFailed': 'Fetch failed',
  'lm.refreshNow': 'Refresh Now',
  'lm.autoRefresh': 'Auto-refresh every 30 min',
  'lm.liveIRSource': 'Live IR Source',
  'lm.noOverlay': 'No Overlay',
  'lm.noOverlayDesc': 'Base map only — for street-level zoom',
  'lm.overlayOpacity': 'Overlay Opacity',
  'lm.weatherClear': 'Clear',
  'lm.weatherPartlyCloudy': 'Partly Cloudy',
  'lm.weatherCloudy': 'Cloudy',
  'lm.weatherFog': 'Fog',
  'lm.weatherRain': 'Rain',
  'lm.weatherSnow': 'Snow',
  'lm.weatherThunderstorm': 'Thunderstorm',
  'lm.subtitle': 'Real-time infrared thermal views across India',
  'lm.selectSource': 'Select a live feed source',
  'lm.indiaFull': 'Full India — no gaps',
  'lm.northIndia': 'North India',
  'lm.southIndia': 'South India',
  'lm.frame': 'Frame',
  'lm.date': 'Date',
  'lm.weather': 'Weather',
  'lm.weatherCond': 'Weather Condition',
  'lm.water': 'Water bodies',
  'lm.urbanHeat': 'Urban heat',
  'lm.vegetation': 'Vegetation',
  'lm.clouds': 'Clouds',
  'lm.confidence': 'Confidence',
  'lm.mlAnalysis': 'ML Analysis',
  'lm.colormap': 'Color Map',
  'lm.intensity': 'Intensity',
  'lm.mapLegend': 'Map Legend',
  'lm.hot': 'Hot land',
  'lm.cold': 'Cold water/land',
  'lm.waterBodies': 'Water bodies',
  'lm.cloudCover': 'Cloud cover',
  'lm.vegetationZones': 'Vegetation zones',
  'lm.swathGaps': 'Swath gaps (no data)',
  'lm.howColored': 'How is it colored?',
  'lm.pipelineDesc': 'The raw frame is colorized from greenish gray to a thermal scale',
  'lm.cloudy': 'Cloudy',
  'lm.rainy': 'Rainy',
  'lm.sunny': 'Sunny',
  'lm.stormy': 'Stormy',
  'lm.weatherCardTitle': 'Weather Status',
  'lm.weatherCardDesc': 'Read the colors to understand the weather',

  // — Colorize —
  'cp.title': 'IR Image Colorization',
  'cp.subtitle': 'Convert your uploaded infrared image into a thermal color map',
  'cp.upload': 'Upload IR Image',
  'cp.dragDrop': 'Drag and drop files here',
  'cp.or': 'or',
  'cp.browse': 'Browse to select',
  'cp.supported': 'PNG, JPG (black & white IR)',
  'cp.colorizeNow': 'Colorize Now',
  'cp.processing': 'Processing…',
  'cp.colormap': 'Color Map',
  'cp.intensity': 'Intensity',
  'cp.qualityMetrics': 'Quality Metrics',
  'cp.metricsEmpty': 'Upload an image to compute quality metrics',
  'cp.psnr': 'PSNR',
  'cp.psnrDesc': 'Peak Signal-to-Noise Ratio — higher is better',
  'cp.ssim': 'SSIM',
  'cp.ssimDesc': 'Structural Similarity Index — max 1.0',
  'cp.fid': 'FID Score',
  'cp.fidDesc': 'Fréchet Inception Distance — lower is better',
  'cp.cloudCover': 'Cloud Cover',
  'cp.cloudCoverDesc': 'Estimated cloud coverage percentage',
  'cp.download': 'Download Colorized Image',
  'cp.noData': 'No data — upload an image first',
  'cp.madeBy': 'Made by ResQvision',

  // — Alerts —
  'al.title': 'Alerts',
  'al.subtitle': 'ResQvision disaster alerts',
  'al.subscribe': 'Subscribe to alerts',
  'al.email': 'Email',
  'al.region': 'Region (optional)',
  'al.subscribeBtn': 'Subscribe',
  'al.subscribing': 'Subscribing…',
  'al.subscribed': 'Subscribed!',
  'al.subscribedDesc': 'You will receive notifications by email for the worst events',
  'al.unsubscribe': 'Unsubscribe',
  'al.error': 'An error occurred — please try again',
  'al.dismiss': 'Dismiss',
  'al.noAlerts': 'No alerts',
  'al.noAlertsDesc': 'Disaster alerts will appear here when detected',
  'al.emailInvalid': 'Please enter a valid email address (e.g. you@example.com).',
  'al.subscribeError': "Couldn't complete the subscription: {err}. If the problem persists, the",
  'al.emailNotifyDesc': 'Sign up to receive a real email the moment a high-severity change is detected — alerts now include the most affected region (zone, coordinates, and change intensity). Unsubscribe anytime via the link in any alert email.',
  'al.emailPlaceholder': 'you@example.com',
  'al.regionPlaceholder': 'Region (optional, e.g. Tamil Nadu)',

  // — Analytics —
  'an.title': 'Analytics History',
  'an.subtitle': 'Past IR analyses',
  'an.totalAnalyses': 'Total Analyses',
  'an.psnr': 'PSNR',
  'an.ssim': 'SSIM',
  'an.avgPSNR': 'Avg PSNR',
  'an.avgCloud': 'Avg Cloud Cover',
  'an.highSeverity': 'High Severity',
  'an.recentAnalyses': 'Recent Analyses',
  'an.noHistory': 'No analysis history',
  'an.noHistoryDesc': 'Results are stored here as you colorize and analyze IR images',
  'an.type': 'Type',
  'an.date': 'Date',
  'an.severity': 'Severity',
  'an.affected': 'Affected',
  'an.colormapUsed': 'Color Map Used',

  // — Live Monitor extras (side panel & legend) —
  'lm.resqvisionColorization': 'ResQvision Colorization',
  'lm.mapMarkers': 'Map Markers',
  'lm.cityMarkers': 'City Markers',
  'lm.cityMarkersDesc': '15 cities across India',
  'lm.landmarks': 'Landmarks & Geography',
  'lm.alertMarkers': 'Alert Markers',
  'lm.active': 'active',
  'lm.autoDisasterScan': 'Automatic Disaster Scan',
  'lm.buildingBaseline': 'Building satellite baseline — every fetched frame is stored automatically. The first frame-to-frame comparison will run on the next satellite pass.',
  'lm.baseline': 'Baseline',
  'lm.current': 'Current',
  'lm.mostAffectedZone': 'Most affected zone',
  'lm.leastAffectedZone': 'Least affected zone',
  'lm.overallChange': 'Overall change',
  'lm.allClearScan': 'No significant change detected vs baseline — all clear.',
  'lm.regionNote': 'Region analysis excludes satellite swath gaps (no-data areas). Zones dominated by gaps are flagged as unreliable instead of scored.',
  'lm.autoScanPending': 'Auto-scan pending first frame fetch…',
  'lm.alertSubscription': 'Alert Subscription',
  'lm.irOverlayLegend': 'IR Overlay Colour Legend',
  'lm.rawFrameLegend': 'Raw frame colourised with {colormap} by ResQvision own pipeline:',
  'lm.veryCold': 'Very cold',
  'lm.cold2': 'Cold',
  'lm.cool2': 'Cool',
  'lm.warm2': 'Warm',
  'lm.hot2': 'Hot',
  'lm.veryHot': 'Very hot',
  'lm.hottest': 'Hottest',
  'lm.legendThickClouds': 'thick clouds, storm tops',
  'lm.legendHighCloud': 'high cloud cover',
  'lm.legendCirrus': 'cirrus, high terrain',
  'lm.legendLand': 'land, low clouds',
  'lm.legendBareSoil': 'bare soil, urban areas',
  'lm.legendHeatIslands': 'heat islands, fires',
  'lm.legendSnow': 'high clouds, snow',
  'lm.legendMidClouds': 'mid-level clouds',
  'lm.legendOcean': 'vegetation, ocean',
  'lm.legendUrbanHeat': 'urban heat, fires',
  'lm.legendStormTops': 'storm tops, thick clouds',
  'lm.legendHighClouds': 'high clouds',
  'lm.legendMidWater': 'mid clouds, water',
  'lm.legendVegetation': 'land, vegetation',
  'lm.legendUrban': 'urban areas',
  'lm.legendFalseColor': 'Note: false-color source frames — vegetation red, water dark blue, cloud white — before ResQvision remaps to thermal scale.',
  'lm.markerLegend': 'Marker Legend',
  'lm.nationalCapital': 'National Capital',
  'lm.majorMetro': 'Major Metro City',
  'lm.city': 'City',
  'lm.disasterAlert': 'Disaster Alert',
  'lm.geographicFeature': 'Geographic Feature',
  'lm.infoOverlay': 'The colored overlay is a live IR frame run through ResQvision own colormap engine — the same pipeline used on the Colorize page — not NASA pre-rendered image.',
  'lm.infoSwathGap': 'You may see a thin diagonal gap in the overlay — that is a real satellite orbit swath gap (no data captured there that day), shown as transparent rather than colorized, so it is not mistaken for a real feature.',
  'lm.infoModis': 'MODIS/VIIRS are polar-orbiting satellites with roughly one pass over India per day. Auto-refresh checks every 30 min for a new pass; it will not produce a different image more than about once daily until direct INSAT (geostationary) ingestion is connected.',
  'lm.infoStreetMap': 'Switch base map to Street Map (OSM) via the layers control (top-right) for road names at high zoom.',
  'lm.sessionHistory': 'Session History',
  'lm.noHistoryYet': 'No history yet',
  'lm.cloud': 'Cloud',
  'lm.hide': '← Hide',
  'lm.controls': '→ Controls',
  'lm.pipelineRealNote': '— the pipeline itself is real; MODIS/VIIRS passes over India roughly once a day, so a retry or waiting for the next daily pass usually resolves it.',
  'lm.justNow': 'just now',
  'lm.minAgo': '{n} min ago',
  'lm.hrAgo': '{n} hr ago',
  'lm.never': 'never',
  'lm.weatherLabel': 'Weather —',

  // — Colormap selector —
  'cm.colormap': 'Color Map',
  'cm.intensity': 'Intensity',
  'cm.jet': 'Blue→Cyan→Yellow→Red. Classic thermal mapping.',
  'cm.turbo': 'Improved rainbow. Better perceptual uniformity.',
  'cm.inferno': 'Black→Purple→Yellow. High contrast dark scenes.',
  'cm.plasma': 'Purple→Pink→Yellow. Smooth scientific visualization.',

  // — Colorize page extras —
  'cp.dataInput': 'Data Input',
  'cp.uploadSample': 'Upload a sample IR image',
  'cp.sampleImages': 'Sample IR Images',
  'cp.processingStatus': 'Processing…',
  'cp.colorizedOutput': 'Colorized Output',
  'cp.awaitingInput': 'Awaiting input — upload an IR image to start',
  'cp.aiModelActive': 'AI Model Active',
  'cp.reProcess': 'Re-process',
  'cp.export': 'Export',
  'cp.noDataYet': 'No data — upload an image first',
  'cp.sceneAnalysis': 'Scene Analysis',
  'sa.sceneEmpty': 'Upload an image to analyze scene content',
  'sa.cloudDetected': 'cloud cover detected',
  'sa.ndviIndex': 'NDVI Index',
  'sa.denseVegetation': 'Dense Vegetation',
  'sa.moderateVegetation': 'Moderate Vegetation',
  'sa.sparseVegetation': 'Sparse Vegetation',
  'sa.bareSoil': 'Bare Soil',
  'sa.waterNoVegetation': 'Water / No Vegetation',
  'sa.waterBodies': 'Water Bodies',
  'sa.waterDesc': 'Rivers, lakes, coastal areas identified',
  'sa.urbanHeat': 'Urban Heat Islands',
  'sa.urbanHeatDesc': 'Hotspot regions detected',
  'sa.vegetationCover': 'Vegetation Cover',
  'sa.vegetationDesc': 'Forest, crops, grasslands',
  'sa.legend': 'Scene Legend',
  'sa.water': 'Water',
  'sa.vegetation': 'Vegetation',
  'sa.urbanHot': 'Urban/Hot',
  'sa.cloud': 'Cloud',
  'cp.quality': 'Quality',
  'cp.temporalComparison': 'Temporal Comparison',
  'cp.selectDate': 'Select a date',
  'cp.tcArchiveLoaded': 'Archive image loaded — click to replace',
  'cp.tcUploadOwn': 'Or upload your own archive image',
  'cp.tcPickEarlier': 'Pick a date earlier than today to load the archive image.',
  'cp.tcLoading': 'Loading archive image for',
  'cp.tcHistorical': 'Historical',
  'cp.tcToday': 'Today',
  'cp.tcArchive': 'Archive',
  'cp.tcCurrentToday': 'Current — Today',
  'cp.tcUploadFirst': 'Upload first',
  'cp.tcLeft': 'LEFT',
  'cp.tcRight': 'RIGHT',
  'cp.tcArchiveImg': 'archive image',
  'cp.tcCurrentOutput': 'Current colorized output',
  'cp.tcSameColormap': 'Both run through the same colormap for fair comparison',
  'cp.compare': 'Compare',

  // — Dashboard extras —
  'dash.featureCards': 'Feature Cards',
  'dash.workflow': 'Workflow',
  'dash.footerNote': 'ResQvision — IR Analysis Platform',

  // — Alerts extras —
  'al.activeAlerts': 'Active Alerts',
  'al.dismissAll': 'Dismiss all',
  'al.mostAffectedRegion': 'Most Affected Region',
  'al.zone': 'Zone',
  'al.zoneChange': 'Zone Change',
  'al.changeIntensity': 'Change Intensity',
  'al.emailNotify': 'Get notified by email when the worst events occur',
  'al.subscribedMsg': 'You are subscribed to ResQvision alerts',
  'al.dismissing': 'Dismissing…',

  // — Analytics extras —
  'an.filter': 'Filter',
  'an.allTypes': 'All Types',
  'an.table': 'Analysis Table',
  'an.satellite': 'Satellite',
  'an.actions': 'Actions',
  'an.view': 'View',

  // — Generic report fields (incident report) —
  'cd.population': 'Population',
  'cd.populationExposed': 'exposed',
  'cd.infrastructure': 'Infrastructure risk',
  'cd.severityLevel': 'Severity',
  'cd.areaKm2': 'Affected area',
};

// Site is English-only — no language switching.

interface LanguageContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key: string) => key,
});

/**
 * Formats data-generated alert messages persisted in Supabase using the UI string dictionary.
 * Keeps numbers/coordinates in English.
 */
export function formatAlertMessage(message: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (!message) return message;

  // Newest format: "{sev} change detected: {pct}% of area affected — worst affected zone: {name}, {pct}% changed"
  const m1 = message.match(/^(High|Critical|Medium|Low) change detected: ([\d.]+)% of area affected(?: — worst affected zone: (.+?), ([\d.]+)% changed)?$/);
  if (m1) {
    const sev = m1[1]; const pct = m1[2];
    const zoneMsg = m1[3] ? t('cd.msgZone', { name: m1[3], pct: m1[4] }) : '';
    return t('cd.msgChangeDetected', { sev, pct, zoneMsg });
  }

  // Auto baseline compare: "AUTO: change vs baseline {date}: {pct}% of area affected"
  const m2 = message.match(/^AUTO: change vs baseline (.+?): ([\d.]+)% of area affected$/);
  if (m2) return t('cd.msgAutoBaseline', { date: m2[1], pct: m2[2] });

  // Auto change: "AUTO: {sev} change: {pct}%"
  const m3 = message.match(/^AUTO: (High|Critical|Medium|Low) change: ([\d.]+)%$/);
  if (m3) return t('cd.msgAutoChange', { sev: m3[1], pct: m3[2] });

  // Colorize-page alerts
  const cHigh = message.match(/^High cloud coverage detected: ([\d.]+)%$/);
  if (cHigh) return t('cd.msgHighCloud', { pct: cHigh[1] });
  const cHeat = message.match(/^Urban heat island detected: ([\d.]+)%$/);
  if (cHeat) return t('cd.msgHeatIsland', { pct: cHeat[1] });
  if (message === 'Storm conditions identified in satellite imagery') return t('cd.msgStorm');
  if (message === 'Low vegetation coverage — possible drought or desertification') return t('cd.msgVegetationLoss');

  // Older format with full bbox/intensity (still stored for earlier alerts)
  const mOld = message.match(/^(.+?) change detected: ([\d.]+)% of area affected(?: — worst affected zone: (.+?) \(\d+,\d+\)→\(\d+,\d+\), ([\d.]+)% of zone pixels changed \(intensity [\d.]+\/255\))?$/);
  if (mOld) {
    const zoneMsg = mOld[3] ? t('cd.msgZone', { name: mOld[3], pct: mOld[4] }) : '';
    return t('cd.msgChangeDetected', { sev: mOld[1], pct: mOld[2], zoneMsg });
  }
  const mOld2 = message.match(/^AUTO: ([\d-]+) change vs baseline ([^:]+): ([\d.]+)% of area affected/);
  if (mOld2) return t('cd.msgAutoBaseline', { date: mOld2[2], pct: mOld2[3] });

  return message;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // English-only — no switching, no persistence needed.
  const t = (key: string, params?: Record<string, string | number>) => {
    let out = en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v));
    }
    return out;
  };

  return (
    <LanguageContext.Provider value={{ lang: 'en', setLang: () => {}, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
