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

          // Reverse geocode city name
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1`
          );
          const geoData = await geoRes.json() as { results?: { name: string }[] };
          const city = geoData.results?.[0]?.name ?? 'Your location';

          // Weather
          const wxRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=celsius`
          );
          const wxData = await wxRes.json() as {
            current_weather: { temperature: number; weathercode: number };
          };
          const { temperature, weathercode } = wxData.current_weather;
          const { label, icon } = getCondition(weathercode);

          const w: WeatherCache = {
            temp: Math.round(temperature),
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
