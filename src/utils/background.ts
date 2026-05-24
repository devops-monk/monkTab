import { getDaily, saveDaily, todayString } from './storage';

// Curated high-quality Unsplash photo IDs (nature/landscape) — fallback when no API key
const FALLBACK_PHOTOS = [
  'photo-1506905925346-21bda4d32df4', // mountain lake
  'photo-1501854140801-50d01698950b', // green hills
  'photo-1518837695005-2083093ee35b', // ocean sunset
  'photo-1542224566-6e85f2e6772f', // forest path
  'photo-1476820865390-c52aeebb9891', // snowy peaks
  'photo-1469474968028-56623f02e42e', // golden hour valley
  'photo-1500534314209-a25ddb2bd429', // misty forest
  'photo-1441974231531-c6227db76b6e', // sunlit forest
  'photo-1447752875215-b2761acb3c5d', // autumn forest
  'photo-1433086966358-54859d0ed716', // waterfall
];

function todayIndex(): number {
  const d = new Date();
  return (d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate()) % FALLBACK_PHOTOS.length;
}

export async function getBackground(unsplashKey: string): Promise<{ url: string; thumb: string }> {
  const daily = await getDaily();
  if (daily?.date === todayString() && daily.backgroundUrl) {
    return { url: daily.backgroundUrl, thumb: daily.backgroundThumb };
  }

  if (unsplashKey) {
    try {
      const res = await fetch(
        `https://api.unsplash.com/photos/random?orientation=landscape&topics=nature,travel&client_id=${unsplashKey}`
      );
      const data = await res.json() as {
        urls: { full: string; thumb: string };
      };
      const url = data.urls.full;
      const thumb = data.urls.thumb;
      await saveDaily({ backgroundUrl: url, backgroundThumb: thumb });
      return { url, thumb };
    } catch { /* fall through to fallback */ }
  }

  // Fallback: deterministic daily Unsplash photo (no API key needed)
  const id = FALLBACK_PHOTOS[todayIndex()];
  const url = `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1920&q=80`;
  const thumb = `https://images.unsplash.com/${id}?auto=format&fit=crop&w=400&q=60`;
  await saveDaily({ backgroundUrl: url, backgroundThumb: thumb });
  return { url, thumb };
}
