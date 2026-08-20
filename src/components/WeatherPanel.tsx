import { useEffect, useState } from 'react';
import { Sun, Cloud, CloudRain, CloudLightning, CloudFog, CloudSnow, CloudSun } from 'lucide-react';

interface CityWeather {
  name: string;
  lat: number;
  lon: number;
  tempC: number | null;
  code: number | null;
  loading: boolean;
}

const CITIES: { name: string; lat: number; lon: number }[] = [
  { name: 'New Delhi', lat: 28.6139, lon: 77.209 },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { name: 'Hyderabad', lat: 17.385, lon: 78.4867 },
];

/** WMO weather codes -> icon + label. https://open-meteo.com/en/docs (weathercode) */
function weatherIconAndLabel(code: number | null): { Icon: typeof Sun; label: string } {
  if (code === null) return { Icon: Cloud, label: '—' };
  if (code === 0) return { Icon: Sun, label: 'Clear' };
  if (code === 1 || code === 2) return { Icon: CloudSun, label: 'Partly Cloudy' };
  if (code === 3) return { Icon: Cloud, label: 'Cloudy' };
  if (code === 45 || code === 48) return { Icon: CloudFog, label: 'Fog' };
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return { Icon: CloudRain, label: 'Rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { Icon: CloudSnow, label: 'Snow' };
  if ([95, 96, 99].includes(code)) return { Icon: CloudLightning, label: 'Thunderstorm' };
  return { Icon: Cloud, label: '—' };
}

export default function WeatherPanel() {
  const [cities, setCities] = useState<CityWeather[]>(
    CITIES.map(c => ({ ...c, tempC: null, code: null, loading: true }))
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      const results = await Promise.allSettled(
        CITIES.map(async city => {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current_weather=true`
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          return {
            ...city,
            tempC: data.current_weather?.temperature ?? null,
            code: data.current_weather?.weathercode ?? null,
            loading: false,
          };
        })
      );

      if (cancelled) return;

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      if (succeeded === 0) {
        setError('Live weather is temporarily unavailable — try refreshing shortly.');
      }

      setCities(
        results.map((r, i) =>
          r.status === 'fulfilled' ? r.value : { ...CITIES[i], tempC: null, code: null, loading: false }
        )
      );
    }

    loadWeather();
    const interval = setInterval(loadWeather, 15 * 60 * 1000); // refresh every 15 min
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="bg-satellite-card border border-satellite-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
          <Sun size={13} className="text-accent-orange" />
          Current Weather — India
        </div>
        <span className="text-[9px] text-slate-500 font-mono">Live · updates every 15 min</span>
      </div>

      {error && <div className="text-[11px] text-red-400 mb-2">{error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {cities.map(city => {
          const { Icon, label } = weatherIconAndLabel(city.code);
          return (
            <div
              key={city.name}
              className="flex items-center gap-2 bg-satellite-bg/50 border border-satellite-border/60 rounded-lg px-2.5 py-2"
            >
              <Icon size={18} className="text-accent-blue flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-medium text-slate-200 truncate">{city.name}</div>
                <div className="text-[9px] text-slate-500 truncate">
                  {city.loading ? 'Loading…' : city.tempC !== null ? `${Math.round(city.tempC)}°C · ${label}` : '—'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
