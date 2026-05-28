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
  showGithub: boolean;
  showAi: boolean;
  showHabits: boolean;
  showJournal: boolean;
  showCalendar: boolean;
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

  googleClientId: string; // Google OAuth client ID for Calendar
  quoteCategory: 'motivation' | 'stoic' | 'tech' | 'random';
  tempUnit: 'celsius' | 'fahrenheit';
}

export interface TabSession {
  id: string;
  name: string;
  savedAt: number;
  tabs: { title: string; url: string; favicon?: string }[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface Habit {
  id: string;
  label: string;
  emoji: string;
}

export interface HabitLog {
  date: string;           // YYYY-MM-DD
  done: Record<string, boolean>; // habit id -> completed today
}

export interface JournalEntry {
  date: string;    // YYYY-MM-DD
  prompt: string;
  text: string;
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
  showHabits: false,
  showJournal: false,
  showCalendar: false,
  theme: 'dark',
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

  googleClientId: '',
  quoteCategory: 'motivation',
  tempUnit: 'celsius',
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

export interface WatchItem {
  id: string;
  symbol: string;            // display symbol, e.g. BTC, AAPL
  type: 'crypto' | 'stock';
  coinId?: string;           // CoinGecko ID for crypto (e.g. 'bitcoin')
  alertPrice?: number;       // trigger price
  alertDirection?: 'above' | 'below';
  alertTriggered?: boolean;  // latched once fired
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

// ─── Habits ───────────────────────────────────────────────────────────────────

export async function getHabits(): Promise<Habit[]> {
  const r = await chrome.storage.local.get('mt_habits');
  return (r['mt_habits'] as Habit[]) ?? [];
}

export async function saveHabits(habits: Habit[]): Promise<void> {
  await chrome.storage.local.set({ mt_habits: habits });
}

export async function getTodayHabitLog(): Promise<HabitLog> {
  const today = todayString();
  const r = await chrome.storage.local.get('mt_habit_logs');
  const logs = (r['mt_habit_logs'] as HabitLog[]) ?? [];
  return logs.find(l => l.date === today) ?? { date: today, done: {} };
}

export async function saveHabitLog(log: HabitLog): Promise<void> {
  const r = await chrome.storage.local.get('mt_habit_logs');
  const logs = (r['mt_habit_logs'] as HabitLog[]) ?? [];
  const idx = logs.findIndex(l => l.date === log.date);
  if (idx >= 0) logs[idx] = log; else logs.push(log);
  // keep last 90 days
  const recent = logs.sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
  await chrome.storage.local.set({ mt_habit_logs: recent });
}

export async function getHabitStreak(habitId: string): Promise<number> {
  const r = await chrome.storage.local.get('mt_habit_logs');
  const logs = ((r['mt_habit_logs'] as HabitLog[]) ?? [])
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first
  const today = todayString();
  let streak = 0;
  let cursor = today;
  for (const log of logs) {
    if (log.date !== cursor) break;
    if (log.done[habitId]) streak++;
    else break;
    const d = new Date(cursor); d.setDate(d.getDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return streak;
}

// ─── Journal ──────────────────────────────────────────────────────────────────

export async function getJournalEntries(): Promise<JournalEntry[]> {
  const r = await chrome.storage.local.get('mt_journal');
  return (r['mt_journal'] as JournalEntry[]) ?? [];
}

export async function saveJournalEntry(entry: JournalEntry): Promise<void> {
  const entries = await getJournalEntries();
  const idx = entries.findIndex(e => e.date === entry.date);
  if (idx >= 0) entries[idx] = entry; else entries.push(entry);
  const recent = entries.sort((a, b) => a.date.localeCompare(b.date)).slice(-365);
  await chrome.storage.local.set({ mt_journal: recent });
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
  await chrome.storage.local.set({ mt_ai_history: history.slice(0, 20) });
}
