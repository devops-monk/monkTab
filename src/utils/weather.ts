import { getWeatherCache, saveWeatherCache, type WeatherCache, type WeatherForecastDay } from './storage';

const WMO_CODES: Record<number, { label: string; icon: string }> = {
  0:  { label: 'Clear sky',       icon: '☀️' },
  1:  { label: 'Mostly clear',    icon: '🌤️' },
  2:  { label: 'Partly cloudy',   icon: '⛅' },
  3:  { label: 'Overcast',        icon: '☁️' },
  45: { label: 'Foggy',           icon: '🌫️' },
  48: { label: 'Icy fog',         icon: '🌫️' },
  51: { label: 'Light drizzle',   icon: '🌦️' },
  53: { label: 'Drizzle',         icon: '🌦️' },
  55: { label: 'Heavy drizzle',   icon: '🌧️' },
  61: { label: 'Light rain',      icon: '🌧️' },
  63: { label: 'Rain',            icon: '🌧️' },
  65: { label: 'Heavy rain',      icon: '🌧️' },
  71: { label: 'Light snow',      icon: '🌨️' },
  73: { label: 'Snow',            icon: '❄️' },
  75: { label: 'Heavy snow',      icon: '❄️' },
  80: { label: 'Showers',         icon: '🌦️' },
  95: { label: 'Thunderstorm',    icon: '⛈️' },
  99: { label: 'Severe storm',    icon: '⛈️' },
};

function getCondition(code: number) {
  return WMO_CODES[code] ?? { label: 'Unknown', icon: '🌡️' };
}

async function fetchWeatherForCoords(lat: number, lon: number, city: string): Promise<WeatherCache> {
  const wxRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&wind_speed_unit=kmh&temperature_unit=celsius&timezone=auto`
  );
  const wxData = await wxRes.json() as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      precipitation: number;
      wind_speed_10m: number;
      weather_code: number;
    };
    daily?: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      weather_code: number[];
    };
  };
  const c = wxData.current;
  const { label, icon } = getCondition(c.weather_code);

  const forecast: WeatherForecastDay[] = (wxData.daily?.time ?? []).slice(0, 7).map((dateStr, i) => {
    const d = new Date(dateStr + 'T00:00:00');
    return {
      day: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      icon: getCondition(wxData.daily!.weather_code[i]).icon,
      hi: Math.round(wxData.daily!.temperature_2m_max[i]),
      lo: Math.round(wxData.daily!.temperature_2m_min[i]),
    };
  });

  return {
    temp: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    windSpeed: Math.round(c.wind_speed_10m),
    precipitation: Math.round(c.precipitation * 10) / 10,
    condition: label,
    icon,
    city,
    cachedAt: Date.now(),
    forecast,
  };
}

// Geocode a city name → { lat, lon, name } via Open-Meteo geocoding API
async function geocodeCity(name: string): Promise<{ lat: number; lon: number; city: string } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`
    );
    const data = await res.json() as { results?: Array<{ latitude: number; longitude: number; name: string; country: string }> };
    const r = data.results?.[0];
    if (!r) return null;
    return { lat: r.latitude, lon: r.longitude, city: `${r.name}, ${r.country}` };
  } catch { return null; }
}

// locationOverride: if non-empty, geocode it instead of using GPS
export async function fetchWeather(locationOverride = ''): Promise<WeatherCache | null> {
  const cached = await getWeatherCache();

  // Use cache only if location override hasn't changed
  if (cached && Date.now() - cached.cachedAt < 15 * 60 * 1000) {
    // If override is set but cached city doesn't reflect it, bust the cache
    const overrideName = locationOverride.trim().toLowerCase();
    if (!overrideName || cached.city.toLowerCase().includes(overrideName.split(',')[0].trim())) {
      return cached;
    }
  }

  try {
    // ── Path 1: manual location override ──────────────────────────────────────
    if (locationOverride.trim()) {
      const geo = await geocodeCity(locationOverride.trim());
      if (!geo) return cached ?? null;
      const w = await fetchWeatherForCoords(geo.lat, geo.lon, geo.city);
      await saveWeatherCache(w);
      return w;
    }

    // ── Path 2: device GPS, then IP-based fallback ────────────────────────────
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude: lat, longitude: lon } = pos.coords;
            const geoRes = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
              { headers: { 'Accept-Language': 'en' } }
            );
            const geoData = await geoRes.json() as {
              address?: { city?: string; town?: string; village?: string; county?: string };
            };
            const a = geoData.address ?? {};
            const city = a.city ?? a.town ?? a.village ?? a.county ?? 'Your location';
            const w = await fetchWeatherForCoords(lat, lon, city);
            await saveWeatherCache(w);
            resolve(w);
          } catch { resolve(cached ?? null); }
        },
        // GPS denied or timed out — fall back to IP geolocation
        async () => {
          try {
            const r = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(6000) });
            const d = await r.json() as { latitude?: number; longitude?: number; city?: string; country_name?: string };
            if (d.latitude && d.longitude) {
              const city = [d.city, d.country_name].filter(Boolean).join(', ') || 'Your location';
              const w = await fetchWeatherForCoords(d.latitude, d.longitude, city);
              await saveWeatherCache(w);
              resolve(w);
              return;
            }
          } catch { /* IP lookup failed */ }
          resolve(cached ?? null);
        },
        { timeout: 6000 },
      );
    });
  } catch { return cached ?? null; }
}
