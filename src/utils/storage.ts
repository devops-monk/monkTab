export interface Settings {
  name: string;
  searchEngine: 'google' | 'duckduckgo' | 'bing';
  showWeather: boolean;
  showQuote: boolean;
  showTodos: boolean;
  showLinks: boolean;
  showPomodoro: boolean;
  theme: 'auto' | 'light' | 'dark';
  unsplashKey: string;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export interface QuickLink {
  id: string;
  label: string;
  url: string;
}

export interface DailyState {
  date: string;         // YYYY-MM-DD
  focus: string;
  backgroundUrl: string;
  backgroundThumb: string;
  quote: string;
  quoteAuthor: string;
}

export interface WeatherCache {
  temp: number;
  condition: string;
  icon: string;
  city: string;
  cachedAt: number;
}

const DEFAULTS: Settings = {
  name: '',
  searchEngine: 'google',
  showWeather: true,
  showQuote: true,
  showTodos: true,
  showLinks: true,
  showPomodoro: false,
  theme: 'auto',
  unsplashKey: '',
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

export async function getWeatherCache(): Promise<WeatherCache | null> {
  const result = await chrome.storage.local.get('mt_weather');
  return (result['mt_weather'] as WeatherCache) ?? null;
}

export async function saveWeatherCache(w: WeatherCache): Promise<void> {
  await chrome.storage.local.set({ mt_weather: w });
}

function defaultLinks(): QuickLink[] {
  return [
    { id: '1', label: 'GitHub', url: 'https://github.com' },
    { id: '2', label: 'DevOps-Monk', url: 'https://devops-monk.com' },
    { id: '3', label: 'MonkKit', url: 'https://tools.devops-monk.com' },
    { id: '4', label: 'AWS', url: 'https://console.aws.amazon.com' },
  ];
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}
