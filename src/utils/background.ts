import { getDaily, saveDaily, todayString, type Settings } from './storage';

export interface BgCredit { text: string; url: string }
export interface BgResult { url: string; thumb: string; credit?: BgCredit }

/**
 * Topics offered as one-click presets. Every one was checked against the Wallhaven
 * search API and returns thousands of SFW landscape wallpapers; the user can also
 * type anything else, which goes through the same query path.
 */
export const BG_TOPICS: Array<{ id: string; label: string; query: string; emoji: string }> = [
  { id: 'nature',       label: 'Nature',       query: 'nature landscape',   emoji: '🌿' },
  { id: 'mountains',    label: 'Mountains',    query: 'mountains',          emoji: '⛰️' },
  { id: 'ocean',        label: 'Ocean',        query: 'ocean sea',          emoji: '🌊' },
  { id: 'forest',       label: 'Forest',       query: 'forest',             emoji: '🌲' },
  { id: 'sunset',       label: 'Sunset',       query: 'sunset',             emoji: '🌅' },
  { id: 'space',        label: 'Space',        query: 'space galaxy',       emoji: '🪐' },
  { id: 'cars',         label: 'Cars',         query: 'cars',               emoji: '🚗' },
  { id: 'movies',       label: 'Movies',       query: 'movie cinema',       emoji: '🎬' },
  { id: 'city',         label: 'Cityscape',    query: 'cityscape',          emoji: '🌃' },
  { id: 'architecture', label: 'Architecture', query: 'architecture',       emoji: '🏛️' },
  { id: 'minimal',      label: 'Minimal',      query: 'minimal',            emoji: '◻️' },
  { id: 'abstract',     label: 'Abstract',     query: 'abstract',           emoji: '🎨' },
  { id: 'animals',      label: 'Animals',      query: 'wildlife animals',   emoji: '🦊' },
  { id: 'cyberpunk',    label: 'Cyberpunk',    query: 'cyberpunk',          emoji: '🌆' },
  { id: 'code',         label: 'Code',         query: 'code programming',   emoji: '💻' },
  { id: 'aerial',       label: 'Aerial',       query: 'aerial drone',       emoji: '🛩️' },
];

function topicQuery(topic: string): string {
  return BG_TOPICS.find(t => t.id === topic)?.query ?? topic;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 10000);
}

function picsum(): BgResult {
  // Random seed each call, ~10,000 photos, no API key needed
  const seed = randomSeed();
  return {
    url: `https://picsum.photos/seed/${seed}/1920/1080`,
    thumb: `https://picsum.photos/seed/${seed}/400/225`,
  };
}

/**
 * Wallhaven's search API is open for SFW browsing — no key. The filters matter:
 * `purity=100` is SFW-only and `categories=100` is the "General" category, which
 * excludes the anime and people sections. Both are enforced server-side.
 */
async function fromWallhaven(topic: string): Promise<BgResult | null> {
  try {
    const q = encodeURIComponent(topicQuery(topic));
    const res = await fetch(
      `https://wallhaven.cc/api/v1/search?q=${q}&categories=100&purity=100` +
      `&atleast=1920x1080&sorting=random&ratios=landscape`,
      { signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      data?: Array<{ path: string; short_url: string; thumbs?: { small?: string; large?: string } }>;
    };
    const hits = data.data ?? [];
    if (!hits.length) return null;
    const pick = hits[Math.floor(Math.random() * hits.length)];
    return {
      url: pick.path,
      thumb: pick.thumbs?.small ?? pick.thumbs?.large ?? pick.path,
      credit: { text: 'Wallhaven', url: pick.short_url },
    };
  } catch { return null; }
}

/** Only used when the user supplies their own key. Attribution is required by their API terms. */
async function fromUnsplash(key: string, topic: string): Promise<BgResult | null> {
  try {
    const q = encodeURIComponent(topicQuery(topic));
    const res = await fetch(
      `https://api.unsplash.com/photos/random?orientation=landscape&query=${q}&client_id=${key}`,
      { signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return null;
    const d = await res.json() as {
      urls?: { full: string; regular: string; thumb: string };
      links?: { html: string };
      user?: { name: string };
    };
    if (!d.urls) return null;
    return {
      url: d.urls.regular || d.urls.full,
      thumb: d.urls.thumb,
      credit: {
        text: `Photo by ${d.user?.name ?? 'Unsplash'} on Unsplash`,
        url: d.links?.html ?? 'https://unsplash.com',
      },
    };
  } catch { return null; }
}

/** Bing's picture-of-the-day archive — curated, keyless, one new image per day. */
async function fromBing(): Promise<BgResult | null> {
  try {
    const res = await fetch(
      'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=en-US',
      { signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return null;
    const d = await res.json() as {
      images?: Array<{ urlbase: string; title: string; copyright: string; copyrightlink: string }>;
    };
    const imgs = d.images ?? [];
    if (!imgs.length) return null;
    const pick = imgs[Math.floor(Math.random() * imgs.length)];
    return {
      url: `https://www.bing.com${pick.urlbase}_1920x1080.jpg`,
      thumb: `https://www.bing.com${pick.urlbase}_400x240.jpg`,
      credit: { text: pick.copyright || pick.title, url: pick.copyrightlink || 'https://www.bing.com' },
    };
  } catch { return null; }
}

/**
 * One background per day unless the user asks for another. Every source can fail —
 * rate limits, outages, a topic with no hits — so each one falls back to Picsum
 * rather than leaving the page without a background.
 */
export async function getBackground(settings: Settings, forceNext = false): Promise<BgResult> {
  const daily = await getDaily();
  if (!forceNext && daily?.date === todayString() && daily.backgroundUrl) {
    return { url: daily.backgroundUrl, thumb: daily.backgroundThumb, credit: daily.backgroundCredit };
  }

  let result: BgResult | null = null;
  if (settings.backgroundSource === 'topic') {
    // A user-supplied Unsplash key buys better curation, so prefer it when present
    result = settings.unsplashKey
      ? await fromUnsplash(settings.unsplashKey, settings.backgroundTopic)
      : null;
    result ??= await fromWallhaven(settings.backgroundTopic);
  } else if (settings.backgroundSource === 'bing') {
    result = await fromBing();
  }
  result ??= picsum();

  await saveDaily({
    backgroundUrl: result.url,
    backgroundThumb: result.thumb,
    backgroundCredit: result.credit,
  });
  return result;
}
