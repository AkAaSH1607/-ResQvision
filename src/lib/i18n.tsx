/**
 * Lightweight in-app language support — English + Tamil (தமிழ்).
 * Zero external dependencies, zero cost. Selection is remembered in
 * localStorage so returning visitors stay in Tamil automatically.
 *
 * Usage:
 *   const { t, lang, setLang } = useLanguage();
 *   <span>{t('dashboard.title')}</span>
 *
 * This covers user-visible UI labels. Data values, numbers, technical
 * terms (colormaps, satellite names, severity codes) stay in English
 * to keep them readable and accurate.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Language = 'en' | 'ta';

export const translations: Record<Language, Record<string, string>> = {
  en: {}, // English = source strings (fallback when key missing)
  ta: {
    // — App chrome —
    'app.footerAllSystems': 'அனைத்து அமைப்புகளும் இயங்குகின்றன',

    // — Dashboard —
    'dash.title': 'ResQvision முன்னணி',
    'dash.subtitle': 'செயலியின் இடமில்லாமல் இயங்கும் IR கோள் பட பகுப்பாய்வு அரங்கம்',
    'dash.quickActions': 'விரைவு செயல்கள்',
    'dash.liveIR': 'நேரடி IR கண்காணிப்பு',
    'dash.liveIRDesc': 'இந்தியா முழுவதும் நிகழ்நேர வெப்ப அனல் படங்களைப் பாருங்கள்',
    'dash.colorize': 'IR படத்தை நிறமாக்கவும்',
    'dash.colorizeDesc': 'பதிவேற்றிய IR படத்தை வெப்ப வண்ண அளவுகோலாக மாற்றுங்கள்',
    'dash.changeDetection': 'பேரிடர் மாற்ற கண்டறிதல்',
    'dash.changeDetectionDesc': 'தானியங்கி மாற்ற பகுப்பாய்வு மூலம் பாதிப்பு பகுதிகளை கண்ணறியுங்கள்',
    'dash.analytics': 'பகுப்பாய்வு வரலாறு',
    'dash.analyticsDesc': 'முன்பு செய்யப்பட்ட பகுப்பாய்வுகள் மற்றும் எச்சரிக்கைகளைப் பாருங்கள்',
    'dash.liveDisaster': 'நேரடி பேரிடர் நுண்ணறிவு',
    'dash.liveDisasterDesc': 'செயலிலுள்ள பேரிடர் நிகழ்வுகள் மற்றும் தரவரிசைநிலை',
    'dash.systemHealth': 'அமைப்பு நிலை',
    'dash.techInfo': 'தொழில்நுட்ப தகவல்',
    'dash.frugalNote': '₹0 செலவு — அனைத்தும் உங்கள் உலாவியிலேயே இயங்குகிறது',
    'dash.clientSideAI': 'கிளையன்ட்-பக்க AI',
    'dash.clientSideAIDesc': 'TensorFlow.js மாதிரி உங்கள் சாதனத்திலேயே இயங்குகிறது — சர்வர் இல்லை, செலவு இல்லை',
    'dash.zeroCost': 'பூஜ்ஜிய செலவு',
    'dash.zeroCostDesc': 'API கீகள், GPU அல்லது உரிம மென்பொருள் தேவை இல்லை',
    'dash.opensource': 'திறந்த மூலம்',
    'dash.opensourceDesc': 'குறியீடு முழுவதும் GitHub-இல் கிடைக்கிறது',
    'dash.howItWorks': 'இது எப்படி இயங்குகிறது?',
    'dash.howStep1Title': 'சாதனை படங்களைப் பெறுதல்',
    'dash.howStep1Desc': 'NASA GIBS-இலிருந்து MODIS இன்ஃப்ராரெட் படங்களை நிகழ்நேரத்தில் பெறுகிறோம்',
    'dash.howStep2Title': 'வெப்ப அனலாக நிறமாக்கம்',
    'dash.howStep2Desc': 'புக்கம் இல்லாத கோள் படம் வெப்பநிலை அளவுகோலாக உங்கள் உலாவியில் மாற்றப்படுகிறது',
    'dash.howStep3Title': 'கிளையன்ட்-பக்க AI பகுப்பாய்வு',
    'dash.howStep3Desc': 'TensorFlow.js வலைப்பின்னல் உங்கள் உலாவியிலேயே வானிலை, NDVI மற்றும் வெப்ப அனலை கணக்கிடுகிறது',
    'dash.howStep4Title': 'மாற்ற கண்டறிதல் & எச்சரிக்கை',
    'dash.howStep4Desc': 'அடிப்படை படத்துடன் ஒப்பிட்டு, மோசமான பகுதிகளை கண்டு எச்சரிக்கைகளை அனுப்புகிறது',

    // — Change Detection —
    'cd.waitingFirst': 'முதல் சாதனை சட்டத்தை எதிர்பார்க்கிறது',
    'cd.building': 'சாதனை அடிப்படையை உருவாக்குகிறது',
    'cd.error': 'ஸ்கேன் பிழை',
    'cd.active': 'செயலில் & கண்காணிக்கிறது',
    'cd.baselineMsg': 'முதல் பெற்றல் அடிப்படை சட்டத்தை சேமிக்கிறது. அடுத்த சாதனை கடவுதலில் ஒப்பீடு தொடங்கும்.',
    'cd.fetchingMsg': 'அடிப்படை சேமிக்கப்பட்டது. புதிய சட்டத்தைப் பெற்று ஒப்பிடுகிறது…',
    'cd.comparing': 'அடிப்படையுடன் ஒப்பிடுகிறது',
    'cd.dmgMap': 'நஷ்ட வரைபடம் — மிகுந்த & குறைந்த பாதிப்பு பகுதிகள்',
    'cd.mostAffected': 'மிகுந்த பாதிப்பு பகுதி',
    'cd.leastAffected': 'குறைந்த பாதிப்பு பகுதி',
    'cd.swathGap': 'தடவழி வெடிவு (தரவு இல்லை)',
    'cd.baseLayer': 'அடிப்படை அடரு = தற்போதைய IR சட்டம்',
    'cd.threshold': 'கண்டறிதல் வரம்பு',
    'cd.sensitive': 'உணர்வுத்திறன் (5)',
    'cd.moderate': 'மிதமான (40)',
    'cd.strict': 'கடுமையான (80)',
    'cd.mapLegend': 'வரைபட வகையறா',
    'cd.scanNow': 'இப்போது தானியங்கி ஸ்கேன் இயக்கு',
    'cd.scanning': 'ஸ்கேன் செய்கிறது…',
    'cd.autoNote': 'தானியங்கி ஸ்கேன்கள் ஒவ்வொரு 30 நிமிஷத்திலும் இயங்கும். சேமிக்கப்பட்ட அடிப்படைகள் சமீபத்திய 3 சட்டங்களாக மட்டுமே இருக்கும் (தானியங்கி சுத்தமாக்குதல்).',
    'cd.assessment': 'பேரிடர் மதிப்பீடு',
    'cd.affectedArea': 'பாதிக்கப்பட்ட பரப்பளவு',
    'cd.changedPixels': 'மாற்றிய படத்துக்கள்',
    'cd.mostAffectedRegion': 'மிகுந்த பாதிக்கப்பட்ட பகுதி',
    'cd.boundingBox': 'அழகுப்பெட்டி',
    'cd.zoneImpact': 'பகுதி தாக்கம்',
    'cd.coverageWarning': 'பார்வை எச்சரிக்கை',
    'cd.coverageWarningDesc': 'மோசமான மதிப்பெண் பகுதி சாதனை தடவழி வெடிவில் (தரவு இல்லை) அமைந்துள்ளது. அந்த பகுதி முடிவுகள் நம்பகமில்லை — அடுத்த சாதனை கடவுதலுக்குப் பிறகு மீண்டும் சரிபார்க்கவும்.',
    'cd.regionBreakdown': 'பகுதி உடைப்பு',
    'cd.unreliableNote': 'சாதனை தடவழி வெடிவுகளால் ஆளும் பகுதிகள் மதிப்பெண்ணிலிருந்து விலக்கப்பட்டு, நம்பகமில்லாதவை என குறிப்பிடப்பட்டுள்ளன.',
    'cd.generating': 'உருவாக்குகிறது…',
    'cd.genReport': 'சம்பவ அறிக்கையை உருவாக்கு',
    'cd.incidentReport': 'சம்பவ அறிக்கை',
    'cd.download': 'பதிவிறக்கம்',
    'cd.disaster': 'பேரிடர் வகை',
    'cd.location': 'இடம்',
    'cd.expansion': 'விரிவடைதல்',
    'cd.priority': 'முன்னுரிமை',
    'cd.estimateNote': 'மதிப்பீடுகள் MODIS 4km படத்துக்கு தீர்மானம் × மக்கள்தொகை அடர்த்தி (~400 நபர்கள்/கிமீ²) அடிப்படையில். அனுப்புதலுக்கு முன்னர் உள்ளூர் பேரிடர் மேலாண்மை அதிகாரிகளுடன் உறுதிப்படுத்தவும்.',
    'cd.estFirst': 'முதல் அடிப்படை சட்டத்தை உருவாக்குகிறது…',
    'cd.estWaiting': 'ஒப்பீடு முடிவுகளை எதிர்பார்க்கிறது…',
    'cd.reRun': 'மீண்டும் தானியங்கி ஸ்கேன் இயக்கு',

    // — Live Disaster —
    'ld.title': 'நேரடி பேரிடர் நுண்ணறிவு',
    'ld.threatActive': 'தரவரிசைநிலை நிலை செயலில்',
    'ld.liveAlerts': 'நேரடி எச்சரிக்கைகள்',
    'ld.noActive': 'தற்போது செயலிலுள்ள பேரிடர் நிகழ்வுகள் இல்லை. அமைப்பு கண்காணிக்கிறது.',
    'ld.refresh': 'புதுப்பி',
    'ld.dismissAll': 'அனைத்தையும் நிராகரி',
    'ld.activeAlerts': 'செயலிலுள்ள எச்சரிக்கைகள்',
    'ld.critical': 'முக்கியமான',
    'ld.totalAffected': 'மொத்த பாதிப்பு',
    'ld.scansProcessed': 'ஸ்கேன்கள்',
    'ld.eventFeed': 'நேரடி நிகழ்வு ஊட்டம்',
    'ld.sorted': 'தரவரிசைநிலை அடிப்படையில், புதியது முதலில்',
    'ld.allClear': 'அனைத்தும் தெளிவு',
    'ld.allClearDesc': 'இப்போது பேரிடர் நிகழ்வுகள் கண்டறியப்படவில்லை. அமைப்பு சாதனை ஊட்டங்களைத் தொடர்ந்து கண்காணித்து, மாற்றம் கண்டறியப்படும் நொடியில் இங்கு எச்சரிக்கைகளை காட்டும்.',
    'ld.justNow': 'இப்போதுதான்',
    'ld.reportGen': 'அறிக்கை உருவாக்கப்பட்டது',
    'ld.genReportBtn': 'சம்பவ அறிக்கையை உருவாக்கு',
    'ld.generating': 'உருவாக்குகிறது…',
    'ld.severityLegend': 'தரவரிசைநிலை வகையறா',

    // — Live Monitor —
    'lm.title': 'நேரடி IR கண்காணிப்பு',
    'lm.mapTitle': 'நேரடி IR வண்ணமயமாக்கல் படம்',
    'lm.fetching': 'பெறுகிறது…',
    'lm.fetchFailed': 'பெற முடியவில்லை',
    'lm.refreshNow': 'இப்போது புத்துப்பிக்கு',
    'lm.autoRefresh': '30 நிமிடத்துக்கு ஒருமுறை தானியங்கி புத்துப்பித்தல்',
    'lm.liveIRSource': 'நேரடி IR மூலம்',
    'lm.noOverlay': 'மேற்பொருத்தம் இல்லை',
    'lm.noOverlayDesc': 'அடிப்படை படம் மட்டும் — தெரு-மட்ட அளவுக்கு',
    'lm.overlayOpacity': 'மேற்பொருத்த ஊடுபாது',
    'lm.weatherClear': 'தெளிவான வானிலை',
    'lm.weatherPartlyCloudy': 'பகுதி மேகமூட்டம்',
    'lm.weatherCloudy': 'மேகமூட்டம்',
    'lm.weatherFog': 'மூதல்',
    'lm.weatherRain': 'மழை',
    'lm.weatherSnow': 'பனி',
    'lm.weatherThunderstorm': 'இடி மின்னலுடன் மழை',
    'lm.subtitle': 'இந்தியா முழுவதும் நிகழ்நேர இன்ஃப்ராரெட் வெப்ப அனல்',
    'lm.selectSource': 'சாதனை மூலத்தைத் தேர்வுசெய்யவும்',
    'lm.indiaFull': 'இந்தியா முழுவதும் — வெடிவுகள் இல்லை',
    'lm.northIndia': 'வட இந்தியா',
    'lm.southIndia': 'தென் இந்தியா',
    'lm.frame': 'சட்டம்',
    'lm.date': 'தேதி',
    'lm.weather': 'வானிலை',
    'lm.weatherCond': 'வானிலை நிலை',
    'lm.water': 'நீர் நிலைகள்',
    'lm.urbanHeat': 'நகர வெப்பம்',
    'lm.vegetation': 'தாவரவியல்',
    'lm.clouds': 'மேகங்கள்',
    'lm.confidence': 'நம்பகத்தன்மை',
    'lm.mlAnalysis': 'ML பகுப்பாய்வு',
    'lm.colormap': 'வண்ண அளவுகோல்',
    'lm.intensity': 'தீவிரம்',
    'lm.mapLegend': 'வரைபட வகையறா',
    'lm.hot': 'வெப்பமான நிலம்',
    'lm.cold': 'குளிரான நீர்/நிலம்',
    'lm.waterBodies': 'நீர் நிலைகள்',
    'lm.cloudCover': 'மேக மூட்டம்',
    'lm.vegetationZones': 'தாவரவியல் பகுதிகள்',
    'lm.swathGaps': 'தடவழி வெடிவுகள் (தரவு இல்லை)',
    'lm.howColored': 'இது எப்படி நிறமாக்கப்படுகிறது?',
    'lm.pipelineDesc': 'மூல சட்டம் கிரீனிங் வன் முதல் நிறமாக்கப்படுகிறது',
    'lm.cloudy': 'மேகமூட்டம்',
    'lm.rainy': 'மழை',
    'lm.sunny': 'வெயில்',
    'lm.stormy': 'புயல்',
    'lm.weatherCardTitle': 'நிலை நிலை',
    'lm.weatherCardDesc': 'வண்ணங்களைப் பார்த்து வானிலை அறியவும்',

    // — Colorize —
    'cp.title': 'IR பட நிறமாக்கம்',
    'cp.subtitle': 'பதிவேற்றிய இன்ஃப்ராரெட் படத்தை வெப்ப வண்ண அளவுகோலாக மாற்றுங்கள்',
    'cp.upload': 'IR படத்தைப் பதிவேற்றவும்',
    'cp.dragDrop': 'கோப்புகளை இங்கு இழுத்து விடுங்கள்',
    'cp.or': 'அல்லது',
    'cp.browse': 'உலாவித் தேர்ந்தெடுக்கவும்',
    'cp.supported': 'PNG, JPG (கருப்பு-வெள்ளை IR)',
    'cp.colorizeNow': 'இப்போது நிறமாக்கவும்',
    'cp.processing': 'பகுப்பாய்வு செய்கிறது…',
    'cp.colormap': 'வண்ண அளவுகோல்',
    'cp.intensity': 'தீவிரம்',
    'cp.qualityMetrics': 'தர மெட்ரிக்குகள்',
    'cp.download': 'நிறமாக்கப்பட்ட படத்தைப் பதிவிறக்கம்',
    'cp.noData': 'தரவு இல்லை — முதலில் படத்தைப் பதிவேற்றுங்கள்',
    'cp.madeBy': 'ResQvision-இனால் உருவாக்கப்பட்டது',

    // — Alerts —
    'al.title': 'எச்சரிக்கைகள்',
    'al.subtitle': 'ResQvision பேரிடர் எச்சரிக்கைகள்',
    'al.subscribe': 'எச்சரிக்கைகளுக்கு பதிவுசெய்யவும்',
    'al.email': 'மின்னஞ்சல்',
    'al.region': 'பகுதி (தேவை இல்லை)',
    'al.subscribeBtn': 'பதிவுசெய்யவும்',
    'al.subscribing': 'பதிவுசெய்கிறது…',
    'al.subscribed': 'பதிவுசெய்யப்பட்டது!',
    'al.subscribedDesc': 'மோசமான செய்திகளில் மின்னஞ்சல் மூலம் அறிவிப்புகளைப் பெறுவீர்கள்',
    'al.unsubscribe': 'பதிவுநீக்கம்',
    'al.error': 'பிழை ஏற்பட்டது — மீண்டும் முயற்சிக்கவும்',
    'al.dismiss': 'நிராகரி',
    'al.noAlerts': 'எச்சரிக்கைகள் இல்லை',
    'al.noAlertsDesc': 'பேரிடர் எச்சரிக்கைகள் கண்டறியப்படும்போது இங்கு தோன்றும்',

    // — Analytics —
    'an.title': 'பகுப்பாய்வு வரலாறு',
    'an.subtitle': 'முன்பு செய்யப்பட்ட IR பகுப்பாய்வுகள்',
    'an.totalAnalyses': 'மொத்த பகுப்பாய்வுகள்',
    'an.avgPSNR': 'சராசரி PSNR',
    'an.avgCloud': 'சராசரி மேகமூட்டம்',
    'an.highSeverity': 'உயர் தரவரிசைநிலை',
    'an.recentAnalyses': 'சமீபத்திய பகுப்பாய்வுகள்',
    'an.noHistory': 'பகுப்பாய்வு வரலாறு இல்லை',
    'an.noHistoryDesc': 'IR படங்களை நிறமாக்கி பகுப்பாய்வு செய்யும்போது முடிவுகள் இங்கு சேமிக்கப்படும்',
    'an.type': 'வகை',
    'an.date': 'தேதி',
    'an.severity': 'தரவரிசைநிலை',
    'an.affected': 'பாதிப்பு',
    'an.colormapUsed': 'பயன்படுத்திய வண்ண அளவுகோல்',
  },
};

interface LanguageContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('resqvision-lang');
    return saved === 'ta' ? 'ta' : 'en';
  });

  useEffect(() => {
    localStorage.setItem('resqvision-lang', lang);
  }, [lang]);

  const setLang = (l: Language) => setLangState(l);

  // t(key) looks up Tamil; falls back to the key itself (English source)
  const t = (key: string) => translations.ta[key] ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
