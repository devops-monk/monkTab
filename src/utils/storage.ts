export interface Settings {
  name: string;
  searchEngine: 'google' | 'duckduckgo' | 'bing';
  showWeather: boolean;
  showQuote: boolean;
  showTodos: boolean;
  showLinks: boolean;
  showPomodoro: boolean;
  showNotes: boolean;
  showWorldClocks: boolean;
  showCountdowns: boolean;
  showGithub: boolean;
  showAi: boolean;
  theme: 'auto' | 'light' | 'dark';
  unsplashKey: string;
  githubToken: string;
  githubUsername: string;
  aiProvider: 'claude' | 'chatgpt' | 'gemini';
  worldClocks: WorldClock[];
  customBackgrounds: string[]; // data URLs, max 6
  activeBackground: 'daily' | 'custom';
  activeCustomBg: number; // index into customBackgrounds
  locationOverride: string; // empty = use device GPS
  finnhubKey: string;
  marketWatchlistCrypto: string[];
  marketWatchlistStocks: string[];
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  priority?: 'high' | 'medium' | 'none';
  dueDate?: string; // ISO date string YYYY-MM-DD
}

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  folderId?: string;
}

export interface QuickLinkFolder {
  id: string;
  label: string;
}

export interface Countdown {
  id: string;
  label: string;
  date: string; // ISO date string YYYY-MM-DD
}

export interface WorldClock {
  label: string;
  timezone: string;
}

export interface DailyState {
  date: string;
  focus: string;
  backgroundUrl: string;
  backgroundThumb: string;
  quote: string;
  quoteAuthor: string;
}

export interface WeatherForecastDay {
  day: string;   // e.g. "Mon"
  icon: string;
  hi: number;
  lo: number;
}

export interface WeatherCache {
  temp: number;
  feelsLike: number;
  windSpeed: number;
  precipitation: number;
  condition: string;
  icon: string;
  city: string;
  cachedAt: number;
  forecast?: WeatherForecastDay[];
}

export interface FocusDay {
  date: string;   // YYYY-MM-DD
  minutes: number;
  sessions: number;
}

export interface CustomYtVideo {
  id: string;
  title: string;
  addedAt: number;
}

export interface YtPlayState {
  id: string;
  title: string;
  ch: string;
  startedAt: number;      // Date.now() when playback started or resumed
  pausedPosition: number; // seconds elapsed when paused (0 when playing)
  isPaused: boolean;
}

export async function getYtPlayState(): Promise<YtPlayState | null> {
  const result = await chrome.storage.local.get('mt_yt_play_state');
  return (result['mt_yt_play_state'] as YtPlayState) ?? null;
}

export async function saveYtPlayState(s: YtPlayState): Promise<void> {
  await chrome.storage.local.set({ mt_yt_play_state: s });
}

export async function clearYtPlayState(): Promise<void> {
  await chrome.storage.local.remove('mt_yt_play_state');
}

export interface YtRecentTrack {
  id: string;
  title: string;
  ch: string;
  playedAt: number;
}

export async function getYtRecent(): Promise<YtRecentTrack[]> {
  const result = await chrome.storage.local.get('mt_yt_recent');
  return (result['mt_yt_recent'] as YtRecentTrack[]) ?? [];
}

export async function addYtRecent(track: YtRecentTrack): Promise<void> {
  let recent = await getYtRecent();
  recent = recent.filter(r => r.id !== track.id);
  recent.unshift(track);
  await chrome.storage.local.set({ mt_yt_recent: recent.slice(0, 15) });
}

const DEFAULTS: Settings = {
  name: '',
  searchEngine: 'google',
  showWeather: true,
  showQuote: true,
  showTodos: true,
  showLinks: true,
  showPomodoro: false,
  showNotes: false,
  showWorldClocks: false,
  showCountdowns: false,
  showGithub: false,
  showAi: true,
  theme: 'auto',
  unsplashKey: '',
  githubToken: '',
  githubUsername: '',
  aiProvider: 'claude',
  worldClocks: [
    { label: 'London', timezone: 'Europe/London' },
    { label: 'New York', timezone: 'America/New_York' },
    { label: 'Tokyo', timezone: 'Asia/Tokyo' },
  ],
  customBackgrounds: [],
  activeBackground: 'daily',
  activeCustomBg: 0,
  locationOverride: '',
  finnhubKey: '',
  marketWatchlistCrypto: ['bitcoin', 'ethereum', 'solana', 'binancecoin'],
  marketWatchlistStocks: ['AAPL', 'NVDA', 'GOOGL', 'MSFT', 'TSLA'],
};

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get('mt_settings');
  return { ...DEFAULTS, ...(result['mt_settings'] ?? {}) };
}

export async function saveSettings(s: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.sync.set({ mt_settings: { ...current, ...s } });
}

export async function getDaily(): Promise<DailyState | null> {
  const result = await chrome.storage.local.get('mt_daily');
  return (result['mt_daily'] as DailyState) ?? null;
}

export async function saveDaily(d: Partial<DailyState>): Promise<void> {
  const current = await getDaily();
  await chrome.storage.local.set({ mt_daily: { ...(current ?? {}), ...d } });
}

export async function getTodos(): Promise<Todo[]> {
  const result = await chrome.storage.local.get('mt_todos');
  return (result['mt_todos'] as Todo[]) ?? [];
}

export async function saveTodos(todos: Todo[]): Promise<void> {
  await chrome.storage.local.set({ mt_todos: todos });
}

export async function getLinks(): Promise<QuickLink[]> {
  const result = await chrome.storage.local.get('mt_links');
  return (result['mt_links'] as QuickLink[]) ?? defaultLinks();
}

export async function saveLinks(links: QuickLink[]): Promise<void> {
  await chrome.storage.local.set({ mt_links: links });
}

export async function getFolders(): Promise<QuickLinkFolder[]> {
  const result = await chrome.storage.local.get('mt_link_folders');
  return (result['mt_link_folders'] as QuickLinkFolder[]) ?? defaultFolders();
}

export async function saveFolders(folders: QuickLinkFolder[]): Promise<void> {
  await chrome.storage.local.set({ mt_link_folders: folders });
}

export async function getWeatherCache(): Promise<WeatherCache | null> {
  const result = await chrome.storage.local.get('mt_weather');
  return (result['mt_weather'] as WeatherCache) ?? null;
}

export async function saveWeatherCache(w: WeatherCache): Promise<void> {
  await chrome.storage.local.set({ mt_weather: w });
}

export async function getNotes(): Promise<string> {
  const result = await chrome.storage.local.get('mt_notes');
  return (result['mt_notes'] as string) ?? '';
}

export async function saveNotes(text: string): Promise<void> {
  await chrome.storage.local.set({ mt_notes: text });
}

export async function getCountdowns(): Promise<Countdown[]> {
  const result = await chrome.storage.local.get('mt_countdowns');
  return (result['mt_countdowns'] as Countdown[]) ?? [];
}

export async function saveCountdowns(items: Countdown[]): Promise<void> {
  await chrome.storage.local.set({ mt_countdowns: items });
}

export async function getFocusHistory(): Promise<FocusDay[]> {
  const result = await chrome.storage.local.get('mt_focus_history');
  return (result['mt_focus_history'] as FocusDay[]) ?? [];
}

export async function logFocusSession(minutes: number): Promise<void> {
  const history = await getFocusHistory();
  const today = todayString();
  const existing = history.find(d => d.date === today);
  if (existing) {
    existing.minutes += minutes;
    existing.sessions += 1;
  } else {
    history.push({ date: today, minutes, sessions: 1 });
  }
  // Keep only last 30 days
  const recent = history.sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  await chrome.storage.local.set({ mt_focus_history: recent });
}

function defaultFolders(): QuickLinkFolder[] {
  return [{ id: 'default', label: 'DevOps' }];
}

function defaultLinks(): QuickLink[] {
  return [
    { id: '1', label: 'GitHub', url: 'https://github.com', folderId: 'default' },
    { id: '2', label: 'AWS', url: 'https://console.aws.amazon.com', folderId: 'default' },
  ];
}

export async function getCustomYtVideos(): Promise<CustomYtVideo[]> {
  const result = await chrome.storage.local.get('mt_yt_custom');
  return (result['mt_yt_custom'] as CustomYtVideo[]) ?? [];
}

export async function saveCustomYtVideos(videos: CustomYtVideo[]): Promise<void> {
  await chrome.storage.local.set({ mt_yt_custom: videos });
}

export interface PortfolioHolding {
  id: string;
  symbol: string;          // display symbol, e.g. BTC, AAPL
  type: 'crypto' | 'stock';
  coinId?: string;         // CoinGecko ID for crypto (e.g. 'bitcoin')
  units: number;           // shares or coins owned
  avgCost: number;         // average cost per unit in USD
}

export async function getPortfolio(): Promise<PortfolioHolding[]> {
  const result = await chrome.storage.local.get('mt_portfolio');
  return (result['mt_portfolio'] as PortfolioHolding[]) ?? [];
}

export async function savePortfolio(holdings: PortfolioHolding[]): Promise<void> {
  await chrome.storage.local.set({ mt_portfolio: holdings });
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}
