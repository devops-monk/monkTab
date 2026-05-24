import { getWeatherCache, saveWeatherCache, type WeatherCache } from './storage';

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

export async function fetchWeather(): Promise<WeatherCache | null> {
  const cached = await getWeatherCache();
  if (cached && Date.now() - cached.cachedAt < 30 * 60 * 1000) return cached;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;

          // Reverse geocode city name via Nominatim
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const geoData = await geoRes.json() as {
            address?: { city?: string; town?: string; village?: string; county?: string; country?: string };
          };
          const a = geoData.address ?? {};
          const city = a.city ?? a.town ?? a.village ?? a.county ?? 'Your location';

          // Weather — fetch extra fields for expanded card
          const wxRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code` +
            `&wind_speed_unit=kmh&temperature_unit=celsius`
          );
          const wxData = await wxRes.json() as {
            current: {
              temperature_2m: number;
              apparent_temperature: number;
              precipitation: number;
              wind_speed_10m: number;
              weather_code: number;
            };
          };
          const c = wxData.current;
          const { label, icon } = getCondition(c.weather_code);

          const w: WeatherCache = {
            temp: Math.round(c.temperature_2m),
            feelsLike: Math.round(c.apparent_temperature),
            windSpeed: Math.round(c.wind_speed_10m),
            precipitation: Math.round(c.precipitation * 10) / 10,
            condition: label,
            icon,
            city,
            cachedAt: Date.now(),
          };
          await saveWeatherCache(w);
          resolve(w);
        } catch {
          resolve(null);
        }
      },
      () => resolve(null),
      { timeout: 5000 },
    );
  });
}
