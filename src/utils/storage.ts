export interface Settings {
  name: string;
  showWeather: boolean;
  showQuote: boolean;
  showTodos: boolean;
  showLinks: boolean;
  showPomodoro: boolean;
  showNotes: boolean;
  showWorldClocks: boolean;
  showCountdowns: boolean;
  showAi: boolean;
  showCalendar: boolean;
  theme: 'auto' | 'light' | 'dark';
  unsplashKey: string;
  /** Kept for backward compatibility; `aiProviders` is what the modal reads. */
  aiProvider: 'claude' | 'chatgpt' | 'gemini';
  /** Every provider the Ask AI modal opens. More than one = side-by-side compare. */
  aiProviders: string[];
  worldClocks: WorldClock[];
  customBackgrounds: string[]; // data URLs or https image URLs, max 12
  /** Where a non-custom background comes from. 'random' is the long-standing default. */
  backgroundSource: 'random' | 'topic' | 'bing';
  backgroundTopic: string;     // preset id or anything the user types
  activeBackground: 'daily' | 'custom';
  activeCustomBg: number; // index into customBackgrounds
  locationOverride: string; // empty = use device GPS

  googleClientId: string; // Google OAuth client ID for Calendar
  quoteCategory: 'motivation' | 'stoic' | 'tech' | 'random';
  tempUnit: 'celsius' | 'fahrenheit';

  // ── Focus mode ──
  focusMins: number;
  breakMins: number;
  longBreakMins: number;
  /** Focus rounds between long breaks. */
  roundsPerLongBreak: number;
  /** Roll straight into the next interval instead of waiting for a click. */
  autoStartNext: boolean;
  /** Dim and blur the wallpaper while focus mode is open. */
  focusBlur: boolean;
  /** Minutes of focus that count as a full day. */
  dailyGoalMins: number;
  todoSort: 'manual' | 'priority' | 'due';
  /** Tasks shown as a small chip instead of the full panel. */
  todosCollapsed: boolean;

  // ── Quick links ──
  linksView: 'list' | 'grid';
  linksSort: 'manual' | 'frequent' | 'alpha';
}

export interface TabSession {
  id: string;
  name: string;
  savedAt: number;
  // Stored in left-to-right tab order. `pinned` is absent on sessions saved before 1.2.1.
  tabs: { title: string; url: string; favicon?: string; pinned?: boolean }[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

/** Everything past `done` is absent on tasks saved before 1.10.0. */
export interface Todo {
  id: string;
  text: string;
  done: boolean;
  priority?: 'high' | 'medium' | 'none';
  dueDate?: string; // ISO date string YYYY-MM-DD
  subtasks?: Subtask[];
  /** Pomodoro rounds planned for this task, and how many have actually finished. */
  estPomos?: number;
  donePomos?: number;
  /** Pulled into the Today list by hand, independent of any due date. */
  today?: boolean;
  createdAt?: number;
  doneAt?: number;
}

/** `visits`/`lastVisit` are absent on links saved before 1.11.0. */
export interface QuickLink {
  id: string;
  label: string;
  url: string;
  folderId?: string;
  visits?: number;
  lastVisit?: number;
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
  backgroundCredit?: { text: string; url: string };
  quote: string;
  quoteAuthor: string;
}

export interface WeatherForecastDay {
  day: string;   // e.g. "Mon"
  icon: string;
  hi: number;
  lo: number;
  pop?: number;  // max chance of precipitation, %
}

export interface WeatherHour {
  label: string;  // "14:00", or "Now" for the current hour
  icon: string;
  temp: number;
  pop: number;    // chance of precipitation, %
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
  // Added in 1.9 — all optional so a cache written by an older build still loads
  humidity?: number;
  windDir?: number;     // degrees the wind is coming from
  windGust?: number;
  pressure?: number;    // hPa
  uv?: number;
  visibility?: number;  // metres
  isDay?: boolean;
  sunrise?: string;     // ISO local time
  sunset?: string;
  aqi?: number;         // European AQI
  hourly?: WeatherHour[];
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
  showWeather: true,
  showQuote: true,
  showTodos: true,
  showLinks: true,
  showPomodoro: false,
  showNotes: true,
  showWorldClocks: true,
  showCountdowns: false,
  showAi: true,
  showCalendar: false,
  theme: 'dark',
  unsplashKey: '',
  aiProvider: 'claude',
  aiProviders: ['claude'],
  worldClocks: [
    { label: 'London', timezone: 'Europe/London' },
    { label: 'New York', timezone: 'America/New_York' },
    { label: 'Tokyo', timezone: 'Asia/Tokyo' },
  ],
  customBackgrounds: [],
  backgroundSource: 'random',
  backgroundTopic: 'nature',
  activeBackground: 'daily',
  activeCustomBg: 0,
  locationOverride: '',

  googleClientId: '',
  quoteCategory: 'motivation',
  tempUnit: 'celsius',

  focusMins: 25,
  breakMins: 5,
  longBreakMins: 15,
  roundsPerLongBreak: 4,
  autoStartNext: false,
  focusBlur: true,
  dailyGoalMins: 120,
  todoSort: 'manual',
  todosCollapsed: true,

  linksView: 'list',
  linksSort: 'manual',
};

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get('mt_settings');
  return { ...DEFAULTS, ...(result['mt_settings'] ?? {}) };
}

export async function saveSettings(s: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  const merged = { ...current, ...s };
  await chrome.storage.sync.set({ mt_settings: merged });
  await chrome.storage.local.set({ mt_settings: merged });
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

// Player volume (0–100), shared by soundscapes and the YouTube player.
export async function getYtVolume(): Promise<number> {
  const result = await chrome.storage.local.get('mt_yt_volume');
  const v = result['mt_yt_volume'];
  return typeof v === 'number' && v >= 0 && v <= 100 ? v : 50;
}

export async function saveYtVolume(v: number): Promise<void> {
  await chrome.storage.local.set({ mt_yt_volume: Math.max(0, Math.min(100, Math.round(v))) });
}

// Video IDs the YouTube player has reported as un-embeddable (error 100/101/150).
// Remembered so the UI can flag them instead of silently failing again.
export async function getYtBlockedIds(): Promise<string[]> {
  const result = await chrome.storage.local.get('mt_yt_blocked');
  return (result['mt_yt_blocked'] as string[]) ?? [];
}

export async function addYtBlockedId(id: string): Promise<void> {
  const ids = await getYtBlockedIds();
  if (ids.includes(id)) return;
  ids.push(id);
  await chrome.storage.local.set({ mt_yt_blocked: ids.slice(-200) });
}

/** A stock the user is following. Crypto was dropped in 1.12.0. */
export interface WatchItem {
  id: string;
  symbol: string;            // ticker, e.g. AAPL
  name?: string;             // company name, filled in when first resolved
  addedAt?: number;

  // Threshold alert — fires when the price crosses an absolute level
  alertPrice?: number;
  alertDirection?: 'above' | 'below';

  // Move alert — fires when the day's change passes ±N%
  alertPct?: number;
  alertPctDirection?: 'up' | 'down' | 'both';

  /**
   * The day each alert last fired (YYYY-MM-DD). Alerts latch so they cannot
   * repeat all afternoon, and re-arm on the next day.
   */
  priceFiredOn?: string;
  pctFiredOn?: string;
}

export async function getWatchlist(): Promise<WatchItem[]> {
  const result = await chrome.storage.local.get('mt_watchlist');
  return (result['mt_watchlist'] as WatchItem[]) ?? [];
}

export async function saveWatchlist(items: WatchItem[]): Promise<void> {
  await chrome.storage.local.set({ mt_watchlist: items });
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Tab Sessions ─────────────────────────────────────────────────────────────

export async function getTabSessions(): Promise<TabSession[]> {
  const r = await chrome.storage.local.get('mt_tab_sessions');
  return (r['mt_tab_sessions'] as TabSession[]) ?? [];
}

export async function saveTabSessions(sessions: TabSession[]): Promise<void> {
  await chrome.storage.local.set({ mt_tab_sessions: sessions });
}

// ─── Multi-note Notes ─────────────────────────────────────────────────────────

export async function getNotesList(): Promise<Note[]> {
  const r = await chrome.storage.local.get(['mt_notes_v2', 'mt_notes']);
  if (r['mt_notes_v2']) return r['mt_notes_v2'] as Note[];
  // Migrate from single note string
  const legacy = (r['mt_notes'] as string) ?? '';
  if (legacy) {
    const note: Note = {
      id: 'note_legacy',
      title: 'My Notes',
      content: legacy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await chrome.storage.local.set({ mt_notes_v2: [note] });
    return [note];
  }
  return [];
}

export async function saveNotesList(notes: Note[]): Promise<void> {
  await chrome.storage.local.set({ mt_notes_v2: notes });
}

// ─── AI prompt history ────────────────────────────────────────────────────────

export async function getAiHistory(): Promise<string[]> {
  const r = await chrome.storage.local.get('mt_ai_history');
  return (r['mt_ai_history'] as string[]) ?? [];
}

export async function addAiHistory(prompt: string): Promise<void> {
  let history = await getAiHistory();
  history = history.filter(h => h !== prompt);
  history.unshift(prompt);
  await chrome.storage.local.set({ mt_ai_history: history.slice(0, 30) });
}

export async function removeAiHistory(prompt: string): Promise<void> {
  const history = await getAiHistory();
  await chrome.storage.local.set({ mt_ai_history: history.filter(h => h !== prompt) });
}

export async function clearAiHistory(): Promise<void> {
  await chrome.storage.local.remove('mt_ai_history');
}

/** Prompts the user pinned for reuse. */
export async function getAiPinned(): Promise<string[]> {
  const r = await chrome.storage.local.get('mt_ai_pinned');
  return (r['mt_ai_pinned'] as string[]) ?? [];
}

export async function saveAiPinned(prompts: string[]): Promise<void> {
  await chrome.storage.local.set({ mt_ai_pinned: prompts.slice(0, 30) });
}
