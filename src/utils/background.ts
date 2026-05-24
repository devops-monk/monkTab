import { getDaily, saveDaily, todayString } from './storage';

function randomSeed(): number {
  return Math.floor(Math.random() * 10000);
}

export async function getBackground(unsplashKey: string, forceNext = false): Promise<{ url: string; thumb: string }> {
  const daily = await getDaily();
  if (!forceNext && daily?.date === todayString() && daily.backgroundUrl) {
    return { url: daily.backgroundUrl, thumb: daily.backgroundThumb };
  }

  if (unsplashKey) {
    try {
      const res = await fetch(
        `https://api.unsplash.com/photos/random?orientation=landscape&topics=nature,travel&client_id=${unsplashKey}`
      );
      const data = await res.json() as { urls: { full: string; thumb: string } };
      await saveDaily({ backgroundUrl: data.urls.full, backgroundThumb: data.urls.thumb });
      return { url: data.urls.full, thumb: data.urls.thumb };
    } catch { /* fall through to Picsum */ }
  }

  // Picsum Photos — random seed each call, 10,000 possible photos, no API key needed
  const seed = randomSeed();
  const url = `https://picsum.photos/seed/${seed}/1920/1080`;
  const thumb = `https://picsum.photos/seed/${seed}/400/225`;
  await saveDaily({ backgroundUrl: url, backgroundThumb: thumb });
  return { url, thumb };
}
