import {
  getSettings, saveSettings, getDaily, saveDaily, getTodos, saveTodos,
  getLinks, saveLinks, getFolders, saveFolders, getNotes, saveNotes, getCountdowns, saveCountdowns,
  getFocusHistory, logFocusSession, getCustomYtVideos, saveCustomYtVideos,
  getYtBlockedIds, addYtBlockedId, getYtVolume, saveYtVolume,
  getYtPlayState, saveYtPlayState, clearYtPlayState, getYtRecent, addYtRecent,
  getTabSessions, saveTabSessions, getNotesList, saveNotesList,
  getAiHistory, addAiHistory, removeAiHistory, clearAiHistory, getAiPinned, saveAiPinned,
  todayString, type Todo, type Subtask, type QuickLink, type QuickLinkFolder, type Countdown, type WorldClock, type Settings,
  type CustomYtVideo, type YtPlayState, type WatchItem,
  type TabSession, type Note,
  getWatchlist, saveWatchlist, saveWeatherCache,
} from '../utils/storage';
import { fetchWeather, getCondition } from '../utils/weather';
import { getBackground, BG_TOPICS } from '../utils/background';
import { getQuote, getRandomQuote } from '../utils/quotes';
import { SOUNDSCAPES, playSoundscape, stopSoundscape, setSoundVolume, preloadSoundscape } from '../utils/soundscapes';
import { TIMEZONES, POPULAR_TZ, countryFlag, type TzEntry, type TzHit } from '../utils/timezones';

// ─── Clock ────────────────────────────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  (document.getElementById('clock') as HTMLElement).textContent = `${h}:${m}`;
  (document.getElementById('clock-date') as HTMLElement).textContent = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}
updateClock();
setInterval(updateClock, 1000);

// ─── Greeting ─────────────────────────────────────────────────────────────────

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return name ? `Good ${part}, ${name}.` : `Good ${part}.`;
}

// ─── Background ───────────────────────────────────────────────────────────────

/** Photo credit line — required by Unsplash's API terms, good manners for the rest. */
function setBgCredit(credit?: { text: string; url: string }) {
  const el = document.getElementById('bg-credit') as HTMLAnchorElement | null;
  if (!el) return;
  if (!credit?.text) { el.classList.add('hidden'); return; }
  el.textContent = credit.text;
  el.href = credit.url || '#';
  el.classList.remove('hidden');
}

async function loadBackground(settings: Settings, forceNext = false) {
  const bg = document.getElementById('bg') as HTMLDivElement;

  if (settings.activeBackground === 'custom' && settings.customBackgrounds.length > 0) {
    const idx = Math.min(settings.activeCustomBg, settings.customBackgrounds.length - 1);
    bg.style.backgroundImage = `url(${settings.customBackgrounds[idx]})`;
    setBgCredit();
    return;
  }

  const { url, thumb, credit } = await getBackground(settings, forceNext);
  setBgCredit(credit);
  // Paint the thumbnail immediately, then swap once the full image is decoded
  bg.style.backgroundImage = `url(${thumb})`;
  const img = new Image();
  img.onload = () => { bg.style.backgroundImage = `url(${url})`; };
  img.src = url;
}

// ─── Quote ────────────────────────────────────────────────────────────────────

function setQuote(quote: string, author: string) {
  const textEl = document.getElementById('quote-text') as HTMLElement;
  const authorEl = document.getElementById('quote-author') as HTMLElement;
  textEl.style.opacity = '0';
  authorEl.style.opacity = '0';
  setTimeout(() => {
    textEl.textContent = `"${quote}"`;
    authorEl.textContent = `— ${author}`;
    textEl.style.opacity = '1';
    authorEl.style.opacity = '1';
  }, 180);
}

async function loadQuote(category = 'motivation') {
  const { quote, author } = await getQuote(category);
  setQuote(quote, author);
}

function initQuoteRefresh(category = 'motivation') {
  document.getElementById('btn-quote-refresh')?.addEventListener('click', () => {
    const { quote, author } = getRandomQuote(category);
    setQuote(quote, author);
  });
}

// ─── Weather ──────────────────────────────────────────────────────────────────

let weatherCache: Awaited<ReturnType<typeof fetchWeather>> | null = null;
let currentTempUnit: 'celsius' | 'fahrenheit' = 'celsius';

function toF(c: number) { return Math.round(c * 9 / 5 + 32); }
function displayTemp(c: number, unit: typeof currentTempUnit) { return unit === 'fahrenheit' ? toF(c) : c; }
function unitLabel(unit: typeof currentTempUnit) { return unit === 'fahrenheit' ? '°F' : '°C'; }

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Wind direction is reported as the bearing the wind comes *from*. */
function windLabel(deg?: number): string {
  if (deg === undefined) return '--';
  return COMPASS[Math.round(deg / 45) % 8];
}

/** UV bands per WHO. */
function uvBand(uv: number): { text: string; color: string } {
  if (uv < 3)  return { text: 'Low',       color: '#4ade80' };
  if (uv < 6)  return { text: 'Moderate',  color: '#fbbf24' };
  if (uv < 8)  return { text: 'High',      color: '#fb923c' };
  if (uv < 11) return { text: 'Very high', color: '#f87171' };
  return { text: 'Extreme', color: '#c084fc' };
}

/** European AQI bands. */
function aqiBand(aqi: number): { text: string; color: string } {
  if (aqi <= 20)  return { text: 'Good',      color: '#4ade80' };
  if (aqi <= 40)  return { text: 'Fair',      color: '#a3e635' };
  if (aqi <= 60)  return { text: 'Moderate',  color: '#fbbf24' };
  if (aqi <= 80)  return { text: 'Poor',      color: '#fb923c' };
  if (aqi <= 100) return { text: 'Very poor', color: '#f87171' };
  return { text: 'Extreme', color: '#c084fc' };
}

function hhmm(iso?: string): string {
  return iso ? iso.slice(11, 16) : '--:--';
}

/** Minutes since midnight for an ISO local timestamp. */
function isoMinutes(iso: string): number {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}

function tile(label: string, value: string, sub = ''): string {
  return `
    <div class="wc-tile">
      <span class="wc-tile-label">${label}</span>
      <span class="wc-tile-val">${value}</span>
      ${sub ? `<span class="wc-tile-sub">${sub}</span>` : ''}
    </div>`;
}

/**
 * Everything that depends on the °C/°F choice is redrawn here, so flipping the unit
 * never needs a refetch.
 */
function applyWeatherUnit(w: NonNullable<typeof weatherCache>, unit: typeof currentTempUnit) {
  const ul = unitLabel(unit);
  const t = (c: number) => displayTemp(c, unit);

  (document.getElementById('weather-temp') as HTMLElement).textContent = `${t(w.temp)}°`;
  (document.getElementById('wc-temp') as HTMLElement).textContent = String(t(w.temp));
  (document.getElementById('btn-temp-unit') as HTMLButtonElement).textContent = ul;
  (document.getElementById('wc-feels-line') as HTMLElement).textContent =
    `Feels like ${t(w.feelsLike ?? w.temp)}${ul}`;

  const today = w.forecast?.[0];
  (document.getElementById('wc-range') as HTMLElement).textContent =
    today ? `H ${t(today.hi)}°  L ${t(today.lo)}°` : '';

  // ── Hourly strip ──────────────────────────────────────────────────────────
  const hourlyEl = document.getElementById('wc-hourly') as HTMLElement;
  const hours = w.hourly ?? [];
  hourlyEl.innerHTML = hours.map((h, i) => `
    <div class="wc-hr${i === 0 ? ' wc-hr--now' : ''}">
      <span class="wc-hr-label">${h.label}</span>
      <span class="wc-hr-icon">${h.icon}</span>
      <span class="wc-hr-temp">${t(h.temp)}°</span>
      <span class="wc-hr-pop">${h.pop >= 15 ? `${h.pop}%` : ''}</span>
    </div>`).join('');
  // The "Next 24 hours" label sits immediately before the strip — hide both together
  hourlyEl.previousElementSibling?.classList.toggle('hidden', !hours.length);
  hourlyEl.classList.toggle('hidden', !hours.length);

  // ── Metric tiles ──────────────────────────────────────────────────────────
  const uv = uvBand(w.uv ?? 0);
  const tiles: string[] = [
    tile('Feels like', `${t(w.feelsLike ?? w.temp)}°`),
    tile('Humidity', w.humidity !== undefined ? `${w.humidity}%` : '--'),
    tile('Wind',
      `<span class="wc-arrow" style="transform:rotate(${(w.windDir ?? 0) + 180}deg)">↑</span>${w.windSpeed ?? '--'} km/h`,
      w.windGust ? `${windLabel(w.windDir)} · gusts ${w.windGust}` : windLabel(w.windDir)),
    tile('UV index',
      `<span class="wc-dot" style="background:${uv.color}"></span>${w.uv ?? '--'}`, uv.text),
    tile('Precipitation', `${w.precipitation ?? 0} mm`,
      today?.pop !== undefined ? `${today.pop}% chance today` : ''),
    tile('Pressure', w.pressure !== undefined ? `${w.pressure} hPa` : '--'),
  ];
  if (w.aqi !== undefined) {
    const aq = aqiBand(w.aqi);
    tiles.push(tile('Air quality', `<span class="wc-dot" style="background:${aq.color}"></span>${w.aqi}`, aq.text));
  }
  if (w.visibility !== undefined) {
    tiles.push(tile('Visibility', `${(w.visibility / 1000).toFixed(1)} km`));
  }
  (document.getElementById('wc-metrics') as HTMLElement).innerHTML = tiles.join('');

  // ── Daylight arc ──────────────────────────────────────────────────────────
  (document.getElementById('wc-sunrise') as HTMLElement).textContent = hhmm(w.sunrise);
  (document.getElementById('wc-sunset') as HTMLElement).textContent = hhmm(w.sunset);
  if (w.sunrise && w.sunset) {
    const rise = isoMinutes(w.sunrise), set = isoMinutes(w.sunset);
    const mins = Math.max(0, set - rise);
    (document.getElementById('wc-daylength') as HTMLElement).textContent =
      `${Math.floor(mins / 60)}h ${mins % 60}m of daylight`;

    const now = new Date();
    const frac = Math.min(1, Math.max(0, (now.getHours() * 60 + now.getMinutes() - rise) / (mins || 1)));
    // Walk the same arc the SVG draws so the dot lands exactly on the curve
    const path = document.getElementById('wc-sun-path') as unknown as SVGPathElement | null;
    const dot = document.getElementById('wc-sun-dot') as unknown as SVGCircleElement | null;
    if (path && dot) {
      const len = path.getTotalLength();
      const p = path.getPointAtLength(len * frac);
      dot.setAttribute('cx', String(p.x));
      dot.setAttribute('cy', String(p.y));
      dot.setAttribute('opacity', frac > 0 && frac < 1 ? '1' : '0.35');
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len * (1 - frac));
    }
  }

  // ── 7-day rows ────────────────────────────────────────────────────────────
  const days = w.forecast ?? [];
  // Scale every bar against the whole week so the rows are comparable to each other
  const weekLo = Math.min(...days.map(d => d.lo));
  const weekHi = Math.max(...days.map(d => d.hi));
  const span = Math.max(1, weekHi - weekLo);
  (document.getElementById('wc-forecast') as HTMLElement).innerHTML = days.map(d => `
    <div class="wc-fc-row">
      <span class="wc-fc-label">${d.day}</span>
      <span class="wc-fc-icon">${d.icon}</span>
      <span class="wc-fc-pop">${d.pop && d.pop >= 15 ? `${d.pop}%` : ''}</span>
      <span class="wc-fc-bar">
        <span class="wc-fc-fill" style="left:${((d.lo - weekLo) / span) * 100}%;right:${((weekHi - d.hi) / span) * 100}%"></span>
      </span>
      <span class="wc-fc-hi">${t(d.hi)}°</span>
    </div>`).join('');
}

/** A short heads-up above the fold, when there's something actually worth saying. */
function weatherAlert(w: NonNullable<typeof weatherCache>): { text: string; warn: boolean } | null {
  const soon = (w.hourly ?? []).slice(1, 13);
  const wet = soon.find(h => h.pop >= 60);
  if (wet) return { text: `☔ Rain likely around ${wet.label} — ${wet.pop}% chance`, warn: false };
  if ((w.uv ?? 0) >= 8) return { text: `🧴 UV index ${w.uv} — limit midday sun`, warn: true };
  if ((w.aqi ?? 0) > 80) return { text: `😷 Air quality is ${aqiBand(w.aqi!).text.toLowerCase()} (AQI ${w.aqi})`, warn: true };
  if ((w.windGust ?? 0) >= 50) return { text: `💨 Gusts up to ${w.windGust} km/h`, warn: true };
  return null;
}

function renderWeatherCard(w: NonNullable<typeof weatherCache>) {
  (document.getElementById('weather-icon') as HTMLElement).textContent = w.icon;
  (document.getElementById('wc-city') as HTMLElement).textContent = w.city;
  (document.getElementById('wc-condition') as HTMLElement).textContent = w.condition;
  (document.getElementById('wc-icon') as HTMLElement).textContent = w.icon;

  const mins = Math.floor((Date.now() - w.cachedAt) / 60000);
  (document.getElementById('wc-updated') as HTMLElement).textContent =
    mins < 1 ? 'just now' : `${mins}m ago`;

  const alertEl = document.getElementById('wc-alert') as HTMLElement;
  const alert = weatherAlert(w);
  alertEl.classList.toggle('hidden', !alert);
  alertEl.classList.toggle('is-warn', Boolean(alert?.warn));
  if (alert) alertEl.textContent = alert.text;

  applyWeatherUnit(w, currentTempUnit);
}

async function loadWeather(locationOverride = '', tempUnit: 'celsius' | 'fahrenheit' = 'celsius') {
  currentTempUnit = tempUnit;
  const w = await fetchWeather(locationOverride);
  if (!w) return;
  weatherCache = w;

  document.getElementById('weather-widget')?.classList.remove('hidden');
  renderWeatherCard(w);
}

function initWeatherWidget(locationOverride: string) {
  const widget = document.getElementById('weather-widget') as HTMLElement;
  const card = document.getElementById('weather-card') as HTMLElement;

  document.getElementById('btn-temp-unit')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    currentTempUnit = currentTempUnit === 'celsius' ? 'fahrenheit' : 'celsius';
    if (weatherCache) applyWeatherUnit(weatherCache, currentTempUnit);
    await saveSettings({ tempUnit: currentTempUnit });
  });

  // Force a refetch by expiring the cache the fetcher checks
  document.getElementById('btn-weather-refresh')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    btn.classList.add('is-spinning');
    if (weatherCache) await saveWeatherCache({ ...weatherCache, cachedAt: 0 });
    await loadWeather(locationOverride, currentTempUnit);
    btn.classList.remove('is-spinning');
  });

  widget.addEventListener('click', (e) => {
    e.stopPropagation();
    card.classList.toggle('hidden');
    // The "x minutes ago" line goes stale while the card sits closed
    if (!card.classList.contains('hidden') && weatherCache) renderWeatherCard(weatherCache);
  });
  document.addEventListener('click', () => card.classList.add('hidden'));
  card.addEventListener('click', e => e.stopPropagation());
}

// ─── World Clocks ─────────────────────────────────────────────────────────────

interface CityWeather { temp: number; unit: string; icon: string; condition: string }

// Cache city weather (30 min TTL) — keyed by city label
const cityTempCache = new Map<string, CityWeather & { fetchedAt: number }>();

async function fetchCityTemp(cityLabel: string): Promise<CityWeather | null> {
  const cached = cityTempCache.get(cityLabel);
  if (cached && Date.now() - cached.fetchedAt < 30 * 60 * 1000) return cached;
  try {
    const ac1 = new AbortController();
    setTimeout(() => ac1.abort(), 5000);
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityLabel)}&count=1&format=json`,
      { signal: ac1.signal },
    );
    const geoData = await geoRes.json();
    const loc = geoData.results?.[0];
    if (!loc) return null;

    const ac2 = new AbortController();
    setTimeout(() => ac2.abort(), 5000);
    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&current=temperature_2m,weather_code&temperature_unit=celsius`,
      { signal: ac2.signal },
    );
    const wxData = await wxRes.json();
    const temp = wxData.current?.temperature_2m;
    if (temp == null) return null;

    const { label, icon } = getCondition(wxData.current?.weather_code ?? -1);
    const out: CityWeather = { temp: Math.round(temp), unit: '°C', icon, condition: label };
    cityTempCache.set(cityLabel, { ...out, fetchedAt: Date.now() });
    return out;
  } catch { return null; }
}

const TZ_INDEX = new Map(TIMEZONES.map(e => [e.tz, e]));
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Wall-clock instant of `d` as seen in `tz`, expressed as a UTC timestamp. */
function zonedMs(tz: string, d: Date): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d).reduce<Record<string, string>>((a, x) => (a[x.type] = x.value, a), {});
  // Intl renders midnight as hour 24 in en-US; Date.UTC rolls that over correctly
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/** How far ahead (+) or behind (−) `tz` runs relative to the viewer's own zone. */
function tzDeltaLabel(tz: string, d: Date): string {
  const mins = Math.round((zonedMs(tz, d) - zonedMs(LOCAL_TZ, d)) / 60000);
  if (mins === 0) return 'same time';
  const sign = mins > 0 ? '+' : '−';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60), m = abs % 60;
  return `${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}h`;
}

/**
 * Rough working-hours read for the other city — the thing you actually want to know
 * before pinging someone. Green: fair game. Amber: edges of the day. Grey: asleep.
 */
function officeState(hour: number): { cls: string; text: string } {
  if (hour >= 9 && hour < 18) return { cls: 'is-open',  text: 'work hours' };
  if (hour >= 7 && hour < 22) return { cls: 'is-edge',  text: 'awake' };
  return { cls: 'is-night', text: 'asleep' };
}

let clockTimers: number[] = [];

function renderWorldClocks(clocks: WorldClock[]) {
  const bar = document.getElementById('world-clocks-bar') as HTMLElement;
  clockTimers.forEach(clearInterval);
  clockTimers = [];
  bar.innerHTML = '';

  clocks.forEach(({ label, timezone }) => {
    const entry = TZ_INDEX.get(timezone);
    const flag = entry ? countryFlag(entry.cc) : '🌐';

    const card = document.createElement('div');
    card.className = 'wcl-card';
    card.innerHTML = `
      <div class="wcl-head">
        <span class="wcl-flag">${flag}</span>
        <span class="wcl-city">${newsEscape(label)}</span>
        <span class="wcl-dot" title=""></span>
      </div>
      <div class="wcl-time">
        <span class="wcl-hm">--:--</span><span class="wcl-sec">00</span>
      </div>
      <div class="wcl-date">—</div>
      <div class="wcl-day"><span class="wcl-day-fill"></span><span class="wcl-day-now"></span></div>
      <div class="wcl-foot">
        <span class="wcl-chip wcl-offset">—</span>
        <span class="wcl-chip wcl-temp"><span class="wcl-wx">·</span><span class="wcl-deg">—</span></span>
      </div>`;
    bar.appendChild(card);

    const hm    = card.querySelector('.wcl-hm') as HTMLElement;
    const sec   = card.querySelector('.wcl-sec') as HTMLElement;
    const date  = card.querySelector('.wcl-date') as HTMLElement;
    const dot   = card.querySelector('.wcl-dot') as HTMLElement;
    const fill  = card.querySelector('.wcl-day-fill') as HTMLElement;
    const now   = card.querySelector('.wcl-day-now') as HTMLElement;
    const offEl = card.querySelector('.wcl-offset') as HTMLElement;

    const tick = () => {
      try {
        const d = new Date();
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone, hour12: false,
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          weekday: 'short', day: 'numeric', month: 'short',
        }).formatToParts(d).reduce<Record<string, string>>((a, x) => (a[x.type] = x.value, a), {});

        const hour = +parts.hour % 24;
        hm.textContent = `${String(hour).padStart(2, '0')}:${parts.minute}`;
        sec.textContent = parts.second;

        // Call out the date only when it differs from the viewer's own day
        const theirDay = new Date(zonedMs(timezone, d)).getUTCDate();
        const myDay = new Date(zonedMs(LOCAL_TZ, d)).getUTCDate();
        const shift = theirDay === myDay ? '' : (zonedMs(timezone, d) > zonedMs(LOCAL_TZ, d) ? ' · tomorrow' : ' · yesterday');
        date.textContent = `${parts.weekday} ${parts.day} ${parts.month}${shift}`;

        const frac = (hour * 60 + +parts.minute) / 1440;
        fill.style.width = `${frac * 100}%`;
        now.style.left = `${frac * 100}%`;

        const state = officeState(hour);
        dot.className = `wcl-dot ${state.cls}`;
        dot.title = `${label} — ${state.text}`;
        card.classList.toggle('is-asleep', state.cls === 'is-night');

        offEl.textContent = tzDeltaLabel(timezone, d);
      } catch {
        hm.textContent = '--:--';
      }
    };
    tick();
    clockTimers.push(window.setInterval(tick, 1000));

    const updateTemp = () => {
      fetchCityTemp(label).then((r) => {
        (card.querySelector('.wcl-wx') as HTMLElement).textContent = r ? r.icon : '·';
        (card.querySelector('.wcl-deg') as HTMLElement).textContent = r ? `${r.temp}${r.unit}` : '—';
        if (r) (card.querySelector('.wcl-temp') as HTMLElement).title = r.condition;
      });
    };
    updateTemp();
    clockTimers.push(window.setInterval(updateTemp, 30 * 60 * 1000));
  });
}

// ─── Focus ────────────────────────────────────────────────────────────────────

async function initFocus() {
  const input = document.getElementById('focus-input') as HTMLInputElement;
  const daily = await getDaily();
  if (daily?.date === todayString() && daily.focus) input.value = daily.focus;
  input.addEventListener('input', () => saveDaily({ date: todayString(), focus: input.value }));
}

// ─── Todos ────────────────────────────────────────────────────────────────────

let todos: Todo[] = [];
let todoFilter: 'today' | 'active' | 'all' | 'done' = 'today';
let todoSort: 'manual' | 'priority' | 'due' = 'manual';
/** The task the timer is currently pointed at. Null = whatever is at the top. */
let activeTaskId: string | null = null;

const PRI_RANK = { high: 0, medium: 1, none: 2 } as const;

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** A task counts as "today" if it was starred by hand or is due today or earlier. */
function isToday(t: Todo): boolean {
  return Boolean(t.today) || (Boolean(t.dueDate) && t.dueDate! <= todayString());
}

function inFilter(t: Todo): boolean {
  if (todoFilter === 'done') return t.done;
  if (todoFilter === 'all') return true;
  if (t.done) return false;
  return todoFilter === 'active' || isToday(t);
}

/**
 * Quick-add tokens, so the whole task can be typed in one line:
 * `!high` / `!med`, `@today` / `@tomorrow` / `@fri` / `@2026-09-01`, `~3` rounds.
 */
function parseQuickAdd(raw: string): { text: string; priority?: 'high' | 'medium'; dueDate?: string; estPomos?: number } {
  let text = raw;
  let priority: 'high' | 'medium' | undefined;
  let dueDate: string | undefined;
  let estPomos: number | undefined;

  text = text.replace(/(?:^|\s)!(high|h|med|medium|m)\b/i, (_m, p: string) => {
    priority = /^(h|high)$/i.test(p) ? 'high' : 'medium';
    return ' ';
  });

  text = text.replace(/(?:^|\s)~(\d{1,2})\b/, (_m, n: string) => {
    estPomos = Math.min(20, Number(n));
    return ' ';
  });

  text = text.replace(/(?:^|\s)@(\d{4}-\d{2}-\d{2}|[a-z]+)/i, (m, tok: string) => {
    const d = parseDayToken(tok);
    if (!d) return m; // leave an unrecognised @word alone — it may be part of the text
    dueDate = d;
    return ' ';
  });

  return { text: text.replace(/\s+/g, ' ').trim(), priority, dueDate, estPomos };
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Resolves `today` / `tomorrow` / a weekday name / an ISO date to YYYY-MM-DD. */
function parseDayToken(tok: string): string | undefined {
  const t = tok.toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  const iso = (d: Date) => {
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  };
  const now = new Date();
  if (t === 'today') return iso(now);
  if (t === 'tomorrow' || t === 'tmr') return iso(new Date(now.getTime() + 86400000));

  const idx = WEEKDAYS.findIndex(w => w === t || w.slice(0, 3) === t);
  if (idx === -1) return undefined;
  // Always the *next* occurrence, so "@mon" on a Monday means a week out
  const delta = ((idx - now.getDay() + 7) % 7) || 7;
  return iso(new Date(now.getTime() + delta * 86400000));
}

function dueDateLabel(dateStr: string): string {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00'); d.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function subProgress(t: Todo): { done: number; total: number } {
  const subs = t.subtasks ?? [];
  return { done: subs.filter(s => s.done).length, total: subs.length };
}

function persist() {
  saveTodos(todos);
}

/** One redraw path for every surface that shows tasks. */
function refreshTodos() {
  persist();
  renderTodos();
  renderFmTodos();
  updatePomoTask();
}

function svgIcon(path: string, size = 11): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

const ICON_STAR  = '<path d="M12 2l2.9 6.3 6.6.7-4.9 4.5 1.4 6.5L12 16.7 6 20l1.4-6.5L2.5 9l6.6-.7z"/>';
const ICON_PLUS  = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
const ICON_CROSS = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
const ICON_FOCUS = '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>';
const ICON_TOMATO = '<circle cx="12" cy="13" r="7"/><line x1="12" y1="6" x2="12" y2="3"/><path d="M8 3h8"/>';

/**
 * Swaps a label for an input; Enter or blur commits, Escape cancels. `revert` puts
 * the surface back the way it was — tasks and links each redraw differently.
 */
function startInlineEdit(
  span: HTMLElement,
  current: string,
  commit: (next: string) => void,
  revert: () => void = renderTodos,
) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-edit-input';
  input.value = current;
  input.maxLength = 120;
  span.replaceWith(input);
  input.focus();
  input.setSelectionRange(current.length, current.length);

  let settled = false;
  const finish = (save: boolean) => {
    if (settled) return;
    settled = true;
    const next = input.value.trim();
    if (save && next && next !== current) commit(next);
    else revert();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function buildSubtaskRow(todo: Todo, sub: Subtask): HTMLLIElement {
  const li = document.createElement('li');
  li.className = `todo-sub${sub.done ? ' done' : ''}`;

  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.className = 'todo-sub-cb'; cb.checked = sub.done;
  cb.addEventListener('change', () => {
    sub.done = cb.checked;
    // Finishing the last subtask finishes the parent — that is the whole point of them
    const { done, total } = subProgress(todo);
    if (total > 0 && done === total && !todo.done) { todo.done = true; todo.doneAt = Date.now(); }
    else if (todo.done && done < total) { todo.done = false; delete todo.doneAt; }
    refreshTodos();
  });

  const span = document.createElement('span');
  span.className = 'todo-sub-text';
  span.textContent = sub.text;
  span.title = 'Click to edit';
  span.addEventListener('click', () => startInlineEdit(span, sub.text, (next) => {
    sub.text = next;
    refreshTodos();
  }));

  const del = document.createElement('button');
  del.className = 'todo-sub-del'; del.title = 'Remove subtask';
  del.innerHTML = svgIcon(ICON_CROSS, 9);
  del.addEventListener('click', () => {
    todo.subtasks = (todo.subtasks ?? []).filter(s => s.id !== sub.id);
    refreshTodos();
  });

  li.append(cb, span, del);
  return li;
}

function buildTodoItem(todo: Todo): HTMLLIElement {
  const li = document.createElement('li');
  const pri = todo.priority ?? 'none';
  li.className = `todo-item${todo.done ? ' done' : ''}${pri !== 'none' ? ` pri-${pri}` : ''}`
    + `${todo.id === renderActiveId ? ' is-active' : ''}`;
  li.dataset['id'] = todo.id;

  // Manual order is the only order that can meaningfully be dragged
  if (todoSort === 'manual' && todoFilter !== 'done') {
    li.draggable = true;
    li.addEventListener('dragstart', (e) => {
      dragTodoId = todo.id;
      li.classList.add('dragging');
      e.dataTransfer?.setData('text/plain', todo.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      dragTodoId = null;
      li.classList.remove('dragging');
      document.querySelectorAll('.todo-item.drop-before,.todo-item.drop-after')
        .forEach(el => el.classList.remove('drop-before', 'drop-after'));
    });
    li.addEventListener('dragover', (e) => {
      if (!dragTodoId || dragTodoId === todo.id) return;
      e.preventDefault();
      const box = li.getBoundingClientRect();
      const after = e.clientY > box.top + box.height / 2;
      li.classList.toggle('drop-after', after);
      li.classList.toggle('drop-before', !after);
    });
    li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const after = li.classList.contains('drop-after');
      li.classList.remove('drop-before', 'drop-after');
      moveTodo(dragTodoId, todo.id, after);
    });
  }

  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.className = 'todo-cb'; cb.checked = todo.done;
  cb.addEventListener('change', () => {
    todo.done = cb.checked;
    if (todo.done) todo.doneAt = Date.now(); else delete todo.doneAt;
    refreshTodos();
  });

  const body = document.createElement('div');
  body.className = 'todo-body';

  const row = document.createElement('div');
  row.className = 'todo-text-row';
  const span = document.createElement('span');
  span.className = 'todo-text';
  span.textContent = todo.text;
  span.title = 'Click to edit';
  span.addEventListener('click', () => startInlineEdit(span, todo.text, (next) => {
    todo.text = next;
    refreshTodos();
  }));
  row.appendChild(span);
  body.appendChild(row);

  // ── Meta chips ──
  const meta = document.createElement('div');
  meta.className = 'todo-meta';

  if (pri !== 'none') {
    const b = document.createElement('span');
    b.className = 'todo-pri-badge';
    b.textContent = pri === 'high' ? 'High' : 'Medium';
    meta.appendChild(b);
  }

  if (todo.dueDate) {
    const today = todayString();
    const overdue = !todo.done && todo.dueDate < today;
    const chip = document.createElement('span');
    chip.className = `todo-due-chip${overdue ? ' overdue' : todo.dueDate === today ? ' today' : ''}`;
    const d = new Date(todo.dueDate + 'T00:00:00');
    chip.textContent = overdue ? 'Overdue'
      : todo.dueDate === today ? 'Today'
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    meta.appendChild(chip);
  }

  const { done: sDone, total: sTotal } = subProgress(todo);
  if (sTotal > 0) {
    const chip = document.createElement('span');
    chip.className = `todo-sub-chip${sDone === sTotal ? ' complete' : ''}`;
    chip.textContent = `${sDone}/${sTotal}`;
    chip.title = 'Subtasks completed';
    meta.appendChild(chip);
  }

  const est = todo.estPomos ?? 0;
  const donePomos = todo.donePomos ?? 0;
  if (est > 0 || donePomos > 0) {
    const chip = document.createElement('span');
    chip.className = `todo-pomo-chip${est > 0 && donePomos >= est ? ' complete' : ''}`;
    chip.innerHTML = `${svgIcon(ICON_TOMATO, 9)}${est > 0 ? `${donePomos}/${est}` : String(donePomos)}`;
    chip.title = 'Focus rounds spent on this task';
    meta.appendChild(chip);
  }

  if (meta.childElementCount > 0) body.appendChild(meta);

  // ── Subtasks ──
  if (sTotal > 0) {
    const ul = document.createElement('ul');
    ul.className = 'todo-subs';
    todo.subtasks!.forEach(s => ul.appendChild(buildSubtaskRow(todo, s)));
    body.appendChild(ul);
  }

  // Inline subtask composer, opened by the + action
  const subForm = document.createElement('form');
  subForm.className = 'todo-sub-form hidden';
  const subInput = document.createElement('input');
  subInput.type = 'text'; subInput.placeholder = 'Subtask…'; subInput.maxLength = 100;
  subForm.appendChild(subInput);
  subForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = subInput.value.trim();
    if (!text) return;
    todo.subtasks = [...(todo.subtasks ?? []), { id: uid(), text, done: false }];
    refreshTodos();
  });
  subInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') subForm.classList.add('hidden');
  });
  body.appendChild(subForm);

  // ── Row actions ──
  const actions = document.createElement('div');
  actions.className = 'todo-item-actions';

  if (!todo.done) {
    const star = document.createElement('button');
    star.className = `todo-act todo-star${todo.today ? ' on' : ''}`;
    star.title = todo.today ? 'Remove from Today' : 'Add to Today';
    star.innerHTML = svgIcon(ICON_STAR);
    star.addEventListener('click', () => {
      todo.today = !todo.today;
      refreshTodos();
    });

    const addSub = document.createElement('button');
    addSub.className = 'todo-act';
    addSub.title = 'Add a subtask';
    addSub.innerHTML = svgIcon(ICON_PLUS);
    addSub.addEventListener('click', () => {
      subForm.classList.remove('hidden');
      subInput.focus();
    });

    const focusBtn = document.createElement('button');
    focusBtn.className = 'todo-act todo-act-focus';
    focusBtn.title = 'Focus on this task';
    focusBtn.innerHTML = svgIcon(ICON_FOCUS);
    focusBtn.addEventListener('click', () => {
      activeTaskId = todo.id;
      document.getElementById('pomodoro-panel')?.classList.add('hidden');
      enterFocusMode();
    });

    actions.append(star, addSub, focusBtn);
  }

  const del = document.createElement('button');
  del.className = 'todo-act todo-act-del'; del.title = 'Delete';
  del.innerHTML = svgIcon(ICON_CROSS);
  del.addEventListener('click', () => {
    todos = todos.filter(t => t.id !== todo.id);
    if (activeTaskId === todo.id) activeTaskId = null;
    refreshTodos();
  });
  actions.appendChild(del);

  li.append(cb, body, actions);
  return li;
}

let dragTodoId: string | null = null;

/** Reorders the backing array, since the rendered list is only a view of it. */
function moveTodo(fromId: string | null, toId: string, after: boolean) {
  if (!fromId || fromId === toId) return;
  const from = todos.findIndex(t => t.id === fromId);
  if (from === -1) return;
  const [moved] = todos.splice(from, 1);
  let to = todos.findIndex(t => t.id === toId);
  if (to === -1) { todos.splice(from, 0, moved); return; }
  todos.splice(after ? to + 1 : to, 0, moved);
  refreshTodos();
}

function sortedVisible(): Todo[] {
  const visible = todos.filter(inFilter);
  if (todoSort === 'priority') {
    return [...visible].sort((a, b) => PRI_RANK[a.priority ?? 'none'] - PRI_RANK[b.priority ?? 'none']);
  }
  if (todoSort === 'due') {
    // Dated tasks first, in date order; undated ones fall to the bottom
    return [...visible].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  }
  return visible;
}

/**
 * The task the timer is pointed at, resolved once per render. It may be an
 * implicit pick (the top open task), which `activeTaskId` alone would not show.
 */
let renderActiveId: string | undefined;

function renderTodos() {
  const list = document.getElementById('todo-list') as HTMLUListElement;
  if (!list) return;
  list.innerHTML = '';
  renderActiveId = activeTask()?.id;
  updateLauncherBadge();

  // ── Header count + progress ──
  // Progress is scoped to what the current filter is about, so the Today tab
  // reports progress on today rather than on the whole backlog.
  const scope = todoFilter === 'today' ? todos.filter(t => isToday(t) || (t.done && t.today)) : todos;
  const doneCount = scope.filter(t => t.done).length;
  const activeCount = scope.length - doneCount;

  const countEl = document.getElementById('todo-count');
  if (countEl) countEl.textContent = activeCount > 0 ? String(activeCount) : '';

  const bar = document.getElementById('todo-progress-bar') as HTMLElement | null;
  if (bar) bar.style.width = (scope.length ? Math.round((doneCount / scope.length) * 100) : 0) + '%';

  const visible = sortedVisible();
  if (visible.length === 0) {
    const empty: Record<string, string> = {
      today:  'Nothing scheduled for today.<br>Star a task or give it a due date.',
      active: 'All clear! Add a task below',
      done:   'No completed tasks yet',
      all:    'No tasks yet — add one below',
    };
    list.innerHTML = `<li class="todo-empty">${empty[todoFilter]}</li>`;
    return;
  }

  // Manual order stays flat so drag targets line up with the array; the other
  // sorts get section headers, which is where headers actually help.
  if (todoSort === 'manual') {
    visible.forEach(t => list.appendChild(buildTodoItem(t)));
    return;
  }

  const groups = new Map<string, Todo[]>();
  visible.forEach(t => {
    const key = todoSort === 'priority'
      ? (t.priority === 'high' ? 'High priority' : t.priority === 'medium' ? 'Medium priority' : 'No priority')
      : (t.dueDate ? dueDateLabel(t.dueDate) : 'No due date');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  });

  groups.forEach((items, key) => {
    const header = document.createElement('li');
    header.className = 'todo-section-header';
    header.textContent = key;
    list.appendChild(header);
    items.forEach(t => list.appendChild(buildTodoItem(t)));
  });
}

/** Collapsed = a glass chip; expanded = the full panel. */
let todosCollapsed = false;
/** Mirrors settings.showTodos — when off, neither form is shown. */
let todosWidgetOn = true;

/** The chip carries the open count, so collapsing does not hide the signal. */
function updateLauncherBadge() {
  const badge = document.getElementById('todos-launcher-count');
  if (!badge) return;
  const open = todos.filter(t => !t.done && isToday(t)).length;
  badge.textContent = open > 0 ? String(open) : '';
}

function applyTodosCollapsed() {
  // Nothing to show either way when the widget is switched off in settings
  if (!todosWidgetOn) return;
  document.getElementById('todos-panel')?.classList.toggle('hidden', todosCollapsed);
  document.getElementById('btn-todos-launcher')?.classList.toggle('hidden', !todosCollapsed);
  updateLauncherBadge();
  // A collapsed task list has nowhere to anchor the timer panel
  if (todosCollapsed) document.getElementById('pomodoro-panel')?.classList.add('hidden');
}

async function setTodosCollapsed(next: boolean) {
  todosCollapsed = next;
  applyTodosCollapsed();
  await saveSettings({ todosCollapsed: next });
}

async function initTodos() {
  todos = await getTodos();
  const s = await getSettings();
  todoSort = s.todoSort ?? 'manual';
  todosCollapsed = s.todosCollapsed ?? false;
  syncTodoMenu();
  renderTodos();
  applyTodosCollapsed();

  document.getElementById('btn-todos-collapse')?.addEventListener('click', () => void setTodosCollapsed(true));
  document.getElementById('btn-todos-launcher')?.addEventListener('click', () => void setTodosCollapsed(false));

  // Filter tabs
  document.querySelectorAll<HTMLButtonElement>('.todo-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      todoFilter = btn.dataset['filter'] as typeof todoFilter;
      document.querySelectorAll('.todo-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTodos();
    });
  });

  // ── Options menu ──
  const menu = document.getElementById('todo-menu') as HTMLElement;
  document.getElementById('btn-todo-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target as Node)) menu.classList.add('hidden');
  });

  menu.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach(btn => {
    btn.addEventListener('click', async () => {
      todoSort = btn.dataset['sort'] as typeof todoSort;
      syncTodoMenu();
      renderTodos();
      menu.classList.add('hidden');
      await saveSettings({ todoSort });
    });
  });

  document.getElementById('btn-clear-done')?.addEventListener('click', () => {
    todos = todos.filter(t => !t.done);
    menu.classList.add('hidden');
    refreshTodos();
  });

  document.getElementById('btn-clear-today')?.addEventListener('click', () => {
    // Only unstars — a task with a due date of today stays where it belongs
    todos.forEach(t => { delete t.today; });
    menu.classList.add('hidden');
    refreshTodos();
  });

  // ── Add form ──
  const addCard = document.getElementById('todo-add-card')!;
  let selectedPri: 'none' | 'medium' | 'high' = 'none';
  document.querySelectorAll<HTMLButtonElement>('.todo-pri-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedPri = chip.dataset['pri'] as typeof selectedPri;
      document.querySelectorAll('.todo-pri-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  // Planned focus rounds
  let estPomos = 0;
  const estCount = document.getElementById('todo-est-count')!;
  const setEst = (n: number) => {
    estPomos = Math.max(0, Math.min(20, n));
    estCount.textContent = String(estPomos);
    estCount.parentElement?.parentElement?.classList.toggle('has-est', estPomos > 0);
  };
  document.getElementById('todo-est-plus')?.addEventListener('click', () => setEst(estPomos + 1));
  document.getElementById('todo-est-minus')?.addEventListener('click', () => setEst(estPomos - 1));

  // Date picker — input stays in DOM always so picker anchors correctly
  const dateBtn = document.getElementById('todo-date-btn') as HTMLButtonElement;
  const dateLabel = document.getElementById('todo-date-label')!;
  const dueDateInput = document.getElementById('todo-due-date') as HTMLInputElement;
  dateBtn?.addEventListener('click', () => dueDateInput.showPicker?.());
  dueDateInput?.addEventListener('change', () => {
    const hasDate = !!dueDateInput.value;
    dateBtn?.classList.toggle('has-date', hasDate);
    dateLabel.textContent = hasDate
      ? new Date(dueDateInput.value + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : 'Set date';
  });

  const input = document.getElementById('todo-input') as HTMLInputElement;
  input?.addEventListener('focus', () => addCard.classList.add('expanded'));
  input?.addEventListener('blur', () => { if (!input.value) addCard.classList.remove('expanded'); });

  const form = document.getElementById('todo-form') as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const parsed = parseQuickAdd(input.value);
    if (!parsed.text) return;

    // Typed tokens win over the chips, because they were typed more recently
    const priority = parsed.priority ?? (selectedPri === 'none' ? undefined : selectedPri);
    const dueDate = parsed.dueDate ?? (dueDateInput?.value || undefined);
    const est = parsed.estPomos ?? (estPomos || undefined);

    todos.push({
      id: uid(),
      text: parsed.text,
      done: false,
      priority: priority ?? 'none',
      dueDate,
      estPomos: est,
      donePomos: 0,
      // Anything added from the Today tab belongs to today
      today: todoFilter === 'today' && !dueDate ? true : undefined,
      createdAt: Date.now(),
    });

    // Reset the composer
    selectedPri = 'none';
    document.querySelectorAll('.todo-pri-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.todo-pri-chip.chip-none')?.classList.add('active');
    setEst(0);
    if (dueDateInput) dueDateInput.value = '';
    dateBtn?.classList.remove('has-date');
    dateLabel.textContent = 'Set date';
    addCard.classList.remove('expanded');
    input.value = '';
    refreshTodos();
  });
}

function syncTodoMenu() {
  document.querySelectorAll<HTMLButtonElement>('#todo-menu [data-sort]').forEach(b =>
    b.classList.toggle('is-on', b.dataset['sort'] === todoSort));
}


// ─── Quick Links ──────────────────────────────────────────────────────────────

let links: QuickLink[] = [];
let folders: QuickLinkFolder[] = [];
const collapsedFolders = new Set<string>();
let linksSearchQuery = '';
let linksView: 'list' | 'grid' = 'list';
let linksSort: 'manual' | 'frequent' | 'alpha' = 'manual';
/** Index into the flat list of currently rendered links, for ↑/↓ in search. */
let linksCursor = -1;
let dragLinkId: string | null = null;
/** The link currently open in the form; null means the form is adding a new one. */
let editingLinkId: string | null = null;

function faviconUrl(url: string): string {
  try { return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`; }
  catch { return ''; }
}

function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

/** Accepts what people actually paste — `github.com/x` becomes a real URL. */
function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  // Anything else is treated as a bare host/path rather than a search term
  return `https://${s.replace(/^\/+/, '')}`;
}

/** A readable name guessed from the URL, so the name field can be left empty. */
function guessLabel(url: string): string {
  const host = linkHost(url);
  const name = host.split('.')[0] ?? host;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * A stable colour per domain for the fallback tile, so a site without a favicon
 * still looks deliberate and stays recognisable between sessions.
 */
function domainHue(url: string): number {
  const host = linkHost(url);
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) % 360;
  return h;
}

let linksToastTimer: ReturnType<typeof setTimeout>;

/** Undo is optional — a plain confirmation shows no button rather than a dead one. */
function linksToast(text: string, undo?: () => void) {
  const toast = document.getElementById('links-toast') as HTMLElement | null;
  const textEl = document.getElementById('links-toast-text');
  const btn = document.getElementById('links-toast-undo');
  if (!toast || !textEl || !btn) return;
  textEl.textContent = text;
  toast.classList.remove('hidden');
  clearTimeout(linksToastTimer);

  // Replace the button so a previous undo handler cannot fire against stale state
  const fresh = btn.cloneNode(true) as HTMLElement;
  btn.replaceWith(fresh);
  fresh.classList.toggle('hidden', !undo);
  if (undo) {
    fresh.addEventListener('click', () => {
      clearTimeout(linksToastTimer);
      toast.classList.add('hidden');
      undo();
    });
  }
  linksToastTimer = setTimeout(() => toast.classList.add('hidden'), 6000);
}

function persistLinks() {
  saveLinks(links);
}

function deleteLink(link: QuickLink) {
  const idx = links.findIndex(l => l.id === link.id);
  if (idx === -1) return;
  links.splice(idx, 1);
  persistLinks();
  renderLinks();
  linksToast(`Removed “${link.label}”`, () => {
    links.splice(Math.min(idx, links.length), 0, link);
    persistLinks();
    renderLinks();
  });
}

/** Counts a visit so "Most used" ordering reflects real behaviour. */
function recordVisit(link: QuickLink) {
  link.visits = (link.visits ?? 0) + 1;
  link.lastVisit = Date.now();
  persistLinks();
  if (linksSort === 'frequent') renderLinks();
}

function sortLinks(list: QuickLink[]): QuickLink[] {
  if (linksSort === 'alpha') {
    return [...list].sort((a, b) => a.label.localeCompare(b.label));
  }
  if (linksSort === 'frequent') {
    // Ties fall back to most recently opened, then to manual order
    return [...list].sort((a, b) =>
      (b.visits ?? 0) - (a.visits ?? 0) || (b.lastVisit ?? 0) - (a.lastVisit ?? 0));
  }
  return list;
}

function buildLinkItem(link: QuickLink): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'link-item';
  li.dataset['id'] = link.id;

  const a = document.createElement('a');
  a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.title = link.url;
  a.addEventListener('click', () => recordVisit(link));

  // Favicon with a coloured letter tile behind it, revealed if the icon fails
  const iconWrap = document.createElement('span');
  iconWrap.className = 'link-icon';
  iconWrap.style.setProperty('--link-hue', String(domainHue(link.url)));
  iconWrap.textContent = (link.label.trim()[0] ?? '?').toUpperCase();
  const favicon = document.createElement('img');
  favicon.src = faviconUrl(link.url); favicon.alt = ''; favicon.loading = 'lazy';
  favicon.onerror = () => favicon.remove();
  iconWrap.appendChild(favicon);

  const labelSpan = document.createElement('span');
  labelSpan.className = 'link-item-label';
  labelSpan.textContent = link.label;

  a.append(iconWrap, labelSpan);

  if (linksView === 'list') {
    const host = document.createElement('span');
    host.className = 'link-item-host';
    host.textContent = linkHost(link.url);
    labelSpan.after(host);
  }

  // Drag to reorder — manual order is the only order that can be rearranged
  if (linksSort === 'manual' && !linksSearchQuery) {
    li.draggable = true;
    li.addEventListener('dragstart', (e) => {
      dragLinkId = link.id;
      li.classList.add('dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer?.setData('text/plain', link.id);
    });
    li.addEventListener('dragend', () => {
      dragLinkId = null;
      li.classList.remove('dragging');
      document.querySelectorAll('.link-item.drop-before,.link-item.drop-after,.link-folder-header.drop-into')
        .forEach(el => el.classList.remove('drop-before', 'drop-after', 'drop-into'));
    });
    li.addEventListener('dragover', (e) => {
      if (!dragLinkId || dragLinkId === link.id) return;
      e.preventDefault();
      const box = li.getBoundingClientRect();
      const after = linksView === 'grid'
        ? e.clientX > box.left + box.width / 2
        : e.clientY > box.top + box.height / 2;
      li.classList.toggle('drop-after', after);
      li.classList.toggle('drop-before', !after);
    });
    li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const after = li.classList.contains('drop-after');
      li.classList.remove('drop-before', 'drop-after');
      moveLink(dragLinkId, link.id, after);
    });
  }

  const actions = document.createElement('div');
  actions.className = 'link-actions';

  const edit = document.createElement('button');
  edit.className = 'link-act'; edit.title = 'Edit';
  edit.innerHTML = svgIcon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>', 11);
  edit.addEventListener('click', (e) => { e.preventDefault(); openLinkForm(link); });

  const del = document.createElement('button');
  del.className = 'link-act link-act-del'; del.title = 'Remove';
  del.innerHTML = svgIcon(ICON_CROSS, 11);
  del.addEventListener('click', (e) => { e.preventDefault(); deleteLink(link); });

  actions.append(edit, del);
  li.append(a, actions);
  return li;
}

/** Reorders the backing array; the rendered list is only a view of it. */
function moveLink(fromId: string | null, toId: string, after: boolean) {
  if (!fromId || fromId === toId) return;
  const from = links.findIndex(l => l.id === fromId);
  const target = links.find(l => l.id === toId);
  if (from === -1 || !target) return;
  const [moved] = links.splice(from, 1);
  // Dropping onto a link in another folder moves it into that folder
  moved.folderId = target.folderId;
  const to = links.findIndex(l => l.id === toId);
  links.splice(after ? to + 1 : to, 0, moved);
  persistLinks();
  renderLinks();
}

/** Drops a dragged link into a folder header (or into the ungrouped area). */
function dropIntoFolder(folderId: string | undefined) {
  if (!dragLinkId) return;
  const link = links.find(l => l.id === dragLinkId);
  if (!link || link.folderId === folderId) return;
  link.folderId = folderId;
  persistLinks();
  renderLinks();
}

function buildFolderHeader(folder: QuickLinkFolder, count: number): HTMLLIElement {
  const collapsed = collapsedFolders.has(folder.id);
  const headerLi = document.createElement('li');
  headerLi.className = 'link-folder-header';

  const toggle = document.createElement('button');
  toggle.className = 'link-folder-toggle';
  toggle.innerHTML = `
    <svg class="folder-icon" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/>
    </svg>
    <span class="link-folder-label"></span>
    <span class="link-folder-count">${count}</span>
    <svg class="link-folder-chevron${collapsed ? ' collapsed' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
  `;
  // Set as text so a folder name can never inject markup
  const labelEl = toggle.querySelector('.link-folder-label') as HTMLElement;
  labelEl.textContent = folder.label;
  toggle.addEventListener('click', () => {
    if (collapsedFolders.has(folder.id)) collapsedFolders.delete(folder.id);
    else collapsedFolders.add(folder.id);
    renderLinks();
  });

  // Dragging a link onto the header files it under that folder
  headerLi.addEventListener('dragover', (e) => {
    if (!dragLinkId) return;
    e.preventDefault();
    headerLi.classList.add('drop-into');
  });
  headerLi.addEventListener('dragleave', () => headerLi.classList.remove('drop-into'));
  headerLi.addEventListener('drop', (e) => {
    e.preventDefault();
    headerLi.classList.remove('drop-into');
    dropIntoFolder(folder.id);
  });

  const actions = document.createElement('div');
  actions.className = 'link-actions';

  const openAll = document.createElement('button');
  openAll.className = 'link-act'; openAll.title = `Open all ${count} in new tabs`;
  openAll.innerHTML = svgIcon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 11);
  openAll.addEventListener('click', () => {
    const inFolder = links.filter(l => l.folderId === folder.id);
    // Chrome pops up a "allow multiple windows" prompt past a handful, so cap it
    if (inFolder.length > 12 && !confirm(`Open ${inFolder.length} tabs?`)) return;
    inFolder.forEach(l => { recordVisit(l); window.open(l.url, '_blank', 'noopener'); });
  });

  const rename = document.createElement('button');
  rename.className = 'link-act'; rename.title = 'Rename folder';
  rename.innerHTML = svgIcon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>', 11);
  rename.addEventListener('click', () => startInlineEdit(labelEl, folder.label, (next) => {
    folder.label = next;
    saveFolders(folders); renderLinks(); syncFolderSelect();
  }, renderLinks));

  const delFolder = document.createElement('button');
  delFolder.className = 'link-act link-act-del'; delFolder.title = 'Delete folder';
  delFolder.innerHTML = svgIcon(ICON_CROSS, 11);
  delFolder.addEventListener('click', () => {
    const removed = folder;
    const affected = links.filter(l => l.folderId === folder.id).map(l => l.id);
    links = links.map(l => l.folderId === folder.id ? { ...l, folderId: undefined } : l);
    folders = folders.filter(f => f.id !== folder.id);
    saveFolders(folders); persistLinks(); renderLinks(); syncFolderSelect();
    linksToast(`Deleted “${removed.label}”`, () => {
      folders.push(removed);
      links = links.map(l => affected.includes(l.id) ? { ...l, folderId: removed.id } : l);
      saveFolders(folders); persistLinks(); renderLinks(); syncFolderSelect();
    });
  });

  actions.append(openAll, rename, delFolder);
  headerLi.append(toggle, actions);
  return headerLi;
}

function renderLinks() {
  const list = document.getElementById('links-list') as HTMLUListElement;
  if (!list) return;
  list.innerHTML = '';
  list.classList.toggle('is-grid', linksView === 'grid');

  const q = linksSearchQuery.toLowerCase().trim();
  document.getElementById('links-search-clear')?.classList.toggle('hidden', !q);

  if (q) {
    // Search ignores folder structure — a flat, ranked list of everything matching
    const scored = links
      .map(l => ({ l, score: matchScore(l, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.l.visits ?? 0) - (a.l.visits ?? 0));

    if (scored.length === 0) {
      list.innerHTML = `<li class="links-empty">No links match “${escapeHtml(q)}”</li>`;
      return;
    }
    scored.forEach(({ l }) => list.appendChild(buildLinkItem(l)));
    highlightCursor();
    return;
  }

  const ungrouped = sortLinks(links.filter(l => !l.folderId));
  if (links.length === 0) {
    list.innerHTML = '<li class="links-empty">No links yet — add one below,<br>or import your bookmarks</li>';
    return;
  }

  ungrouped.forEach(link => list.appendChild(buildLinkItem(link)));

  folders.forEach(folder => {
    const folderLinks = sortLinks(links.filter(l => l.folderId === folder.id));
    list.appendChild(buildFolderHeader(folder, folderLinks.length));
    if (collapsedFolders.has(folder.id)) return;
    folderLinks.forEach(link => {
      const li = buildLinkItem(link);
      li.classList.add('link-in-folder');
      list.appendChild(li);
    });
  });

  highlightCursor();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/**
 * Ranks a search hit: a label that starts with the query beats one that merely
 * contains it, and both beat a URL-only match.
 */
function matchScore(l: QuickLink, q: string): number {
  const label = l.label.toLowerCase();
  const host = linkHost(l.url).toLowerCase();
  if (label.startsWith(q)) return 100;
  if (host.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (host.includes(q)) return 40;
  if (l.url.toLowerCase().includes(q)) return 20;
  return 0;
}

function visibleLinkEls(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('#links-list .link-item'));
}

function highlightCursor() {
  const els = visibleLinkEls();
  els.forEach((el, i) => el.classList.toggle('is-cursor', i === linksCursor));
  if (linksCursor >= 0) els[linksCursor]?.scrollIntoView({ block: 'nearest' });
}

function moveCursor(delta: number) {
  const count = visibleLinkEls().length;
  if (!count) return;
  linksCursor = linksCursor < 0
    ? (delta > 0 ? 0 : count - 1)
    : (linksCursor + delta + count) % count;
  highlightCursor();
}

function syncFolderSelect() {
  const sel = document.getElementById('link-folder-sel') as HTMLSelectElement;
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">No folder</option>';
  folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id; opt.textContent = f.label;
    sel.appendChild(opt);
  });
  sel.value = prev;
}

function syncLinksMenu() {
  document.querySelectorAll<HTMLButtonElement>('#links-menu [data-lsort]').forEach(b =>
    b.classList.toggle('is-on', b.dataset['lsort'] === linksSort));
  document.querySelectorAll<HTMLButtonElement>('#links-view-seg .lv-btn').forEach(b =>
    b.classList.toggle('active', b.dataset['view'] === linksView));
}

/** Opens the composer, either empty or loaded with an existing link. */
function openLinkForm(link?: QuickLink) {
  const form = document.getElementById('link-form') as HTMLFormElement;
  const toggle = document.getElementById('btn-links-add-toggle') as HTMLElement;
  const title = document.getElementById('link-form-title') as HTMLElement;
  const submit = document.getElementById('link-form-submit') as HTMLElement;
  const labelInput = document.getElementById('link-label') as HTMLInputElement;
  const urlInput = document.getElementById('link-url') as HTMLInputElement;
  const folderSel = document.getElementById('link-folder-sel') as HTMLSelectElement;

  editingLinkId = link?.id ?? null;
  title.textContent = link ? 'Edit link' : 'New link';
  submit.textContent = link ? 'Save' : 'Add link';
  urlInput.value = link?.url ?? '';
  labelInput.value = link?.label ?? '';
  syncFolderSelect();
  folderSel.value = link?.folderId ?? '';

  form.classList.remove('hidden');
  toggle.classList.add('hidden');
  (link ? labelInput : urlInput).focus();
}

function closeLinkForm() {
  editingLinkId = null;
  document.getElementById('link-form')?.classList.add('hidden');
  document.getElementById('btn-links-add-toggle')?.classList.remove('hidden');
  (document.getElementById('link-label') as HTMLInputElement).value = '';
  (document.getElementById('link-url') as HTMLInputElement).value = '';
  const sel = document.getElementById('link-folder-sel') as HTMLSelectElement | null;
  if (sel) sel.value = '';
}

async function initLinks() {
  [links, folders] = await Promise.all([getLinks(), getFolders()]);
  const s = await getSettings();
  linksView = s.linksView ?? 'list';
  linksSort = s.linksSort ?? 'manual';
  syncLinksMenu();
  renderLinks();

  const form = document.getElementById('link-form') as HTMLFormElement;
  const labelInput = document.getElementById('link-label') as HTMLInputElement;
  const urlInput = document.getElementById('link-url') as HTMLInputElement;
  const folderSel = document.getElementById('link-folder-sel') as HTMLSelectElement;
  const list = document.getElementById('links-list') as HTMLElement;

  syncFolderSelect();

  // ── Search, with keyboard navigation ──
  const search = document.getElementById('links-search') as HTMLInputElement;
  search?.addEventListener('input', () => {
    linksSearchQuery = search.value;
    linksCursor = search.value.trim() ? 0 : -1;
    renderLinks();
  });
  search?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); }
    else if (e.key === 'Enter') {
      const el = visibleLinkEls()[linksCursor];
      const link = links.find(l => l.id === el?.dataset['id']);
      if (!link) return;
      e.preventDefault();
      recordVisit(link);
      window.open(link.url, '_blank', 'noopener');
    } else if (e.key === 'Escape') {
      search.value = ''; linksSearchQuery = ''; linksCursor = -1; renderLinks();
    }
  });
  document.getElementById('links-search-clear')?.addEventListener('click', () => {
    search.value = ''; linksSearchQuery = ''; linksCursor = -1;
    renderLinks(); search.focus();
  });

  // ── View toggle ──
  document.querySelectorAll<HTMLButtonElement>('#links-view-seg .lv-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      linksView = btn.dataset['view'] as typeof linksView;
      syncLinksMenu();
      renderLinks();
      await saveSettings({ linksView });
    });
  });

  // ── Overflow menu ──
  const menu = document.getElementById('links-menu') as HTMLElement;
  document.getElementById('btn-links-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target as Node)) menu.classList.add('hidden');
  });
  menu.querySelectorAll<HTMLButtonElement>('[data-lsort]').forEach(btn => {
    btn.addEventListener('click', async () => {
      linksSort = btn.dataset['lsort'] as typeof linksSort;
      syncLinksMenu();
      renderLinks();
      menu.classList.add('hidden');
      await saveSettings({ linksSort });
    });
  });

  // Dropping onto empty list space un-files a link
  list.addEventListener('dragover', (e) => { if (dragLinkId) e.preventDefault(); });
  list.addEventListener('drop', (e) => {
    if (e.target !== list) return;  // a child already handled it
    e.preventDefault();
    dropIntoFolder(undefined);
  });

  // ── Add / edit form ──
  document.getElementById('btn-links-add-toggle')?.addEventListener('click', () => openLinkForm());
  document.getElementById('btn-link-form-cancel')?.addEventListener('click', closeLinkForm);

  // Fill the name from the URL once, if the user has not typed one
  urlInput.addEventListener('blur', () => {
    if (!labelInput.value.trim() && urlInput.value.trim()) {
      labelInput.value = guessLabel(normalizeUrl(urlInput.value));
    }
  });

  document.getElementById('btn-new-folder')?.addEventListener('click', () => {
    const folder = { id: `f-${Date.now().toString(36)}`, label: 'New folder' };
    folders.push(folder);
    saveFolders(folders); renderLinks(); syncFolderSelect();
    // Drop straight into renaming rather than asking through a browser prompt.
    // The new folder renders last, so its label is the final one in the list.
    const label = [...document.querySelectorAll<HTMLElement>('#links-list .link-folder-label')].pop();
    if (label) startInlineEdit(label, folder.label, (next) => {
      folder.label = next;
      saveFolders(folders); renderLinks(); syncFolderSelect();
    }, renderLinks);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = normalizeUrl(urlInput.value);
    if (!url) return;
    const label = labelInput.value.trim() || guessLabel(url);
    const folderId = folderSel?.value || undefined;

    if (editingLinkId) {
      const link = links.find(l => l.id === editingLinkId);
      if (link) { link.url = url; link.label = label; link.folderId = folderId; }
    } else {
      links.push({ id: `l-${Date.now().toString(36)}`, label, url, folderId, visits: 0 });
    }
    persistLinks(); renderLinks(); closeLinkForm();
  });

  // ── Panel open/close ──
  const panel = document.getElementById('links-panel') as HTMLElement;
  document.getElementById('btn-links-toggle')?.addEventListener('click', () => {
    panel.classList.remove('hidden');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) search?.focus();
  });
  document.getElementById('btn-links-close')?.addEventListener('click', () => panel.classList.remove('open'));

  // ── Backup / restore ──
  document.getElementById('btn-bookmarks-export')?.addEventListener('click', () => {
    const data = { version: 2, exportedAt: new Date().toISOString(), folders, links };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'monktab-links.json'; a.click();
    URL.revokeObjectURL(url);
    menu.classList.add('hidden');
  });

  const fileInput = document.getElementById('links-import-file') as HTMLInputElement;
  document.getElementById('btn-links-import-json')?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { links?: QuickLink[]; folders?: QuickLinkFolder[] };
      if (!Array.isArray(data.links)) throw new Error('no links');

      // Merge rather than replace, so a restore cannot wipe what is already there
      const existingFolders = new Set(folders.map(f => f.id));
      (data.folders ?? []).forEach(f => { if (f.id && !existingFolders.has(f.id)) folders.push(f); });
      const existingUrls = new Set(links.map(l => l.url));
      let added = 0;
      data.links.forEach(l => {
        if (!l.url || existingUrls.has(l.url)) return;
        links.push({ ...l, id: `l-${Date.now().toString(36)}-${added}` });
        existingUrls.add(l.url);
        added++;
      });
      saveFolders(folders); persistLinks(); renderLinks(); syncFolderSelect();
      linksToast(`Restored ${added} link${added === 1 ? '' : 's'}`);
    } catch {
      linksToast('That file could not be read');
    }
    fileInput.value = '';
    menu.classList.add('hidden');
  });
}

// ─── Bookmark Import ──────────────────────────────────────────────────────────

interface BmNode { id: string; title: string; url?: string; path: string; }

let bmFlat: BmNode[] = [];
const bmSelected = new Set<string>();

function bmUpdateCount() {
  const el = document.getElementById('bm-count');
  if (el) el.textContent = `${bmSelected.size} selected`;
  const btn = document.getElementById('bm-import') as HTMLButtonElement | null;
  if (btn) btn.disabled = bmSelected.size === 0;
}

function renderBmTree(query: string) {
  const tree = document.getElementById('bm-tree') as HTMLElement;
  tree.innerHTML = '';
  const q = query.toLowerCase().trim();
  const matches = q
    ? bmFlat.filter(n => n.title.toLowerCase().includes(q) || (n.url ?? '').toLowerCase().includes(q))
    : bmFlat;

  if (matches.length === 0) {
    tree.innerHTML = '<div class="bm-empty">No bookmarks match</div>';
    return;
  }

  // Group by the folder path they came from, so the structure stays readable
  const byPath = new Map<string, BmNode[]>();
  matches.forEach(n => {
    if (!byPath.has(n.path)) byPath.set(n.path, []);
    byPath.get(n.path)!.push(n);
  });

  byPath.forEach((items, path) => {
    const group = document.createElement('div');
    group.className = 'bm-group';

    const head = document.createElement('button');
    head.className = 'bm-group-head';
    head.innerHTML = `<span class="bm-group-name"></span><span class="bm-group-count">${items.length}</span>`;
    (head.querySelector('.bm-group-name') as HTMLElement).textContent = path || 'Bookmarks';
    head.addEventListener('click', () => {
      // Toggle the whole folder in one click
      const allOn = items.every(i => bmSelected.has(i.id));
      items.forEach(i => allOn ? bmSelected.delete(i.id) : bmSelected.add(i.id));
      renderBmTree(query);
      bmUpdateCount();
    });
    group.appendChild(head);

    items.forEach(n => {
      const row = document.createElement('label');
      row.className = 'bm-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'bm-cb'; cb.checked = bmSelected.has(n.id);
      cb.addEventListener('change', () => {
        cb.checked ? bmSelected.add(n.id) : bmSelected.delete(n.id);
        bmUpdateCount();
      });
      const img = document.createElement('img');
      img.className = 'bm-fav'; img.src = faviconUrl(n.url ?? ''); img.alt = '';
      img.onerror = () => { img.style.visibility = 'hidden'; };
      const title = document.createElement('span');
      title.className = 'bm-title'; title.textContent = n.title;
      const host = document.createElement('span');
      host.className = 'bm-host'; host.textContent = linkHost(n.url ?? '');
      row.append(cb, img, title, host);
      group.appendChild(row);
    });

    tree.appendChild(group);
  });
}

function initBookmarkImport() {
  const overlay = document.getElementById('bm-overlay') as HTMLElement;
  const search = document.getElementById('bm-search') as HTMLInputElement;

  const close = () => overlay.classList.add('hidden');
  document.getElementById('bm-close')?.addEventListener('click', close);
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  document.getElementById('btn-bookmarks-import')?.addEventListener('click', async () => {
    document.getElementById('links-menu')?.classList.add('hidden');
    const tree = await chrome.bookmarks.getTree();
    bmFlat = [];
    bmSelected.clear();

    // Flatten to (bookmark, folder path) pairs — the path becomes the MonkTab folder
    function walk(nodes: chrome.bookmarks.BookmarkTreeNode[], path: string) {
      for (const node of nodes) {
        if (node.url && node.title) {
          bmFlat.push({ id: node.id, title: node.title, url: node.url, path });
        }
        if (node.children) {
          // Chrome's unnamed roots ("Bookmarks bar" etc.) should not nest the path
          const next = node.title && path ? `${path} / ${node.title}` : (node.title || path);
          walk(node.children, next);
        }
      }
    }
    walk(tree, '');

    // Anything already saved is pre-excluded so a second import is not a duplicate run
    const existing = new Set(links.map(l => l.url));
    bmFlat = bmFlat.filter(n => !existing.has(n.url!));

    search.value = '';
    renderBmTree('');
    bmUpdateCount();
    overlay.classList.remove('hidden');
    search.focus();
  });

  search?.addEventListener('input', () => renderBmTree(search.value));

  document.getElementById('bm-none')?.addEventListener('click', () => {
    bmSelected.clear();
    renderBmTree(search.value);
    bmUpdateCount();
  });

  document.getElementById('bm-import')?.addEventListener('click', () => {
    const keepFolders = (document.getElementById('bm-keep-folders') as HTMLInputElement).checked;
    const chosen = bmFlat.filter(n => bmSelected.has(n.id));
    if (chosen.length === 0) return;

    // Reuse a folder of the same name rather than creating a duplicate
    const folderByName = new Map(folders.map(f => [f.label.toLowerCase(), f]));
    let added = 0;
    chosen.forEach((n, i) => {
      let folderId: string | undefined;
      if (keepFolders && n.path) {
        const name = n.path.split(' / ').pop()!;
        let folder = folderByName.get(name.toLowerCase());
        if (!folder) {
          folder = { id: `f-${Date.now().toString(36)}-${i}`, label: name };
          folders.push(folder);
          folderByName.set(name.toLowerCase(), folder);
        }
        folderId = folder.id;
      }
      links.push({
        id: `l-${Date.now().toString(36)}-${i}`,
        label: n.title.slice(0, 40),
        url: n.url!,
        folderId,
        visits: 0,
      });
      added++;
    });

    saveFolders(folders); persistLinks(); renderLinks(); syncFolderSelect();
    overlay.classList.add('hidden');
    linksToast(`Imported ${added} bookmark${added === 1 ? '' : 's'}`);
  });
}

// ─── Stocks (StockMonk) ───────────────────────────────────────────────────────
//
// Everything here is served by the StockMonk API — a free, keyless public API by
// DevOps-Monk that aggregates Reddit buzz, StockTwits sentiment, SEC insider
// filings, earnings, technicals and prices. Crypto was removed in 1.12.0.

const SM_BASE = 'https://stockmonk.devops-monk.com/api/v1';

interface SmQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  high?: number;
  low?: number;
  open?: number;
  prevClose?: number;
}

interface SmSignal {
  ticker: string;
  score: number;
  label: string;
  breakdown?: Record<string, number>;
}

interface SmBulkEntry {
  ticker: string;
  market?: string;
  quote?: SmQuote | null;
  signal?: SmSignal | null;
}

interface SmTrending {
  rank: number;
  ticker: string;
  name: string;
  mentions: number;
  upvotes: number;
  mentionsDelta24h?: string | null;
  rankChange?: number | null;
  stockTwits?: { bullishCount: number; bearishCount: number; bullRatio: number; bearRatio: number } | null;
}

interface SmEarning {
  ticker: string;
  reportDate: string;
  reportTime?: string | null;
  epsEstimate?: number | null;
  epsActual?: number | null;
  epsSurprisePct?: number | null;
  beatMiss?: string | null;
  daysUntil?: number;
}

interface SmArticle {
  ticker?: string;
  headline: string;
  source?: string;
  url: string;
  sentiment?: string;
  /** The feed returns snake_case, the detail endpoint camelCase. */
  published_at?: string;
  publishedAt?: string;
}

function articleTime(a: SmArticle): string | undefined {
  return a.published_at ?? a.publishedAt;
}

let watchlist: WatchItem[] = [];
let marketTab: 'watchlist' | 'trending' | 'signals' | 'earnings' | 'news' = 'watchlist';
let mkQuotes = new Map<string, SmQuote>();
let mkSignals = new Map<string, SmSignal>();
let mkTrendingCache: SmTrending[] | null = null;
let mkLoadedAt = 0;
let mkEarnScope: 'mine' | 'all' = 'mine';
let mkNewsScope: 'mine' | 'all' = 'mine';
/** Ticker whose alerts are being edited. */
let mkAlertSymbol: string | null = null;

/**
 * The API returns names straight from upstream feeds, which are HTML-escaped
 * ("SPDR S&amp;P 500"). Decoding through the DOM handles every entity safely,
 * and the result is only ever assigned with textContent.
 */
function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}

/**
 * An unknown ticker still comes back with a quote object — price 0 and null
 * change fields — so a real quote is one with a price, and the nullable numbers
 * are coerced before anything tries to format them.
 */
function normQuote(q?: SmQuote | null): SmQuote | null {
  if (!q || !Number.isFinite(q.price) || q.price <= 0) return null;
  return {
    ...q,
    change: Number.isFinite(q.change) ? q.change : 0,
    changePercent: Number.isFinite(q.changePercent) ? q.changePercent : 0,
  };
}

async function smFetch<T>(path: string, timeoutMs = 12000): Promise<T | null> {
  try {
    const res = await fetch(`${SM_BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function fmtPct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function relTime(iso?: string): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Buy-signal bands, matching the API's own thresholds. */
function signalTone(score: number): string {
  if (score >= 60) return 'good';
  if (score >= 40) return 'mid';
  return 'low';
}

function mkSetMsg(text: string, isError = false) {
  const el = document.getElementById('mk-add-msg');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-error', isError);
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 4000);
}

// ── Watchlist data ──────────────────────────────────────────────────────────

/** `/stocks/bulk` caps at 20 tickers, so a longer watchlist goes out in batches. */
async function fetchBulk(symbols: string[]): Promise<SmBulkEntry[]> {
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));
  const results = await Promise.all(
    batches.map(b => smFetch<{ stocks?: SmBulkEntry[] }>(`/stocks/bulk?tickers=${b.join(',')}`, 20000)),
  );
  return results.flatMap(r => r?.stocks ?? []);
}

async function loadWatchlistData(): Promise<void> {
  const symbols = watchlist.map(w => w.symbol);
  if (!symbols.length) { mkLoadedAt = Date.now(); return; }

  const entries = await fetchBulk(symbols);
  entries.forEach(e => {
    const q = normQuote(e.quote);
    if (q) mkQuotes.set(e.ticker, q);
    if (e.signal) mkSignals.set(e.ticker, e.signal);
  });
  mkLoadedAt = Date.now();
  await checkAlerts();
}

// ── Alerts ──────────────────────────────────────────────────────────────────

function notifyAlert(title: string, message: string, id: string) {
  try {
    chrome.notifications?.create(id, {
      type: 'basic', iconUrl: '/icons/icon48.png', title, message,
    });
  } catch { /* notifications may be unavailable */ }
  try {
    const ctx = new AudioContext();
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.4, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(t); osc.stop(t + 0.5);
    });
    setTimeout(() => ctx.close(), 1600);
  } catch { /* AudioContext unavailable */ }
}

/**
 * Both alert kinds latch per day, so a stock sitting above its target does not
 * re-notify on every new tab, but a fresh move tomorrow still gets through.
 */
async function checkAlerts(): Promise<void> {
  const today = todayString();
  let dirty = false;

  for (const item of watchlist) {
    const q = mkQuotes.get(item.symbol);
    if (!q) continue;

    // Absolute price threshold
    if (item.alertPrice && item.alertDirection && item.priceFiredOn !== today) {
      const hit = item.alertDirection === 'above' ? q.price >= item.alertPrice : q.price <= item.alertPrice;
      if (hit) {
        item.priceFiredOn = today;
        dirty = true;
        notifyAlert(
          `${item.symbol} ${item.alertDirection === 'above' ? '▲' : '▼'} $${fmtPrice(item.alertPrice)}`,
          `${item.symbol} is at $${fmtPrice(q.price)} (${fmtPct(q.changePercent)} today)`,
          `mk-price-${item.id}`,
        );
      }
    }

    // Percent move for the day, measured against the previous close
    if (item.alertPct && item.alertPctDirection && item.pctFiredOn !== today) {
      const pct = q.changePercent;
      const dir = item.alertPctDirection;
      const hit =
        dir === 'up'   ? pct >= item.alertPct :
        dir === 'down' ? pct <= -item.alertPct :
                         Math.abs(pct) >= item.alertPct;
      if (hit) {
        item.pctFiredOn = today;
        dirty = true;
        notifyAlert(
          `${item.symbol} moved ${fmtPct(pct)}`,
          `Past your ${item.alertPct}% mark — now $${fmtPrice(q.price)}`,
          `mk-pct-${item.id}`,
        );
      }
    }
  }

  if (dirty) await saveWatchlist(watchlist);
}

// ── Row builders ────────────────────────────────────────────────────────────

function changeChip(pct: number): string {
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '·';
  return `<span class="mk-chg ${dir}">${arrow} ${fmtPct(pct).replace('+', '')}</span>`;
}

function signalBadge(sig?: SmSignal | null): string {
  if (!sig) return '';
  return `<span class="mk-sig ${signalTone(sig.score)}" title="${sig.label} — StockMonk buy signal">${sig.score}</span>`;
}

function alertSummary(item: WatchItem): string {
  const bits: string[] = [];
  if (item.alertPrice && item.alertDirection) {
    bits.push(`${item.alertDirection === 'above' ? '≥' : '≤'} $${fmtPrice(item.alertPrice)}`);
  }
  if (item.alertPct && item.alertPctDirection) {
    const d = item.alertPctDirection === 'both' ? '±' : item.alertPctDirection === 'up' ? '+' : '−';
    bits.push(`${d}${item.alertPct}%`);
  }
  return bits.join(' · ');
}

function buildWatchRow(item: WatchItem): HTMLElement {
  const q = mkQuotes.get(item.symbol);
  const sig = mkSignals.get(item.symbol);

  const row = document.createElement('div');
  row.className = 'mk-row mk-row--watch';

  const main = document.createElement('button');
  main.className = 'mk-row-main';
  main.title = 'Open details';
  main.innerHTML = `
    <span class="mk-sym-wrap">
      <span class="mk-sym">${item.symbol}</span>
      <span class="mk-name"></span>
    </span>
    <span class="mk-price-wrap">
      <span class="mk-price">${q ? '$' + fmtPrice(q.price) : '—'}</span>
      ${q ? changeChip(q.changePercent) : '<span class="mk-chg flat">no data</span>'}
    </span>
    ${signalBadge(sig)}
  `;
  (main.querySelector('.mk-name') as HTMLElement).textContent =
    decodeEntities(item.name ?? '') || (q ? `${fmtPrice(q.low ?? 0)}–${fmtPrice(q.high ?? 0)} today` : '');
  main.addEventListener('click', () => openTickerDetail(item.symbol));

  const actions = document.createElement('div');
  actions.className = 'mk-row-actions';

  const summary = alertSummary(item);
  const bell = document.createElement('button');
  bell.className = `mk-act${summary ? ' is-on' : ''}`;
  bell.title = summary ? `Alerts: ${summary}` : 'Set an alert';
  bell.innerHTML = svgIcon('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', 12);
  bell.addEventListener('click', () => openAlertModal(item.symbol));

  const del = document.createElement('button');
  del.className = 'mk-act mk-act-del'; del.title = 'Remove';
  del.innerHTML = svgIcon(ICON_CROSS, 12);
  del.addEventListener('click', () => void removeTicker(item.symbol));

  actions.append(bell, del);
  row.append(main, actions);

  if (summary) {
    const chip = document.createElement('span');
    chip.className = 'mk-alert-chip';
    chip.textContent = summary;
    main.querySelector('.mk-sym-wrap')?.appendChild(chip);
  }
  return row;
}

function renderWatchlist() {
  const list = document.getElementById('mk-watchlist');
  if (!list) return;
  list.innerHTML = '';

  if (watchlist.length === 0) {
    list.innerHTML = `<div class="mk-empty">
      <strong>No stocks yet</strong>
      Add a ticker above, or pull one from the Trending tab.
    </div>`;
    document.getElementById('mk-summary')?.classList.add('hidden');
    return;
  }

  watchlist.forEach(item => list.appendChild(buildWatchRow(item)));
  renderSummary();
}

function renderSummary() {
  const wrap = document.getElementById('mk-summary');
  if (!wrap) return;
  const quoted = watchlist
    .map(w => ({ sym: w.symbol, q: mkQuotes.get(w.symbol) }))
    .filter((x): x is { sym: string; q: SmQuote } => Boolean(x.q));

  if (quoted.length === 0) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  const up = quoted.filter(x => x.q.changePercent > 0);
  const down = quoted.filter(x => x.q.changePercent < 0);
  const sorted = [...quoted].sort((a, b) => b.q.changePercent - a.q.changePercent);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const avg = quoted.reduce((n, x) => n + x.q.changePercent, 0) / quoted.length;

  const set = (id: string, text: string, cls?: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `mk-sum-val${cls ? ' ' + cls : ''}`;
  };
  set('mk-sum-up', String(up.length), 'up');
  set('mk-sum-down', String(down.length), 'down');
  set('mk-sum-best', `${best.sym} ${fmtPct(best.q.changePercent)}`, best.q.changePercent >= 0 ? 'up' : 'down');
  set('mk-sum-worst', `${worst.sym} ${fmtPct(worst.q.changePercent)}`, worst.q.changePercent >= 0 ? 'up' : 'down');
  set('mk-sum-avg', fmtPct(avg), avg >= 0 ? 'up' : 'down');
}

// ── Watchlist mutation ──────────────────────────────────────────────────────

function onWatchlist(symbol: string): boolean {
  return watchlist.some(w => w.symbol === symbol.toUpperCase());
}

/**
 * A ticker is only accepted if StockMonk can actually quote it, which doubles as
 * validation and fills in the company name.
 */
async function addTicker(raw: string, name?: string): Promise<boolean> {
  const symbol = raw.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  if (!symbol) return false;
  if (onWatchlist(symbol)) { mkSetMsg(`${symbol} is already on your list`); return false; }

  mkSetMsg(`Checking ${symbol}…`);
  const entries = await fetchBulk([symbol]);
  const quote = normQuote(entries.find(e => e.ticker === symbol)?.quote);
  if (!quote) {
    mkSetMsg(`No quote for ${symbol} — check the ticker`, true);
    return false;
  }
  const entry = entries.find(e => e.ticker === symbol)!;

  mkQuotes.set(symbol, quote);
  if (entry.signal) mkSignals.set(symbol, entry.signal);
  watchlist.push({
    id: `w-${Date.now().toString(36)}`,
    symbol,
    name: name ? decodeEntities(name) : undefined,
    addedAt: Date.now(),
  });
  await saveWatchlist(watchlist);
  renderWatchlist();
  mkSetMsg(`Added ${symbol}`);
  return true;
}

async function removeTicker(symbol: string) {
  const idx = watchlist.findIndex(w => w.symbol === symbol);
  if (idx === -1) return;
  const [removed] = watchlist.splice(idx, 1);
  await saveWatchlist(watchlist);
  renderWatchlist();
  renderTrending();
  mkSetMsg(`Removed ${removed.symbol}`);
}

// ── Trending ────────────────────────────────────────────────────────────────

async function renderTrending(force = false) {
  const list = document.getElementById('mk-trending');
  if (!list) return;

  if (!mkTrendingCache || force) {
    list.innerHTML = '<div class="mk-loading">Loading what people are talking about…</div>';
    const data = await smFetch<{ stocks?: SmTrending[] }>('/trending/stocks?limit=40', 20000);
    mkTrendingCache = data?.stocks ?? null;
  }
  if (!mkTrendingCache) {
    list.innerHTML = '<div class="mk-empty"><strong>Could not reach StockMonk</strong>Try the refresh button in a moment.</div>';
    return;
  }

  list.innerHTML = '';
  mkTrendingCache.forEach(t => {
    const row = document.createElement('div');
    row.className = 'mk-row';

    const delta = t.mentionsDelta24h ? parseFloat(t.mentionsDelta24h) : null;
    const deltaCls = delta === null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    const rankChange = t.rankChange ?? 0;

    const main = document.createElement('button');
    main.className = 'mk-row-main';
    main.title = 'Open details';
    main.innerHTML = `
      <span class="mk-rank">${t.rank}</span>
      <span class="mk-sym-wrap">
        <span class="mk-sym">${t.ticker}</span>
        <span class="mk-name"></span>
      </span>
      <span class="mk-mentions">
        <span class="mk-mention-count">${fmtCompact(t.mentions)}</span>
        <span class="mk-mention-label">mentions</span>
      </span>
      ${delta !== null ? `<span class="mk-chg ${deltaCls}">${delta > 0 ? '▲' : delta < 0 ? '▼' : '·'} ${Math.abs(delta).toFixed(0)}%</span>` : ''}
      ${rankChange > 0 ? `<span class="mk-rankjump" title="Climbed ${rankChange} places in 24h">↑${rankChange}</span>` : ''}
    `;
    (main.querySelector('.mk-name') as HTMLElement).textContent = decodeEntities(t.name ?? '');
    main.addEventListener('click', () => openTickerDetail(t.ticker));

    // StockTwits bull/bear split, when the API has it
    if (t.stockTwits && (t.stockTwits.bullishCount + t.stockTwits.bearishCount) > 0) {
      const bar = document.createElement('span');
      bar.className = 'mk-bull-bar';
      bar.title = `${Math.round(t.stockTwits.bullRatio * 100)}% bullish on StockTwits`;
      bar.innerHTML = `<span class="mk-bull" style="width:${Math.round(t.stockTwits.bullRatio * 100)}%"></span>`;
      main.appendChild(bar);
    }

    const actions = document.createElement('div');
    actions.className = 'mk-row-actions';
    const add = document.createElement('button');
    const already = onWatchlist(t.ticker);
    add.className = `mk-act${already ? ' is-on' : ''}`;
    add.title = already ? 'Already on your watchlist' : 'Add to watchlist';
    add.innerHTML = already ? svgIcon('<polyline points="20 6 9 17 4 12"/>', 12) : svgIcon(ICON_PLUS, 12);
    add.addEventListener('click', async () => {
      if (onWatchlist(t.ticker)) return;
      if (await addTicker(t.ticker, t.name)) renderTrending();
    });
    actions.appendChild(add);

    row.append(main, actions);
    list.appendChild(row);
  });
}

// ── Signals ─────────────────────────────────────────────────────────────────

const FACTOR_LABELS: Record<string, string> = {
  redditMentionSurge: 'Reddit surge',
  stockTwitsBullish: 'StockTwits',
  newsSentiment: 'News tone',
  earningsBeat: 'Earnings beat',
  upcomingEarnings: 'Earnings soon',
  insiderBuying: 'Insider buying',
  technicalStrength: 'Technicals',
};
const FACTOR_MAX: Record<string, number> = {
  redditMentionSurge: 25, stockTwitsBullish: 20, newsSentiment: 20,
  earningsBeat: 20, upcomingEarnings: 15, insiderBuying: 15, technicalStrength: 15,
};

function breakdownHtml(breakdown: Record<string, number>): string {
  return Object.entries(breakdown)
    .filter(([k]) => FACTOR_LABELS[k])
    .map(([k, v]) => {
      const max = FACTOR_MAX[k] ?? 20;
      const pct = Math.max(0, Math.min(100, (v / max) * 100));
      return `<div class="mk-factor">
        <span class="mk-factor-name">${FACTOR_LABELS[k]}</span>
        <span class="mk-factor-track"><span class="mk-factor-fill" style="width:${pct}%"></span></span>
        <span class="mk-factor-val">${v}</span>
      </div>`;
    }).join('');
}

async function renderSignals() {
  const list = document.getElementById('mk-signals');
  if (!list) return;
  list.innerHTML = '<div class="mk-loading">Scoring the market…</div>';

  const data = await smFetch<{ signals?: (SmSignal & { breakdown: Record<string, number> })[] }>(
    '/signals/top?minScore=0&limit=25', 20000);
  if (!data?.signals?.length) {
    list.innerHTML = '<div class="mk-empty"><strong>No signals right now</strong>StockMonk may still be warming up.</div>';
    return;
  }

  list.innerHTML = '';
  data.signals.forEach(sig => {
    const row = document.createElement('div');
    row.className = 'mk-signal-card';
    row.innerHTML = `
      <div class="mk-signal-head">
        <button class="mk-signal-sym">${sig.ticker}</button>
        <span class="mk-sig ${signalTone(sig.score)}">${sig.score}</span>
        <span class="mk-signal-label">${sig.label}</span>
      </div>
      <div class="mk-factors">${breakdownHtml(sig.breakdown ?? {})}</div>
    `;
    row.querySelector('.mk-signal-sym')?.addEventListener('click', () => openTickerDetail(sig.ticker));
    list.appendChild(row);
  });
}

// ── Earnings ────────────────────────────────────────────────────────────────

function earningsTimeLabel(t?: string | null): string {
  if (t === 'before_market') return 'Before open';
  if (t === 'after_market') return 'After close';
  return '';
}

async function renderEarnings() {
  const list = document.getElementById('mk-earnings');
  if (!list) return;
  list.innerHTML = '<div class="mk-loading">Loading the earnings calendar…</div>';

  const data = await smFetch<{ earnings?: SmEarning[] }>('/earnings/upcoming?days=21', 20000);
  let items = data?.earnings ?? [];

  if (mkEarnScope === 'mine') {
    const mine = new Set(watchlist.map(w => w.symbol));
    items = items.filter(e => mine.has(e.ticker));
  } else {
    // The full calendar runs to hundreds of rows; the soonest are the useful ones
    items = items.slice(0, 60);
  }

  if (!items.length) {
    list.innerHTML = mkEarnScope === 'mine'
      ? '<div class="mk-empty"><strong>Nothing due</strong>None of your stocks report in the next three weeks.</div>'
      : '<div class="mk-empty"><strong>No earnings found</strong>Try again shortly.</div>';
    return;
  }

  items.sort((a, b) => a.reportDate.localeCompare(b.reportDate));

  list.innerHTML = '';
  let lastDate = '';
  items.forEach(e => {
    if (e.reportDate !== lastDate) {
      lastDate = e.reportDate;
      const head = document.createElement('div');
      head.className = 'mk-date-head';
      const d = new Date(e.reportDate + 'T00:00:00');
      const days = e.daysUntil ?? 0;
      head.textContent = `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
        + (days === 0 ? ' · today' : days === 1 ? ' · tomorrow' : ` · in ${days} days`);
      list.appendChild(head);
    }

    const row = document.createElement('div');
    row.className = 'mk-row';
    const main = document.createElement('button');
    main.className = 'mk-row-main';
    main.innerHTML = `
      <span class="mk-sym-wrap">
        <span class="mk-sym">${e.ticker}</span>
        <span class="mk-name">${earningsTimeLabel(e.reportTime)}</span>
      </span>
      ${e.epsEstimate !== null && e.epsEstimate !== undefined
        ? `<span class="mk-eps"><span class="mk-eps-label">EPS est.</span><span class="mk-eps-val">${e.epsEstimate.toFixed(2)}</span></span>`
        : ''}
      ${onWatchlist(e.ticker) ? '<span class="mk-mine">On your list</span>' : ''}
    `;
    main.addEventListener('click', () => openTickerDetail(e.ticker));
    row.appendChild(main);
    list.appendChild(row);
  });
}

// ── News ────────────────────────────────────────────────────────────────────

function sentimentDot(s?: string): string {
  const cls = s === 'positive' ? 'up' : s === 'negative' ? 'down' : 'flat';
  return `<span class="mk-sent ${cls}" title="${s ?? 'neutral'} sentiment"></span>`;
}

async function renderMarketNews() {
  const list = document.getElementById('mk-news');
  if (!list) return;
  list.innerHTML = '<div class="mk-loading">Loading headlines…</div>';

  let articles: SmArticle[] = [];
  if (mkNewsScope === 'mine' && watchlist.length) {
    // Per-ticker news is richer than the global feed for a small watchlist
    const results = await Promise.all(
      watchlist.slice(0, 8).map(w =>
        smFetch<{ articles?: SmArticle[] }>(`/news/${w.symbol}?limit=5`, 15000)),
    );
    articles = results.flatMap(r => r?.articles ?? []);
  } else {
    const data = await smFetch<{ articles?: SmArticle[] }>('/news/feed?limit=50', 20000);
    articles = data?.articles ?? [];
  }

  articles.sort((a, b) => (articleTime(b) ?? '').localeCompare(articleTime(a) ?? ''));

  if (!articles.length) {
    list.innerHTML = mkNewsScope === 'mine'
      ? '<div class="mk-empty"><strong>No headlines</strong>Add stocks to your watchlist, or switch to market wide.</div>'
      : '<div class="mk-empty"><strong>No headlines right now</strong>Try again shortly.</div>';
    return;
  }

  list.innerHTML = '';
  articles.slice(0, 60).forEach(a => {
    const row = document.createElement('a');
    row.className = 'mk-news-row';
    row.href = a.url; row.target = '_blank'; row.rel = 'noopener noreferrer';
    row.innerHTML = `
      ${sentimentDot(a.sentiment)}
      <span class="mk-news-body">
        <span class="mk-news-head"></span>
        <span class="mk-news-meta">
          <span class="mk-news-ticker">${a.ticker ?? ''}</span>
          <span>${a.source ?? ''}</span>
          <span>${relTime(articleTime(a))}</span>
        </span>
      </span>
    `;
    (row.querySelector('.mk-news-head') as HTMLElement).textContent = decodeEntities(a.headline);
    list.appendChild(row);
  });
}

// ── Ticker detail ───────────────────────────────────────────────────────────

/**
 * Every numeric field here can arrive as an explicit `null` rather than being
 * absent, so they are typed nullable and read through `num()`.
 */
type Nullable<T> = T | null | undefined;

interface SmDetail {
  ticker: string;
  profile?: { name?: string; sector?: string; industry?: string; ceo?: string; description?: string; weburl?: string };
  quote?: SmQuote;
  nextEarnings?: { reportDate?: string; epsEstimate?: Nullable<number> } | null;
  earningsHistory?: { date: string; eps?: Nullable<number>; epsEstimated?: Nullable<number>; surprisePct?: Nullable<number> }[];
  newsSentiment?: { score?: number; label?: string; topArticles?: SmArticle[] } | null;
  signal?: SmSignal & { breakdown?: Record<string, number> };
  /**
   * The detail endpoint returns these flat (rsi14, macdValue, sma50…), while
   * `/technicals/{ticker}` nests them under `indicators`. Both shapes are read.
   */
  technicals?: {
    available?: boolean;
    rsi14?: Nullable<number>;
    macdValue?: Nullable<number>; macdSignal?: Nullable<number>; macdHist?: Nullable<number>;
    bbUpper?: Nullable<number>; bbMiddle?: Nullable<number>; bbLower?: Nullable<number>;
    sma50?: Nullable<number>;
    indicators?: {
      rsi14?: Nullable<number>;
      macd?: { value: Nullable<number>; signal: Nullable<number>; histogram: Nullable<number> } | null;
      sma50?: Nullable<number>;
      bollingerBands?: { upper: Nullable<number>; middle: Nullable<number>; lower: Nullable<number> } | null;
    };
    signals?: Record<string, unknown>;
  } | null;
  insider?: { netBuyShares?: Nullable<number>; netBuyValue?: Nullable<number>; buyCount?: Nullable<number>;
              sellCount?: Nullable<number>; csuiteBuying?: boolean; sentiment?: string; recentTransactions?: unknown[] } | null;
  subredditBreakdown?: Record<string, { rank?: number; mentions?: number; upvotes?: number }> | null;
}

/** A finite number, or undefined for null / missing / NaN. */
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Flattens whichever technicals shape the endpoint happened to return. */
function readTechnicals(t: SmDetail['technicals']) {
  if (!t) return null;
  const ind = t.indicators;
  return {
    rsi: num(t.rsi14) ?? num(ind?.rsi14),
    macd: num(t.macdValue) ?? num(ind?.macd?.value),
    macdHist: num(t.macdHist) ?? num(ind?.macd?.histogram),
    sma50: num(t.sma50) ?? num(ind?.sma50),
    bbMid: num(t.bbMiddle) ?? num(ind?.bollingerBands?.middle),
  };
}

function statTile(label: string, value: string, tone = ''): string {
  return `<div class="mk-stat"><span class="mk-stat-label">${label}</span><span class="mk-stat-val ${tone}">${value}</span></div>`;
}

async function openTickerDetail(symbol: string) {
  const panel = document.getElementById('mk-detail') as HTMLElement;
  const body = document.getElementById('mk-detail-body') as HTMLElement;
  const title = document.getElementById('mk-detail-title') as HTMLElement;
  if (!panel || !body) return;

  title.textContent = symbol;
  body.innerHTML = '<div class="mk-loading">Loading…</div>';
  panel.classList.remove('hidden');
  syncDetailWatchBtn(symbol);

  const d = await smFetch<SmDetail>(`/stocks/${encodeURIComponent(symbol)}/detail`, 25000);
  if (!d) {
    body.innerHTML = '<div class="mk-empty"><strong>Could not load that ticker</strong>StockMonk did not respond in time.</div>';
    return;
  }

  const q = normQuote(d.quote);
  const tech = readTechnicals(d.technicals);
  const sections: string[] = [];

  // Header: price and the day's move
  if (q) {
    sections.push(`
      <div class="mk-d-quote">
        <span class="mk-d-price">$${fmtPrice(q.price)}</span>
        ${changeChip(q.changePercent)}
        <span class="mk-d-abs">${q.change >= 0 ? '+' : ''}${fmtPrice(q.change)} today</span>
      </div>
      <div class="mk-stats">
        ${statTile('Open', q.open !== undefined ? '$' + fmtPrice(q.open) : '—')}
        ${statTile('High', q.high !== undefined ? '$' + fmtPrice(q.high) : '—')}
        ${statTile('Low', q.low !== undefined ? '$' + fmtPrice(q.low) : '—')}
        ${statTile('Prev close', q.prevClose !== undefined ? '$' + fmtPrice(q.prevClose) : '—')}
      </div>`);
  }

  if (d.profile?.name) {
    const p = d.profile;
    sections.push(`<div class="mk-d-profile">
      <div class="mk-d-name"></div>
      <div class="mk-d-sector">${[p.sector, p.industry].filter(Boolean).join(' · ')}</div>
    </div>`);
  }

  // Buy signal
  if (d.signal) {
    sections.push(`<div class="mk-d-section">
      <div class="mk-d-title">Buy signal
        <span class="mk-sig ${signalTone(d.signal.score)}">${d.signal.score}</span>
        <span class="mk-signal-label">${d.signal.label}</span>
      </div>
      <div class="mk-factors">${breakdownHtml(d.signal.breakdown ?? {})}</div>
    </div>`);
  }

  // Technicals — only the indicators the API actually returned for this ticker
  if (tech && (tech.rsi !== undefined || tech.macd !== undefined || tech.sma50 !== undefined || tech.bbMid !== undefined)) {
    const tiles: string[] = [];
    if (tech.rsi !== undefined) {
      const tone = tech.rsi >= 70 ? 'down' : tech.rsi <= 30 ? 'up' : '';
      const note = tech.rsi >= 70 ? 'overbought' : tech.rsi <= 30 ? 'oversold' : 'neutral';
      tiles.push(statTile(`RSI 14 · ${note}`, tech.rsi.toFixed(1), tone));
    }
    if (tech.macd !== undefined) {
      tiles.push(statTile('MACD', tech.macd.toFixed(2), (tech.macdHist ?? 0) > 0 ? 'up' : 'down'));
    }
    if (tech.sma50 !== undefined) {
      tiles.push(statTile('SMA 50', '$' + fmtPrice(tech.sma50), q ? (q.price > tech.sma50 ? 'up' : 'down') : ''));
    }
    if (tech.bbMid !== undefined) {
      tiles.push(statTile('Bollinger mid', '$' + fmtPrice(tech.bbMid)));
    }
    sections.push(`<div class="mk-d-section">
      <div class="mk-d-title">Technicals</div>
      <div class="mk-stats">${tiles.join('')}</div>
    </div>`);
  }

  // Insider activity
  if (d.insider && ((num(d.insider.buyCount) ?? 0) > 0 || (num(d.insider.sellCount) ?? 0) > 0)) {
    const ins = d.insider;
    const net = num(ins.netBuyValue) ?? 0;
    sections.push(`<div class="mk-d-section">
      <div class="mk-d-title">Insider activity <span class="mk-d-sub">last 90 days · SEC Form 4</span></div>
      <div class="mk-stats">
        ${statTile('Net value', `${net >= 0 ? '+' : '−'}$${fmtCompact(Math.abs(net))}`, net >= 0 ? 'up' : 'down')}
        ${statTile('Buys', String(num(ins.buyCount) ?? 0), 'up')}
        ${statTile('Sells', String(num(ins.sellCount) ?? 0), 'down')}
        ${statTile('C-suite buying', ins.csuiteBuying ? 'Yes' : 'No', ins.csuiteBuying ? 'up' : '')}
      </div>
    </div>`);
  }

  // Earnings
  if (d.nextEarnings?.reportDate || d.earningsHistory?.length) {
    const rows = (d.earningsHistory ?? []).slice(0, 4).map(h => {
      const eps = num(h.eps), est = num(h.epsEstimated), surprise = num(h.surprisePct);
      const beat = (surprise ?? 0) >= 0;
      return `<div class="mk-earn-row">
        <span>${new Date(h.date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</span>
        <span>${eps !== undefined ? eps.toFixed(2) : '—'} vs ${est !== undefined ? est.toFixed(2) : '—'}</span>
        <span class="${beat ? 'up' : 'down'}">${surprise !== undefined ? (beat ? '+' : '') + surprise.toFixed(1) + '%' : ''}</span>
      </div>`;
    }).join('');
    sections.push(`<div class="mk-d-section">
      <div class="mk-d-title">Earnings</div>
      ${d.nextEarnings?.reportDate
        ? `<div class="mk-d-next">Next report ${new Date(d.nextEarnings.reportDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}${
            num(d.nextEarnings.epsEstimate) !== undefined ? ` · EPS est. ${num(d.nextEarnings.epsEstimate)}` : ''}</div>`
        : ''}
      ${rows ? `<div class="mk-earn-table">${rows}</div>` : ''}
    </div>`);
  }

  // Reddit breakdown
  const subs = Object.entries(d.subredditBreakdown ?? {}).filter(([, v]) => v?.mentions);
  if (subs.length) {
    sections.push(`<div class="mk-d-section">
      <div class="mk-d-title">Reddit chatter</div>
      <div class="mk-subs">${subs.map(([name, v]) =>
        `<span class="mk-sub-chip">r/${name} <b>${fmtCompact(v.mentions ?? 0)}</b></span>`).join('')}</div>
    </div>`);
  }

  // Headlines
  const arts = d.newsSentiment?.topArticles ?? [];
  if (arts.length) {
    sections.push(`<div class="mk-d-section">
      <div class="mk-d-title">Recent news${d.newsSentiment?.label ? ` <span class="mk-d-sub">${d.newsSentiment.label}</span>` : ''}</div>
      <div class="mk-d-news"></div>
    </div>`);
  }

  body.innerHTML = sections.join('');

  // Text-assigned fields, so upstream content can never inject markup
  const nameEl = body.querySelector('.mk-d-name') as HTMLElement | null;
  if (nameEl) nameEl.textContent = decodeEntities(d.profile?.name ?? '');

  const newsWrap = body.querySelector('.mk-d-news') as HTMLElement | null;
  if (newsWrap) {
    arts.slice(0, 5).forEach(a => {
      const link = document.createElement('a');
      link.className = 'mk-news-row';
      link.href = a.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      const b = document.createElement('span');
      b.className = 'mk-news-body';
      const h = document.createElement('span');
      h.className = 'mk-news-head';
      h.textContent = decodeEntities(a.headline);
      const m = document.createElement('span');
      m.className = 'mk-news-meta';
      m.textContent = [a.source, relTime(articleTime(a))].filter(Boolean).join(' · ');
      b.append(h, m);
      link.innerHTML = sentimentDot(a.sentiment);
      link.appendChild(b);
      newsWrap.appendChild(link);
    });
  }
}

function syncDetailWatchBtn(symbol: string) {
  const btn = document.getElementById('mk-detail-watch') as HTMLButtonElement | null;
  if (!btn) return;
  const on = onWatchlist(symbol);
  btn.textContent = on ? 'On watchlist' : '+ Watch';
  btn.classList.toggle('is-on', on);
  btn.onclick = async () => {
    if (onWatchlist(symbol)) await removeTicker(symbol);
    else await addTicker(symbol);
    syncDetailWatchBtn(symbol);
  };
}

// ── Alert modal ─────────────────────────────────────────────────────────────

function openAlertModal(symbol: string) {
  const item = watchlist.find(w => w.symbol === symbol);
  if (!item) return;
  mkAlertSymbol = symbol;

  (document.getElementById('mk-alert-sym') as HTMLElement).textContent = symbol;
  (document.getElementById('mk-alert-dir') as HTMLSelectElement).value = item.alertDirection ?? '';
  (document.getElementById('mk-alert-price') as HTMLInputElement).value =
    item.alertPrice !== undefined ? String(item.alertPrice) : '';
  (document.getElementById('mk-alert-pct-dir') as HTMLSelectElement).value = item.alertPctDirection ?? '';
  (document.getElementById('mk-alert-pct') as HTMLInputElement).value =
    item.alertPct !== undefined ? String(item.alertPct) : '';

  // Prefill the threshold with the current price so it is a starting point
  const q = mkQuotes.get(symbol);
  const priceInput = document.getElementById('mk-alert-price') as HTMLInputElement;
  if (!priceInput.value && q) priceInput.placeholder = fmtPrice(q.price);

  document.getElementById('mk-alert-modal')?.classList.remove('hidden');
}

function closeAlertModal() {
  mkAlertSymbol = null;
  document.getElementById('mk-alert-modal')?.classList.add('hidden');
}

async function saveAlertModal() {
  const item = watchlist.find(w => w.symbol === mkAlertSymbol);
  if (!item) return closeAlertModal();

  const dir = (document.getElementById('mk-alert-dir') as HTMLSelectElement).value;
  const price = parseFloat((document.getElementById('mk-alert-price') as HTMLInputElement).value);
  const pctDir = (document.getElementById('mk-alert-pct-dir') as HTMLSelectElement).value;
  const pct = parseFloat((document.getElementById('mk-alert-pct') as HTMLInputElement).value);

  if (dir && Number.isFinite(price) && price > 0) {
    item.alertDirection = dir as 'above' | 'below';
    item.alertPrice = price;
  } else {
    delete item.alertDirection; delete item.alertPrice;
  }
  // Editing an alert re-arms it, so a corrected threshold can fire the same day
  delete item.priceFiredOn;

  if (pctDir && Number.isFinite(pct) && pct > 0) {
    item.alertPctDirection = pctDir as 'up' | 'down' | 'both';
    item.alertPct = pct;
  } else {
    delete item.alertPctDirection; delete item.alertPct;
  }
  delete item.pctFiredOn;

  await saveWatchlist(watchlist);
  renderWatchlist();
  closeAlertModal();
  await checkAlerts();
}

// ── Panel wiring ────────────────────────────────────────────────────────────

function setMarketTab(tab: typeof marketTab) {
  marketTab = tab;
  ['watchlist', 'trending', 'signals', 'earnings', 'news'].forEach(t => {
    document.getElementById(`market-pane-${t}`)?.classList.toggle('hidden', t !== tab);
    document.querySelector<HTMLElement>(`.market-tab[data-mtab="${t}"]`)
      ?.classList.toggle('market-tab--active', t === tab);
  });
  document.getElementById('mk-detail')?.classList.add('hidden');

  if (tab === 'trending') void renderTrending();
  else if (tab === 'signals') void renderSignals();
  else if (tab === 'earnings') void renderEarnings();
  else if (tab === 'news') void renderMarketNews();
}

function stampUpdated() {
  const el = document.getElementById('market-last-updated');
  if (el) el.textContent = mkLoadedAt ? `updated ${relTime(new Date(mkLoadedAt).toISOString())}` : '';
}

async function refreshMarkets() {
  const btn = document.getElementById('btn-market-refresh');
  btn?.classList.add('is-spinning');
  mkTrendingCache = null;
  await loadWatchlistData();
  renderWatchlist();
  stampUpdated();
  if (marketTab !== 'watchlist') setMarketTab(marketTab);
  btn?.classList.remove('is-spinning');
}

async function initMarkets() {
  watchlist = await getWatchlist();
  renderWatchlist();

  document.querySelectorAll<HTMLButtonElement>('.market-tab').forEach(btn => {
    btn.addEventListener('click', () => setMarketTab(btn.dataset['mtab'] as typeof marketTab));
  });

  document.getElementById('mk-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('mk-add-input') as HTMLInputElement;
    const value = input.value;
    if (!value.trim()) return;
    input.value = '';
    await addTicker(value);
  });

  document.getElementById('btn-market-refresh')?.addEventListener('click', () => void refreshMarkets());

  // Earnings / news scope toggles
  document.querySelectorAll<HTMLButtonElement>('#mk-earn-seg .mk-seg-btn').forEach(b => {
    b.addEventListener('click', () => {
      mkEarnScope = b.dataset['escope'] as typeof mkEarnScope;
      document.querySelectorAll('#mk-earn-seg .mk-seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      void renderEarnings();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('#mk-news-seg .mk-seg-btn').forEach(b => {
    b.addEventListener('click', () => {
      mkNewsScope = b.dataset['nscope'] as typeof mkNewsScope;
      document.querySelectorAll('#mk-news-seg .mk-seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      void renderMarketNews();
    });
  });

  // Detail view
  document.getElementById('mk-detail-back')?.addEventListener('click', () => {
    document.getElementById('mk-detail')?.classList.add('hidden');
  });

  // Alert modal
  document.getElementById('mk-alert-close')?.addEventListener('click', closeAlertModal);
  document.getElementById('mk-alert-save')?.addEventListener('click', () => void saveAlertModal());
  document.getElementById('mk-alert-clear')?.addEventListener('click', () => {
    (document.getElementById('mk-alert-dir') as HTMLSelectElement).value = '';
    (document.getElementById('mk-alert-price') as HTMLInputElement).value = '';
    (document.getElementById('mk-alert-pct-dir') as HTMLSelectElement).value = '';
    (document.getElementById('mk-alert-pct') as HTMLInputElement).value = '';
  });
  document.querySelectorAll<HTMLButtonElement>('#mk-alert-pct-chips .mk-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      (document.getElementById('mk-alert-pct') as HTMLInputElement).value = chip.dataset['pct'] ?? '';
      const sel = document.getElementById('mk-alert-pct-dir') as HTMLSelectElement;
      if (!sel.value) sel.value = 'both';
    });
  });

  // Panel open/close
  // Slides up from the bottom: `hidden` gates display, `open` drives the transform
  const panel = document.getElementById('market-panel') as HTMLElement;
  document.getElementById('btn-market-toggle')?.addEventListener('click', async () => {
    const opening = !panel.classList.contains('open');
    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.toggle('open'));
    if (!opening) return;
    // Refetch if the data is more than five minutes old
    if (Date.now() - mkLoadedAt > 5 * 60 * 1000) {
      await loadWatchlistData();
      renderWatchlist();
    }
    stampUpdated();
  });
  document.getElementById('btn-market-close')?.addEventListener('click', () => panel.classList.remove('open'));

  // Alerts should fire even if the panel is never opened
  if (watchlist.length) {
    void loadWatchlistData().then(() => { renderWatchlist(); stampUpdated(); });
  }
}

// ─── News ─────────────────────────────────────────────────────────────────────

interface NewsItem {
  id: string | number;
  title: string;
  url: string;
  score: number;
  by: string;
  time: number;   // unix seconds
  comments: number;
  domain: string;
  image?: string;   // lead image, when the source provides one
  source?: string;  // human-readable publication name
  badge?: string;   // short tag shown on the card, e.g. a release version
  summary?: string; // one-line teaser for the hero card
  kind?: 'release'; // releases get their own denser card layout
}

const NEWS_CACHE_TTL = 30 * 60 * 1000;
let activeNewsTab = 'top';

function newsExtractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function newsTimeAgo(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function fetchHNTop(): Promise<NewsItem[]> {
  const r = await fetch(
    'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20',
    { signal: AbortSignal.timeout(7000) }
  );
  const data = await r.json();
  return (data.hits ?? []).map((h: any) => ({
    id: h.objectID,
    title: h.title ?? h.story_title ?? '',
    url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
    score: h.points ?? 0,
    by: h.author ?? '',
    time: Math.floor(new Date(h.created_at).getTime() / 1000),
    comments: h.num_comments ?? 0,
    domain: h.url ? newsExtractDomain(h.url) : 'news.ycombinator.com',
    source: h.url ? newsExtractDomain(h.url) : 'Hacker News',
  })).filter((i: NewsItem) => i.title);
}

async function fetchHNRising(): Promise<NewsItem[]> {
  const since = Math.floor(Date.now() / 1000) - 18 * 3600;
  const r = await fetch(
    `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points>50,created_at_i>${since}&hitsPerPage=20`,
    { signal: AbortSignal.timeout(7000) }
  );
  const data = await r.json();
  return (data.hits ?? []).map((h: any) => ({
    id: h.objectID,
    title: h.title ?? h.story_title ?? '',
    url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
    score: h.points ?? 0,
    by: h.author ?? '',
    time: Math.floor(new Date(h.created_at).getTime() / 1000),
    comments: h.num_comments ?? 0,
    domain: h.url ? newsExtractDomain(h.url) : 'news.ycombinator.com',
    source: h.url ? newsExtractDomain(h.url) : 'Hacker News',
  })).filter((i: NewsItem) => i.title);
}

async function fetchReddit(subreddits: string[]): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    subreddits.map(sub =>
      fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25&raw_json=1`, { signal: AbortSignal.timeout(7000) })
        .then(r => r.json())
    )
  );
  const all: NewsItem[] = [];
  results.forEach(res => {
    if (res.status !== 'fulfilled') return;
    const children: any[] = res.value?.data?.children ?? [];
    children.forEach(({ data: d }) => {
      if (!d.title || d.stickied || d.score < 10 || d.over_18) return;
      // raw_json=1 means these URLs arrive unescaped; prefer the largest preview
      const preview = d.preview?.images?.[0]?.source?.url as string | undefined;
      const thumb = typeof d.thumbnail === 'string' && d.thumbnail.startsWith('http') ? d.thumbnail : undefined;
      all.push({
        id: `r_${d.id}`,
        title: d.title,
        url: d.is_self ? `https://www.reddit.com${d.permalink}` : (d.url ?? `https://www.reddit.com${d.permalink}`),
        score: d.score ?? 0,
        by: d.author ?? '',
        time: Math.floor(d.created_utc),
        comments: d.num_comments ?? 0,
        domain: d.is_self ? `r/${d.subreddit}` : (d.domain ?? 'reddit.com'),
        image: preview ?? thumb,
        source: `r/${d.subreddit}`,
        summary: typeof d.selftext === 'string' ? d.selftext.slice(0, 180) : undefined,
      });
    });
  });
  const seen = new Set<string>();
  return all
    .filter(i => seen.has(i.id as string) ? false : (seen.add(i.id as string), true))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

async function fetchDevTo(tags: string): Promise<NewsItem[]> {
  const r = await fetch(
    `https://dev.to/api/articles?tags=${tags}&per_page=20&top=7`,
    { signal: AbortSignal.timeout(7000) }
  );
  const data: any[] = await r.json();
  return data.map(a => ({
    id: `dt_${a.id}`,
    title: a.title ?? '',
    url: a.url ?? `https://dev.to${a.path ?? ''}`,
    score: a.public_reactions_count ?? 0,
    by: a.user?.name ?? a.user?.username ?? '',
    time: Math.floor(new Date(a.published_at).getTime() / 1000),
    comments: a.comments_count ?? 0,
    domain: 'dev.to',
    image: a.cover_image ?? a.social_image ?? undefined,
    source: 'DEV',
    summary: a.description ?? undefined,
  })).filter(i => i.title);
}

function mergeNewsItems(...lists: Array<NewsItem[]>): NewsItem[] {
  const seen = new Set<string>();
  return lists.flat()
    .filter(i => seen.has(String(i.id)) ? false : (seen.add(String(i.id)), true))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

// ── Generic RSS / Atom reader ────────────────────────────────────────────────

function feedText(el: Element, ...names: string[]): string {
  for (const n of names) {
    const found = el.getElementsByTagName(n)[0]
      ?? el.getElementsByTagNameNS('*', n.split(':').pop()!)[0];
    const v = found?.textContent?.trim();
    // Many publishers double-encode ("&amp;#8217;"), so the XML parser hands back
    // the literal "&#8217;". Decode once here, at the single point every feed
    // string passes through; it is re-escaped before it reaches the DOM.
    if (v) return decodeEntities(v);
  }
  return '';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Pull a lead image out of a feed entry, trying the standard places in order. */
function feedImage(el: Element, html: string): string | undefined {
  const attrOf = (tag: string, attr = 'url') => {
    const nodes = [
      ...Array.from(el.getElementsByTagName(tag)),
      ...Array.from(el.getElementsByTagNameNS('*', tag.split(':').pop()!)),
    ];
    for (const n of nodes) {
      const v = n.getAttribute(attr);
      const type = n.getAttribute('type') ?? '';
      const medium = n.getAttribute('medium') ?? '';
      if (!v) continue;
      if (tag === 'enclosure' && type && !type.startsWith('image/')) continue;
      if (tag === 'media:content' && medium && medium !== 'image') continue;
      return v;
    }
    return undefined;
  };
  const found = attrOf('media:thumbnail') ?? attrOf('media:content') ?? attrOf('enclosure');
  if (found) return found;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1];
}

/** Cut a teaser at a word boundary so cards never end mid-word. */
function clampWords(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : max).trim() + '…';
}

interface FeedOpts { source: string; limit?: number; badge?: (title: string) => string | undefined }

async function fetchFeed(url: string, opts: FeedOpts): Promise<NewsItem[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`${opts.source}: HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error(`${opts.source}: malformed feed`);

  const entries = Array.from(doc.querySelectorAll('item, entry')).slice(0, opts.limit ?? 15);
  return entries.map((el) => {
    const title = feedText(el, 'title');
    // RSS puts the URL in <link> text; Atom puts it in a link element's href
    let link = feedText(el, 'link');
    if (!link) {
      const alt = Array.from(el.getElementsByTagName('link'))
        .find(l => (l.getAttribute('rel') ?? 'alternate') === 'alternate');
      link = alt?.getAttribute('href') ?? '';
    }
    const raw = feedText(el, 'content:encoded', 'content', 'description', 'summary');
    const dateStr = feedText(el, 'pubDate', 'published', 'updated', 'dc:date');
    const time = dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : Math.floor(Date.now() / 1000);
    return {
      id: feedText(el, 'guid', 'id') || link || title,
      title: title.replace(/\s+/g, ' ').trim(),
      url: link,
      score: 0,
      by: feedText(el, 'dc:creator', 'author', 'name'),
      time: Number.isFinite(time) ? time : Math.floor(Date.now() / 1000),
      comments: 0,
      domain: newsExtractDomain(link) || opts.source,
      image: feedImage(el, raw),
      source: opts.source,
      badge: opts.badge?.(title),
      summary: clampWords(stripHtml(raw), 190),
    } as NewsItem;
  }).filter(i => i.title && i.url);
}

/**
 * Run feeds concurrently, capped — the Releases tab alone pulls ~40 GitHub feeds and
 * firing them in one burst gets throttled. A dead feed must never take a tab down.
 */
async function fetchFeeds(feeds: Array<[string, FeedOpts]>, concurrency = 8): Promise<NewsItem[]> {
  const out: NewsItem[] = [];
  for (let i = 0; i < feeds.length; i += concurrency) {
    const batch = feeds.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(([u, o]) => fetchFeed(u, o)));
    settled.forEach((s, j) => {
      if (s.status === 'fulfilled') out.push(...s.value);
      else console.warn('[MonkTab] feed failed:', batch[j][0], s.reason);
    });
  }
  return out;
}

/** Newest-first, deduped — for feeds where recency matters more than score. */
function mergeByRecency(...lists: NewsItem[][]): NewsItem[] {
  const seen = new Set<string>();
  return lists.flat()
    .filter(i => {
      const key = i.url || String(i.id);
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .sort((a, b) => b.time - a.time)
    .slice(0, 30);
}

/** Feeds + Reddit, where either half failing still leaves a usable tab. */
async function feedsPlusReddit(feeds: Array<[string, FeedOpts]>, subs: string[]): Promise<NewsItem[]> {
  const [f, r] = await Promise.allSettled([fetchFeeds(feeds), fetchReddit(subs)]);
  return mergeByRecency(
    f.status === 'fulfilled' ? f.value : [],
    r.status === 'fulfilled' ? r.value : [],
  );
}

// Every feed below was fetched and parsed before being added here; anything that
// 403'd a plain client (CISA) or had no working feed (Anthropic, Meta AI) is out.

async function fetchAINews(): Promise<NewsItem[]> {
  return feedsPlusReddit([
    ['https://openai.com/news/rss.xml',                                          { source: 'OpenAI', limit: 8 }],
    ['https://huggingface.co/blog/feed.xml',                                     { source: 'Hugging Face', limit: 8 }],
    ['https://deepmind.google/blog/rss.xml',                                     { source: 'Google DeepMind', limit: 8 }],
    ['https://blog.google/technology/ai/rss/',                                   { source: 'Google AI' }],
    ['https://www.technologyreview.com/topic/artificial-intelligence/feed',      { source: 'MIT Tech Review' }],
    ['https://venturebeat.com/category/ai/feed/',                                { source: 'VentureBeat' }],
    ['https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',        { source: 'The Verge' }],
    ['https://simonwillison.net/atom/everything/',                               { source: 'Simon Willison', limit: 8 }],
  ], ['MachineLearning', 'LocalLLaMA']);
}

/** Framework and language news straight from the teams that ship them. */
async function fetchDevNews(): Promise<NewsItem[]> {
  return mergeByRecency(await fetchFeeds([
    ['https://spring.io/blog.atom',                          { source: 'Spring', limit: 6 }],
    ['https://devblogs.microsoft.com/typescript/feed/',      { source: 'TypeScript', limit: 6 }],
    ['https://react.dev/rss.xml',                            { source: 'React', limit: 6 }],
    ['https://blog.vuejs.org/feed.rss',                       { source: 'Vue', limit: 4 }],
    ['https://nextjs.org/feed.xml',                          { source: 'Next.js', limit: 4 }],
    ['https://nodejs.org/en/feed/blog.xml',                  { source: 'Node.js', limit: 6 }],
    ['https://go.dev/blog/feed.atom',                        { source: 'Go', limit: 4 }],
    ['https://blog.rust-lang.org/feed.xml',                  { source: 'Rust', limit: 4 }],
    ['https://deno.com/feed',                                { source: 'Deno', limit: 4 }],
    ['https://blog.python.org/feeds/posts/default',          { source: 'Python', limit: 4 }],
    ['https://developer.chrome.com/static/blog/feed.xml',    { source: 'Chrome', limit: 4 }],
    ['https://blog.jetbrains.com/feed/',                     { source: 'JetBrains', limit: 5 }],
    ['https://github.blog/feed/',                            { source: 'GitHub', limit: 5 }],
    ['https://stackoverflow.blog/feed/',                     { source: 'Stack Overflow', limit: 4 }],
    ['https://feed.infoq.com/',                              { source: 'InfoQ', limit: 8 }],
    ['https://thenewstack.io/feed/',                         { source: 'The New Stack', limit: 8 }],
  ]));
}

// Projects tracked on the Releases tab. GitHub publishes a public Atom feed of
// releases for every repo — no token, no rate limit worth worrying about.
// Ordered roughly frontend → backend → language → platform.
const RELEASE_REPOS: Array<[string, string]> = [
  ['facebook/react',                'React'],
  ['angular/angular',               'Angular'],
  ['vuejs/core',                    'Vue'],
  ['sveltejs/svelte',               'Svelte'],
  ['vercel/next.js',                'Next.js'],
  ['vitejs/vite',                   'Vite'],
  ['tailwindlabs/tailwindcss',      'Tailwind CSS'],
  ['storybookjs/storybook',         'Storybook'],
  ['microsoft/playwright',          'Playwright'],
  ['pnpm/pnpm',                     'pnpm'],
  ['electron/electron',             'Electron'],
  ['flutter/flutter',               'Flutter'],
  ['spring-projects/spring-boot',   'Spring Boot'],
  ['spring-projects/spring-framework', 'Spring Framework'],
  ['quarkusio/quarkus',             'Quarkus'],
  ['JetBrains/kotlin',              'Kotlin'],
  ['gradle/gradle',                 'Gradle'],
  ['nestjs/nest',                   'NestJS'],
  ['expressjs/express',             'Express'],
  ['fastapi/fastapi',               'FastAPI'],
  ['pallets/flask',                 'Flask'],
  ['django/django',                 'Django'],
  ['rails/rails',                   'Rails'],
  ['laravel/laravel',               'Laravel'],
  ['symfony/symfony',               'Symfony'],
  ['microsoft/TypeScript',          'TypeScript'],
  ['python/cpython',                'Python'],
  ['nodejs/node',                   'Node.js'],
  ['golang/go',                     'Go'],
  ['rust-lang/rust',                'Rust'],
  ['oven-sh/bun',                   'Bun'],
  ['denoland/deno',                 'Deno'],
  ['php/php-src',                   'PHP'],
  ['ruby/ruby',                     'Ruby'],
  ['dotnet/runtime',                '.NET'],
  ['postgres/postgres',             'PostgreSQL'],
  ['redis/redis',                   'Redis'],
  ['elastic/elasticsearch',         'Elasticsearch'],
  ['apache/kafka',                  'Kafka'],
  ['kubernetes/kubernetes',         'Kubernetes'],
  ['docker/compose',                'Docker Compose'],
  ['helm/helm',                     'Helm'],
  ['argoproj/argo-cd',              'Argo CD'],
  ['istio/istio',                   'Istio'],
  ['hashicorp/terraform',           'Terraform'],
  ['grafana/grafana',               'Grafana'],
  ['prometheus/prometheus',         'Prometheus'],
  ['ollama/ollama',                 'Ollama'],
];

/**
 * Pull a version out of a release title. Titles are messy and project-specific:
 * "v22.1.2", "[release-branch.go1.26] go1.26.6", "REL_18_6", "Spring Boot v3.4.1".
 */
function releaseVersion(title: string): string | undefined {
  // A bracketed branch name repeats an older version — drop it before matching
  const cleaned = title.replace(/\[[^\]]*\]/g, ' ');
  const dotted = cleaned.match(/\d+\.\d+(?:\.\d+)*(?:[-.][A-Za-z0-9]+)*/g);
  if (dotted) return dotted[dotted.length - 1];
  const underscored = cleaned.match(/(\d+)_(\d+)(?:_(\d+))?/);   // PostgreSQL's REL_18_6
  if (underscored) return underscored.slice(1).filter(Boolean).join('.');
  return undefined;
}

/**
 * Pre-releases flood the feed and aren't what a glanceable list is for. The markers
 * come welded to digits and underscores ("go1.27rc3", "REL_19_BETA3", "3.39.0.CR1",
 * "22.2.0-next.2"), so \b is useless here — bound on letters instead.
 */
const PRERELEASE_RE =
  /(?<![a-z])(rc|cr|alpha|beta|preview|nightly|canary|next|snapshot|pre|dev|insiders|milestone|m)[-._]?\d+(?![a-z])/i;

/** Changelog bodies are dense; strip the scaffolding GitHub's release notes repeat. */
function releaseNote(summary: string | undefined): string | undefined {
  const s = (summary ?? '')
    .replace(/\b(Commit|Commits|Description|Changelog|What's Changed|Full Changelog)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s.length > 12 ? s : undefined;
}

async function fetchReleasesNews(): Promise<NewsItem[]> {
  const items = await fetchFeeds(RELEASE_REPOS.map(([repo, name]) => [
    `https://github.com/${repo}/releases.atom`,
    { source: name, limit: 4, badge: releaseVersion } as FeedOpts,
  ]), 12);   // GitHub's atom feeds are quick; 48 repos in 4 rounds keeps the tab snappy

  // Filter on the *raw* tag before rewriting titles: "go1.27rc3" parses to a clean
  // "1.27" badge, so the badge alone would smuggle release candidates through.
  // No parsed version at all means a branch tag ("consolidation-step-7-green"),
  // which is not a release anyone wants to read about.
  const stable = items.filter(i =>
    i.badge && !PRERELEASE_RE.test(i.title) && !PRERELEASE_RE.test(i.badge));

  stable.forEach((i) => {
    // Use the org avatar rather than the release author's — it identifies the project
    const owner = i.url.match(/github\.com\/([^/]+)\//)?.[1];
    if (owner) i.image = `https://github.com/${owner}.png?size=120`;
    i.domain = 'github.com';
    i.kind = 'release';
    // Raw tags ("[release-branch.go1.26] go1.26.6") read as noise. The project name
    // plus its version is the whole story here.
    i.title = `${i.source} ${i.badge}`;
    i.summary = releaseNote(i.summary);
  });

  // Cap each project at two entries *before* the global slice — otherwise six
  // consecutive Python patch releases crowd every other project off the list.
  const perProject = new Map<string, number>();
  const balanced = stable
    .sort((a, b) => b.time - a.time)
    .filter((i) => {
      const n = (perProject.get(i.source ?? '') ?? 0) + 1;
      perProject.set(i.source ?? '', n);
      return n <= 2;
    });
  return mergeByRecency(balanced);
}

/** Breaches, threat actors, and the hacking beat. */
async function fetchSecurityNews(): Promise<NewsItem[]> {
  return feedsPlusReddit([
    ['https://feeds.feedburner.com/TheHackersNews',  { source: 'The Hacker News', limit: 10 }],
    ['https://www.bleepingcomputer.com/feed/',       { source: 'BleepingComputer', limit: 10 }],
    ['https://krebsonsecurity.com/feed/',            { source: 'Krebs on Security' }],
    ['https://www.darkreading.com/rss.xml',          { source: 'Dark Reading', limit: 10 }],
    ['https://therecord.media/feed',                 { source: 'The Record' }],
    ['https://feeds.feedburner.com/securityweek',    { source: 'SecurityWeek' }],
    ['https://www.schneier.com/feed/',               { source: 'Schneier on Security', limit: 5 }],
  ], ['netsec', 'cybersecurity']);
}

/** Named CVEs and live exploitation — separate from the news beat above. */
async function fetchVulnNews(): Promise<NewsItem[]> {
  return mergeByRecency(await fetchFeeds([
    ['https://cvefeed.io/rssfeed/latest.xml',        { source: 'CVE Feed', limit: 14 }],
    ['https://googleprojectzero.blogspot.com/feeds/posts/default', { source: 'Project Zero', limit: 5 }],
    ['https://seclists.org/rss/fulldisclosure.rss',  { source: 'Full Disclosure', limit: 8 }],
    ['https://www.exploit-db.com/rss.xml',           { source: 'Exploit-DB', limit: 10 }],
    ['https://blog.rapid7.com/rss/',                 { source: 'Rapid7', limit: 6 }],
    ['https://www.tenable.com/blog/feed',            { source: 'Tenable', limit: 6 }],
  ]));
}

async function fetchCloudNews(): Promise<NewsItem[]> {
  return feedsPlusReddit([
    ['https://aws.amazon.com/about-aws/whats-new/recent/feed/',            { source: 'AWS', limit: 12 }],
    ['https://cloudblog.withgoogle.com/rss/',                              { source: 'Google Cloud', limit: 10 }],
    ['https://www.microsoft.com/releasecommunications/api/v2/azure/rss',   { source: 'Azure', limit: 12 }],
    ['https://kubernetes.io/feed.xml',                                     { source: 'Kubernetes', limit: 6 }],
    ['https://www.cncf.io/feed/',                                          { source: 'CNCF', limit: 6 }],
    ['https://www.hashicorp.com/blog/feed.xml',                            { source: 'HashiCorp', limit: 6 }],
    ['https://blog.cloudflare.com/rss/',                                   { source: 'Cloudflare', limit: 6 }],
    ['https://www.docker.com/feed/',                                       { source: 'Docker', limit: 5 }],
  ], ['devops', 'kubernetes']);
}

/** Consumer and industry tech — the beat HN doesn't cover. */
async function fetchTechNews(): Promise<NewsItem[]> {
  return mergeByRecency(await fetchFeeds([
    ['https://feeds.arstechnica.com/arstechnica/technology-lab', { source: 'Ars Technica', limit: 10 }],
    ['https://www.theverge.com/rss/index.xml',                   { source: 'The Verge', limit: 10 }],
    ['https://techcrunch.com/feed/',                             { source: 'TechCrunch', limit: 10 }],
    ['https://www.wired.com/feed/rss',                           { source: 'Wired', limit: 8 }],
    ['https://www.engadget.com/rss.xml',                         { source: 'Engadget', limit: 8 }],
  ]));
}

/** General world news, from wire-style sources rather than one aggregator. */
async function fetchWorldNews(): Promise<NewsItem[]> {
  const items = await fetchFeeds([
    ['https://feeds.bbci.co.uk/news/world/rss.xml',   { source: 'BBC News', limit: 10 }],
    ['https://www.theguardian.com/world/rss',         { source: 'The Guardian', limit: 10 }],
    ['https://www.aljazeera.com/xml/rss/all.xml',     { source: 'Al Jazeera', limit: 10 }],
    ['https://feeds.npr.org/1001/rss.xml',            { source: 'NPR', limit: 8 }],
    ['https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', { source: 'Google News', limit: 10 }],
  ]);
  items.forEach((i) => { i.title = i.title.replace(/\s+-\s+[^-]{2,40}$/, ''); });
  return mergeByRecency(items);
}

function renderNewsSkeleton() {
  const feed = document.getElementById('news-feed')!;
  const card = `
    <div class="news-skeleton-card">
      <div class="sk-line sk-thumb"></div>
      <div class="sk-body">
        <div class="sk-line sk-title-1"></div>
        <div class="sk-line sk-title-2"></div>
        <div class="sk-line sk-meta"></div>
      </div>
    </div>`;
  feed.innerHTML = `
    <div class="news-skeleton-hero"></div>
    <div class="news-grid">${card.repeat(6)}</div>`;
}

function newsFaviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

function newsEscape(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** Stable hue per source, so a publication keeps the same accent colour every time. */
function newsHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/**
 * Many good sources (HN, Google News, AWS) ship no images at all. Rather than leave a
 * hole, draw a deterministic gradient tile branded with the source's favicon — it reads
 * as a design choice instead of a broken image.
 */
function newsThumb(item: NewsItem, cls: string): string {
  const domainClean = (item.domain ?? '').replace(/^r\//, '');
  const faviconDomain = item.domain?.startsWith('r/') ? 'reddit.com' : (domainClean || 'example.com');
  const hue = newsHue(item.source ?? item.domain ?? item.title);
  const fallback = `
    <span class="news-thumb-fallback" style="--h:${hue}">
      <img src="${newsFaviconUrl(faviconDomain)}" alt="" loading="lazy"
           onerror="this.style.visibility='hidden'">
    </span>`;
  if (!item.image) return `<div class="${cls}">${fallback}</div>`;
  // If the image 404s or is hotlink-blocked, swap in the gradient tile
  return `
    <div class="${cls}">
      ${fallback}
      <img class="news-thumb-img" src="${newsEscape(item.image)}" alt="" loading="lazy"
           onerror="this.remove()">
    </div>`;
}

function newsMeta(item: NewsItem): string {
  const scoreColor = item.score >= 300 ? '#fb923c' : item.score >= 100 ? '#a78bfa' : '#4ade80';
  return `
    <div class="news-card-meta">
      <span class="news-source">${newsEscape(item.source || item.domain || '')}</span>
      <span class="news-sep">·</span>
      <span class="news-time">${newsTimeAgo(item.time)}</span>
      ${item.score ? `<span class="news-score" style="color:${scoreColor};background:${scoreColor}1a">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        ${item.score}</span>` : ''}
      ${item.comments ? `<span class="news-comments">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        ${item.comments}</span>` : ''}
    </div>`;
}

/** Small source chip (favicon + name) used on hero and section headers. */
function newsSourceChip(item: NewsItem): string {
  const domainClean = (item.domain ?? '').replace(/^r\//, '');
  const favDomain = item.domain?.startsWith('r/') ? 'reddit.com' : (domainClean || 'example.com');
  return `
    <span class="news-chip">
      <img class="news-chip-ico" src="${newsFaviconUrl(favDomain)}" alt="" loading="lazy"
           onerror="this.style.display='none'">
      ${newsEscape(item.source || item.domain || '')}
    </span>`;
}

/**
 * Releases have no artwork and no headline worth a hero — what matters is
 * project, version, and what changed. Give them a purpose-built dense row.
 */
function releaseCard(item: NewsItem): string {
  const hue = newsHue(item.source ?? item.title);
  return `
    <a class="rel-card" href="${newsEscape(item.url)}" target="_blank" rel="noopener noreferrer"
       style="--h:${hue}">
      <span class="rel-logo">
        <img src="${newsEscape(item.image ?? '')}" alt="" loading="lazy"
             onerror="this.style.visibility='hidden'">
      </span>
      <span class="rel-body">
        <span class="rel-head">
          <span class="rel-name">${newsEscape(item.source ?? '')}</span>
          ${item.badge ? `<span class="rel-ver">${newsEscape(item.badge)}</span>` : ''}
        </span>
        ${item.summary ? `<span class="rel-note">${newsEscape(item.summary)}</span>` : ''}
        <span class="rel-time">${newsTimeAgo(item.time)}</span>
      </span>
    </a>`;
}

function renderNewsCards(items: NewsItem[]) {
  const feed = document.getElementById('news-feed')!;
  if (!items.length) {
    feed.innerHTML = '<p class="news-empty">No stories found.</p>';
    return;
  }

  if (items[0].kind === 'release') {
    feed.innerHTML = `
      <div class="news-section-head">
        <span class="news-section-title">Latest stable releases</span>
        <span class="news-section-sub">${items.length} across ${new Set(items.map(i => i.source)).size} projects</span>
      </div>
      <div class="rel-grid">${items.map(releaseCard).join('')}</div>`;
    return;
  }

  // Only run the image hero when there's a real photo — blown up 76px favicon tiles
  // look like a bug. Otherwise lead with a typographic hero, which reads as a choice.
  const heroIdx = items.findIndex(i => i.image);
  const hero = items[heroIdx === -1 ? 0 : heroIdx];
  const rest = items.filter(i => i !== hero);
  const heroHasArt = Boolean(hero.image);

  const card = (item: NewsItem) => `
    <a class="news-card" href="${newsEscape(item.url)}" target="_blank" rel="noopener noreferrer">
      ${newsThumb(item, 'news-card-thumb')}
      <div class="news-card-text">
        <div class="news-card-title">${newsEscape(item.title)}</div>
        ${item.summary ? `<div class="news-card-summary">${newsEscape(item.summary)}</div>` : ''}
        ${newsMeta(item)}
      </div>
      ${item.badge ? `<span class="news-badge">${newsEscape(item.badge)}</span>` : ''}
    </a>`;

  const heroHue = newsHue(hero.source ?? hero.domain ?? hero.title);
  feed.innerHTML = `
    <a class="news-hero ${heroHasArt ? '' : 'news-hero--text'}" style="--h:${heroHue}"
       href="${newsEscape(hero.url)}" target="_blank" rel="noopener noreferrer">
      ${heroHasArt ? newsThumb(hero, 'news-hero-thumb') : ''}
      <div class="news-hero-overlay">
        <div class="news-hero-top">
          <span class="news-hero-kicker">Top story</span>
          ${newsSourceChip(hero)}
        </div>
        <div class="news-hero-title">${newsEscape(hero.title)}</div>
        ${hero.summary ? `<div class="news-hero-summary">${newsEscape(hero.summary)}</div>` : ''}
        ${newsMeta(hero)}
      </div>
    </a>
    <div class="news-grid">${rest.map(card).join('')}</div>`;
}

function setNewsSpinner(visible: boolean) {
  document.getElementById('news-refresh-spinner')?.classList.toggle('hidden', !visible);
}

async function loadNews(tab: string, force = false) {
  const cacheKey = `mt_news_${tab}`;
  if (!force) {
    const cached = await chrome.storage.local.get(cacheKey);
    const entry = cached[cacheKey] as { items: NewsItem[]; cachedAt: number } | undefined;
    if (entry && Date.now() - entry.cachedAt < NEWS_CACHE_TTL) {
      renderNewsCards(entry.items);
      return;
    }
  }
  renderNewsSkeleton();
  setNewsSpinner(true);
  try {
    let items: NewsItem[];
    if (tab === 'top') items = await fetchHNTop();
    else if (tab === 'rising') items = await fetchHNRising();
    else if (tab === 'ai') items = await fetchAINews();
    else if (tab === 'dev') items = await fetchDevNews();
    else if (tab === 'releases') items = await fetchReleasesNews();
    else if (tab === 'security') items = await fetchSecurityNews();
    else if (tab === 'vulns') items = await fetchVulnNews();
    else if (tab === 'tech') items = await fetchTechNews();
    else if (tab === 'world') items = await fetchWorldNews();
    else items = await fetchCloudNews();
    renderNewsCards(items);
    await chrome.storage.local.set({ [cacheKey]: { items, cachedAt: Date.now() } });
  } catch {
    const feed = document.getElementById('news-feed')!;
    feed.innerHTML = '<p class="news-error">Could not load stories. Check your connection.</p>';
  } finally {
    setNewsSpinner(false);
  }
}

function initNews() {
  const panel = document.getElementById('news-panel')!;

  document.getElementById('btn-news-toggle')?.addEventListener('click', () => {
    const opening = !panel.classList.contains('open');
    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.toggle('open'));
    if (opening) loadNews(activeNewsTab);
  });

  document.getElementById('btn-news-close')?.addEventListener('click', () => {
    panel.classList.remove('open');
  });

  document.getElementById('btn-news-refresh')?.addEventListener('click', () => {
    loadNews(activeNewsTab, true);
  });

  const feedEl = document.getElementById('news-feed')!;
  panel.querySelectorAll<HTMLButtonElement>('.news-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset['ntab']!;
      if (tab === activeNewsTab) return;
      activeNewsTab = tab;
      panel.querySelectorAll('.news-tab').forEach(t => t.classList.remove('news-tab--active'));
      btn.classList.add('news-tab--active');
      feedEl.dataset['newsActive'] = tab;
      loadNews(tab);
    });
  });
}

// ─── Notes ────────────────────────────────────────────────────────────────────

function mdEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Only ever emit links we'd be willing to click — no javascript:/data: hrefs. */
function mdSafeUrl(u: string): string {
  return /^(https?:|mailto:|#|\/)/i.test(u.trim()) ? mdEsc(u.trim()) : '#';
}

/** Emphasis run — kept separate so it can be applied to link text without
 *  touching the HTML attributes an anchor is made of. */
function mdEmph(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/(^|[^\w*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^\w_])_([^_\n]+)_/g, '$1<em>$2</em>');
}

/**
 * Inline markdown. Code spans and finished anchors are lifted out behind sentinels
 * before emphasis runs — otherwise the underscore in `target="_blank"` (and any URL
 * containing one) gets eaten and turned into an <em>.
 */
function mdInline(src: string): string {
  const codes: string[] = [];
  const tags: string[] = [];
  const stash = (html: string) => `\u0001${tags.push(html) - 1}\u0001`;
  const anchor = (url: string, text: string) =>
    stash(`<a href="${mdSafeUrl(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`);

  let s = src.replace(/`([^`]+)`/g, (_m, c: string) => `\u0000${codes.push(c) - 1}\u0000`);
  s = mdEsc(s);
  s = s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) => anchor(u, mdEmph(t)))
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, pre: string, u: string) => pre + anchor(u, u));
  s = mdEmph(s);
  return s
    .replace(/\u0001(\d+)\u0001/g, (_m, i: string) => tags[+i])
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<code>${mdEsc(codes[+i])}</code>`);
}

/**
 * Line-by-line block parser. The previous chained-regex version mangled anything
 * nested and had no notion of fenced code; this walks the document once, keeping a
 * stack of open lists so indentation nests properly.
 *
 * Task items carry `data-line` — the preview can then toggle a checkbox by
 * rewriting that exact source line rather than diffing the rendered output.
 */
function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  const listStack: Array<{ tag: 'ul' | 'ol'; indent: number }> = [];
  let para: string[] = [];
  let quote: string[] = [];
  let fence: string[] | null = null;

  const closeLists = (toIndent = -1) => {
    while (listStack.length && listStack[listStack.length - 1].indent > toIndent) {
      out.push(`</${listStack.pop()!.tag}>`);
    }
  };
  const flushPara = () => {
    if (para.length) { out.push(`<p>${para.map(mdInline).join('<br>')}</p>`); para = []; }
  };
  const flushQuote = () => {
    if (quote.length) { out.push(`<blockquote>${quote.map(mdInline).join('<br>')}</blockquote>`); quote = []; }
  };
  const flushAll = (toIndent = -1) => { flushPara(); flushQuote(); closeLists(toIndent); };

  lines.forEach((raw, idx) => {
    if (fence) {
      if (/^\s*```/.test(raw)) { out.push(`<pre><code>${mdEsc(fence.join('\n'))}</code></pre>`); fence = null; }
      else fence.push(raw);
      return;
    }
    if (/^\s*```/.test(raw)) { flushAll(); fence = []; return; }

    if (!raw.trim()) { flushAll(); return; }

    const heading = raw.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      out.push(`<h${level}>${mdInline(heading[2])}</h${level}>`);
      return;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(raw)) { flushAll(); out.push('<hr>'); return; }

    const bq = raw.match(/^\s*>\s?(.*)$/);
    if (bq) { flushPara(); closeLists(); quote.push(bq[1]); return; }
    flushQuote();

    const item = raw.match(/^(\s*)([-*+]|(\d+)[.)])\s+(.*)$/);
    if (item) {
      flushPara();
      const indent = item[1].length;
      const tag: 'ul' | 'ol' = item[3] ? 'ol' : 'ul';
      closeLists(indent);
      const top = listStack[listStack.length - 1];
      if (!top || top.indent < indent) { listStack.push({ tag, indent }); out.push(`<${tag}>`); }
      else if (top.tag !== tag) {
        out.push(`</${listStack.pop()!.tag}>`);
        listStack.push({ tag, indent });
        out.push(`<${tag}>`);
      }

      const task = item[4].match(/^\[([ xX])\]\s*(.*)$/);
      if (task) {
        const done = task[1].toLowerCase() === 'x';
        out.push(
          `<li class="md-task${done ? ' done' : ''}" data-line="${idx}">` +
          `<span class="md-cb">✓</span><span class="md-txt">${mdInline(task[2])}</span></li>`);
      } else {
        out.push(`<li>${mdInline(item[4])}</li>`);
      }
      return;
    }

    closeLists();
    para.push(raw.trim());
  });

  if (fence) out.push(`<pre><code>${mdEsc((fence as string[]).join('\n'))}</code></pre>`);
  flushAll();
  return out.join('\n');
}

/** "just now" / "14:32" / "Yesterday" / "12 Aug" — as short as the age allows. */
function noteStamp(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const d = new Date(ts);
  if (ts >= startOfToday.getTime()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (ts >= startOfToday.getTime() - 86400000) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function noteBucket(ts: number): string {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (ts >= startOfToday.getTime()) return 'Today';
  if (ts >= startOfToday.getTime() - 86400000) return 'Yesterday';
  if (ts >= startOfToday.getTime() - 7 * 86400000) return 'Previous 7 days';
  return 'Older';
}

async function initNotes() {
  const panel      = document.getElementById('notes-panel')       as HTMLElement;
  const textarea   = document.getElementById('notes-textarea')    as HTMLTextAreaElement;
  const titleInput = document.getElementById('notes-title-input') as HTMLInputElement;
  const listEl     = document.getElementById('notes-list')        as HTMLElement;
  const searchEl   = document.getElementById('notes-search')      as HTMLInputElement;
  const searchClear= document.getElementById('notes-search-clear')as HTMLElement;
  const countEl    = document.getElementById('notes-count')       as HTMLElement;
  const wordCountEl= document.getElementById('notes-wordcount')   as HTMLElement;
  const readTimeEl = document.getElementById('notes-readtime')    as HTMLElement;
  const editedEl   = document.getElementById('notes-edited')      as HTMLElement;
  const saveStatusEl = document.getElementById('notes-save-status') as HTMLElement;
  const saveIconEl   = document.getElementById('notes-save-icon')   as HTMLElement;
  const previewEl  = document.getElementById('notes-preview')     as HTMLElement;
  const pinBtn     = document.getElementById('btn-notes-pin')     as HTMLButtonElement;
  const previewBtn = document.getElementById('btn-notes-preview') as HTMLButtonElement;
  const toastEl    = document.getElementById('notes-toast')       as HTMLElement;
  const toastText  = document.getElementById('notes-toast-text')  as HTMLElement;
  const toastUndo  = document.getElementById('notes-toast-undo')  as HTMLButtonElement;

  const newNote = (): Note => ({
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: '', content: '', createdAt: Date.now(), updatedAt: Date.now(),
  });

  let notes: Note[] = await getNotesList();
  if (notes.length === 0) {
    notes = [{ ...newNote(), title: 'My Notes' }];
    await saveNotesList(notes);
  }
  let activeNoteId = notes[0].id;
  let query = '';
  let previewActive = false;

  const active = () => notes.find(n => n.id === activeNoteId);
  /** Pinned first, then most-recently-edited — the order people actually expect. */
  const ordered = () => [...notes].sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);

  function matches(n: Note): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
  }

  /** Show text around the first hit, so a search result explains itself. */
  function snippetFor(n: Note): string {
    const body = n.content.replace(/\s+/g, ' ').trim();
    if (!body) return 'Empty note';
    const i = query ? body.toLowerCase().indexOf(query.toLowerCase()) : -1;
    if (i < 0) return body.slice(0, 90);
    const from = Math.max(0, i - 24);
    return (from ? '…' : '') + body.slice(from, from + 90);
  }

  function highlight(text: string): string {
    const esc = newsEscape(text);
    if (!query) return esc;
    const q = newsEscape(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return esc.replace(new RegExp(q, 'gi'), m => `<mark>${m}</mark>`);
  }

  function renderList() {
    const visible = ordered().filter(matches);
    countEl.textContent = String(notes.length);
    searchClear.classList.toggle('hidden', !query);

    if (!visible.length) {
      listEl.innerHTML = `<div class="nt-empty">Nothing matches<br>“${newsEscape(query)}”</div>`;
      return;
    }

    let html = '';
    let group = '';
    visible.forEach((n) => {
      const g = n.pinned ? 'Pinned' : noteBucket(n.updatedAt);
      if (g !== group) { group = g; html += `<div class="nt-group">${g}</div>`; }
      html += `
        <button class="nt-item${n.id === activeNoteId ? ' active' : ''}" data-id="${n.id}">
          <span class="nt-item-top">
            <span class="nt-item-title">${highlight(n.title || 'Untitled')}</span>
            ${n.pinned ? '<span class="nt-item-pin">●</span>' : ''}
          </span>
          <span class="nt-item-snippet">${highlight(snippetFor(n))}</span>
          <span class="nt-item-time">${noteStamp(n.updatedAt)}</span>
        </button>`;
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll<HTMLElement>('.nt-item').forEach((el) => {
      el.addEventListener('click', () => switchNote(el.dataset['id']!));
    });
  }

  function loadActiveNote() {
    const note = active();
    if (!note) return;
    titleInput.value = note.title;
    textarea.value = note.content;
    pinBtn.classList.toggle('active', Boolean(note.pinned));
    pinBtn.title = note.pinned ? 'Unpin note' : 'Pin note';
    if (previewActive) previewEl.innerHTML = renderMarkdown(textarea.value);
    updateStats();
  }

  function switchNote(id: string) {
    activeNoteId = id;
    renderList();
    loadActiveNote();
    if (!previewActive) setTimeout(() => textarea.focus(), 50);
  }

  function updateStats() {
    const text = textarea.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    wordCountEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    readTimeEl.textContent = `${Math.max(1, Math.round(words / 220))} min read`;
    const note = active();
    editedEl.textContent = note && note.content ? `edited ${noteStamp(note.updatedAt)}` : 'new note';
  }

  /** An untitled note names itself from its first line, so the list is never blank. */
  function firstLineTitle(content: string): string {
    const line = content.split('\n').find(l => l.trim());
    if (!line) return 'Untitled';
    return line.replace(/^#+\s*/, '').replace(/[*_`>[\]-]/g, '').trim().slice(0, 60) || 'Untitled';
  }

  let saveTimer: ReturnType<typeof setTimeout>;
  function setSaveStatus(state: 'saving' | 'saved') {
    saveStatusEl.className = `notes-save-status ${state}`;
    saveIconEl.innerHTML = state === 'saving'
      ? `<circle cx="12" cy="12" r="9" stroke-dasharray="56" stroke-dashoffset="14" stroke-linecap="round"/>`
      : `<polyline points="20 6 9 17 4 12"/>`;
    saveStatusEl.lastChild!.textContent = state === 'saving' ? ' Saving…' : ' Saved';
  }

  async function persist() {
    const note = active();
    if (!note) return;
    note.content = textarea.value;
    note.title = titleInput.value.trim() || firstLineTitle(textarea.value);
    note.updatedAt = Date.now();
    await saveNotesList(notes);
    renderList();
    updateStats();
  }

  function queueSave() {
    setSaveStatus('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => { await persist(); setSaveStatus('saved'); }, 500);
  }

  textarea.addEventListener('input', () => { updateStats(); queueSave(); });
  titleInput.addEventListener('input', queueSave);

  // ── Search ──────────────────────────────────────────────────────────────────
  searchEl.addEventListener('input', () => { query = searchEl.value.trim(); renderList(); });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchEl.value = ''; query = ''; renderList(); textarea.focus(); }
    if (e.key === 'Enter') {
      const first = listEl.querySelector<HTMLElement>('.nt-item');
      if (first) switchNote(first.dataset['id']!);
    }
  });
  searchClear.addEventListener('click', () => { searchEl.value = ''; query = ''; renderList(); searchEl.focus(); });

  // ── Format toolbar ──────────────────────────────────────────────────────────
  function applyFmt(fmt: string) {
    const s = textarea.selectionStart, e = textarea.selectionEnd;
    const selected = textarea.value.slice(s, e);
    const before = textarea.value.slice(0, s);
    const after  = textarea.value.slice(e);
    // Line prefixes toggle: applying the same one twice takes it back off
    const linePrefix = (p: string, text: string) =>
      text.split('\n').map(l => l.startsWith(p) ? l.slice(p.length) : p + l).join('\n');

    let replacement = selected;
    let cursorOffset = 0;
    switch (fmt) {
      case 'bold':   replacement = `**${selected || 'bold text'}**`; cursorOffset = selected ? 0 : -2; break;
      case 'italic': replacement = `_${selected || 'italic text'}_`; cursorOffset = selected ? 0 : -1; break;
      case 'strike': replacement = `~~${selected || 'struck'}~~`;    cursorOffset = selected ? 0 : -2; break;
      case 'code':   replacement = `\`${selected || 'code'}\``;      cursorOffset = selected ? 0 : -1; break;
      case 'fence':  replacement = `\n\`\`\`\n${selected || 'code'}\n\`\`\`\n`; break;
      case 'h1':     replacement = linePrefix('# ',  selected || 'Heading'); break;
      case 'h2':     replacement = linePrefix('## ', selected || 'Heading'); break;
      case 'quote':  replacement = linePrefix('> ',  selected || 'Quote'); break;
      case 'ul':     replacement = linePrefix('- ',  selected || 'List item'); break;
      case 'task':   replacement = linePrefix('- [ ] ', selected || 'Task'); break;
      case 'ol':     replacement = (selected || 'List item').split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n'); break;
      case 'link':   replacement = `[${selected || 'text'}](url)`;   cursorOffset = -1; break;
      case 'hr':     replacement = `\n---\n`; break;
    }
    textarea.value = before + replacement + after;
    textarea.selectionStart = textarea.selectionEnd = s + replacement.length + cursorOffset;
    textarea.focus();
    updateStats();
    queueSave();
  }
  document.querySelectorAll<HTMLButtonElement>('.notes-fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => applyFmt(btn.dataset['fmt']!));
  });

  // ── Editor keys ─────────────────────────────────────────────────────────────
  textarea.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'b') { e.preventDefault(); applyFmt('bold'); return; }
    if (mod && e.key === 'i') { e.preventDefault(); applyFmt('italic'); return; }
    if (mod && e.key === 'k') { e.preventDefault(); applyFmt('link'); return; }

    const pos = textarea.selectionStart;
    const lineStart = textarea.value.lastIndexOf('\n', pos - 1) + 1;
    const line = textarea.value.slice(lineStart, pos);

    // Enter continues the list you're in; on an empty item it ends the list instead
    if (e.key === 'Enter' && !e.shiftKey && textarea.selectionStart === textarea.selectionEnd) {
      const m = line.match(/^(\s*)([-*+] \[[ xX]\]|[-*+]|(\d+)[.)])\s+(.*)$/);
      if (m) {
        e.preventDefault();
        if (!m[4]) {
          textarea.setRangeText('', lineStart, pos, 'end');
        } else {
          const marker = m[3] ? `${+m[3] + 1}. ` : `${m[2].replace(/\[[xX]\]/, '[ ]')} `;
          textarea.setRangeText(`\n${m[1]}${marker}`, pos, pos, 'end');
        }
        updateStats();
        queueSave();
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const from = textarea.selectionStart, to = textarea.selectionEnd;
      if (e.shiftKey) {                       // outdent the current line
        if (textarea.value.slice(lineStart, lineStart + 2) === '  ') {
          textarea.setRangeText('', lineStart, lineStart + 2, 'end');
          textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, from - 2);
        }
      } else {
        textarea.setRangeText('  ', from, to, 'end');
      }
      queueSave();
    }
  });

  // ── Preview, with checkboxes that write back ────────────────────────────────
  function setPreview(on: boolean) {
    previewActive = on;
    previewBtn.classList.toggle('active', on);
    previewEl.classList.toggle('hidden', !on);
    textarea.classList.toggle('hidden', on);
    if (on) previewEl.innerHTML = renderMarkdown(textarea.value);
    else textarea.focus();
  }
  previewBtn.addEventListener('click', () => setPreview(!previewActive));

  previewEl.addEventListener('click', (e) => {
    const cb = (e.target as HTMLElement).closest('.md-cb');
    if (!cb) return;
    const lineNo = (cb.closest('.md-task') as HTMLElement | null)?.dataset['line'];
    if (lineNo === undefined) return;
    // Rewrite only that source line, then re-render — note and preview stay in sync
    const lines = textarea.value.split('\n');
    lines[+lineNo] = lines[+lineNo].replace(/\[([ xX])\]/, (_m, c: string) => c === ' ' ? '[x]' : '[ ]');
    textarea.value = lines.join('\n');
    previewEl.innerHTML = renderMarkdown(textarea.value);
    queueSave();
  });

  // ── Pin ─────────────────────────────────────────────────────────────────────
  pinBtn.addEventListener('click', async () => {
    const note = active();
    if (!note) return;
    note.pinned = !note.pinned;
    await saveNotesList(notes);
    pinBtn.classList.toggle('active', note.pinned);
    pinBtn.title = note.pinned ? 'Unpin note' : 'Pin note';
    renderList();
  });

  // ── New ─────────────────────────────────────────────────────────────────────
  document.getElementById('btn-notes-new')?.addEventListener('click', async () => {
    const note = newNote();
    notes.push(note);
    await saveNotesList(notes);
    searchEl.value = '';
    query = '';
    switchNote(note.id);
    titleInput.focus();
  });

  // ── Delete, undoable — a confirm() dialog for a note is heavier than the risk ─
  let undoTimer = 0;
  function showToast(text: string, onUndo: () => void) {
    toastText.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(undoTimer);
    const hide = () => { toastEl.classList.add('hidden'); toastUndo.removeEventListener('click', handler); };
    const handler = () => { onUndo(); hide(); };
    toastUndo.addEventListener('click', handler);
    undoTimer = window.setTimeout(hide, 6000);
  }

  document.getElementById('btn-notes-delete')?.addEventListener('click', async () => {
    const idx = notes.findIndex(n => n.id === activeNoteId);
    if (idx < 0) return;
    const [removed] = notes.splice(idx, 1);
    if (notes.length === 0) notes.push(newNote());
    await saveNotesList(notes);
    activeNoteId = ordered()[0].id;
    renderList();
    loadActiveNote();
    showToast(`Deleted “${removed.title || 'Untitled'}”`, async () => {
      notes.splice(Math.min(idx, notes.length), 0, removed);
      await saveNotesList(notes);
      switchNote(removed.id);
    });
  });

  // ── Copy / export ───────────────────────────────────────────────────────────
  document.getElementById('btn-notes-copy')?.addEventListener('click', async () => {
    if (!textarea.value) return;
    await navigator.clipboard.writeText(textarea.value);
    const btn = document.getElementById('btn-notes-copy') as HTMLButtonElement;
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  });

  document.getElementById('btn-notes-export')?.addEventListener('click', () => {
    const note = active();
    if (!note) return;
    const body = `# ${note.title || 'Untitled'}\n\n${note.content}`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(note.title || 'note').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'note'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Open / close ────────────────────────────────────────────────────────────
  document.getElementById('btn-notes-toggle')?.addEventListener('click', () => {
    panel.classList.remove('hidden');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      renderList();
      setTimeout(() => textarea.focus(), 280);
    }
  });
  document.getElementById('btn-notes-close')?.addEventListener('click', () => panel.classList.remove('open'));

  // Panel-scoped shortcuts: Ctrl+F search, Ctrl+Shift+P preview, Ctrl+Alt+N new
  panel.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'f') { e.preventDefault(); searchEl.focus(); searchEl.select(); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setPreview(!previewActive); }
    if (mod && e.altKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      (document.getElementById('btn-notes-new') as HTMLButtonElement).click();
    }
    if (e.key === 'Escape' && previewActive) { e.preventDefault(); setPreview(false); }
  });

  renderList();
  loadActiveNote();
  // Keep the relative timestamps in the list honest without a full re-render loop
  setInterval(() => { if (panel.classList.contains('open')) renderList(); }, 60000);
}

// ─── Countdowns ───────────────────────────────────────────────────────────────

let countdowns: Countdown[] = [];

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function renderCountdowns() {
  const list = document.getElementById('countdowns-list') as HTMLElement;
  list.innerHTML = '';
  countdowns.forEach((cd) => {
    const days = daysUntil(cd.date);
    const card = document.createElement('div');
    card.className = 'countdown-card';
    const daysEl = document.createElement('div');
    daysEl.className = 'cd-days';
    daysEl.textContent = days > 0 ? `${days}d` : days === 0 ? 'Today!' : 'Past';
    const labelEl = document.createElement('div');
    labelEl.className = 'cd-label';
    labelEl.textContent = cd.label;
    const del = document.createElement('button');
    del.className = 'cd-del'; del.textContent = '✕';
    del.addEventListener('click', () => {
      countdowns = countdowns.filter(c => c.id !== cd.id);
      saveCountdowns(countdowns); renderCountdowns();
    });
    card.append(daysEl, labelEl, del);
    list.appendChild(card);
  });
}

async function initCountdowns() {
  countdowns = await getCountdowns();
  renderCountdowns();
  const form = document.getElementById('countdown-form') as HTMLFormElement;
  const labelInput = document.getElementById('cd-label') as HTMLInputElement;
  const dateInput = document.getElementById('cd-date') as HTMLInputElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = labelInput.value.trim(); const date = dateInput.value;
    if (!label || !date) return;
    countdowns.push({ id: Date.now().toString(), label, date });
    saveCountdowns(countdowns); renderCountdowns();
    labelInput.value = ''; dateInput.value = '';
  });
}

// ─── Ask AI ───────────────────────────────────────────────────────────────────
//
// A launcher, not a client: MonkTab never sends the prompt anywhere itself, it
// opens the assistant's own site with the question in the URL. Two of them ignore
// that parameter, so those get the prompt on the clipboard instead.

interface AiProvider {
  id: string;
  name: string;
  by: string;
  icon: string;
  /** `%s` is replaced with the encoded prompt. Absent = the site cannot prefill. */
  url?: string;
  /** Where to land when the site cannot take a prompt in the URL. */
  home?: string;
}

const AI_PROVIDERS: AiProvider[] = [
  { id: 'claude',     name: 'Claude',     by: 'Anthropic',  icon: '🤖', url: 'https://claude.ai/new?q=%s' },
  { id: 'chatgpt',    name: 'ChatGPT',    by: 'OpenAI',     icon: '✨', url: 'https://chatgpt.com/?q=%s' },
  { id: 'perplexity', name: 'Perplexity', by: 'Perplexity', icon: '🔎', url: 'https://www.perplexity.ai/search/new?q=%s' },
  { id: 'grok',       name: 'Grok',       by: 'xAI',        icon: '⚡', url: 'https://grok.com/?q=%s' },
  { id: 'duck',       name: 'Duck.ai',    by: 'DuckDuckGo', icon: '🦆', url: 'https://duck.ai/chat?q=%s' },
  // These two drop the query parameter, so the prompt goes to the clipboard
  { id: 'gemini',     name: 'Gemini',     by: 'Google',     icon: '♊', home: 'https://gemini.google.com/app' },
  { id: 'copilot',    name: 'Copilot',    by: 'Microsoft',  icon: '🧭', home: 'https://copilot.microsoft.com/' },
];

interface AiTemplate {
  cat: string;
  title: string;
  body: string;
}

/**
 * Placeholders are wrapped in {{…}}; inserting a template selects the first one
 * so it can be typed straight over.
 */
const AI_TEMPLATES: AiTemplate[] = [
  { cat: 'Code', title: 'Explain code', body: 'Explain what this code does, step by step, and call out anything surprising:\n\n```\n{{paste your code}}\n```' },
  { cat: 'Code', title: 'Review for bugs', body: 'Review this code for bugs, edge cases and security issues. Be specific about how each one fails:\n\n```\n{{paste your code}}\n```' },
  { cat: 'Code', title: 'Write tests', body: 'Write thorough unit tests for this code, including edge cases and failure paths. Use {{testing framework}}:\n\n```\n{{paste your code}}\n```' },
  { cat: 'Code', title: 'Refactor', body: 'Refactor this for readability without changing behaviour. Explain each change and why:\n\n```\n{{paste your code}}\n```' },
  { cat: 'Code', title: 'Convert language', body: 'Convert this from {{language A}} to {{language B}}, keeping it idiomatic in the target language:\n\n```\n{{paste your code}}\n```' },
  { cat: 'Code', title: 'Add comments', body: 'Add clear comments to this code. Explain why, not what — skip anything obvious from the code itself:\n\n```\n{{paste your code}}\n```' },

  { cat: 'Debug', title: 'Explain this error', body: 'I am getting this error. Explain what it means, the likely cause, and how to fix it:\n\n```\n{{paste the error or stack trace}}\n```' },
  { cat: 'Debug', title: 'Why is this slow?', body: 'This is slower than I expect. Walk through the likely bottlenecks and how to measure them:\n\n```\n{{paste your code}}\n```\n\nContext: {{data size, environment}}' },
  { cat: 'Debug', title: 'Rubber duck', body: 'I am stuck on a problem. Ask me clarifying questions one at a time until you understand it well enough to suggest what to try next.\n\nThe problem: {{describe it}}' },
  { cat: 'Debug', title: 'Failing test', body: 'This test fails and I do not understand why. Explain what the test asserts, what actually happens, and where the mismatch comes from.\n\nTest:\n```\n{{paste the test}}\n```\n\nOutput:\n```\n{{paste the failure}}\n```' },

  { cat: 'DevOps', title: 'Explain this config', body: 'Explain what this configuration does, line by line, and flag anything risky for production:\n\n```\n{{paste your YAML / HCL / Dockerfile}}\n```' },
  { cat: 'DevOps', title: 'Write a Dockerfile', body: 'Write a production-ready multi-stage Dockerfile for a {{stack}} app. Optimise for image size and build cache, and explain each stage.' },
  { cat: 'DevOps', title: 'Kubernetes manifest', body: 'Write Kubernetes manifests for {{describe the service}}. Include resource limits, probes and a sensible rollout strategy, and explain the choices.' },
  { cat: 'DevOps', title: 'CI pipeline', body: 'Write a {{GitHub Actions / GitLab CI}} pipeline that {{build, test, deploy steps}}. Keep it fast and explain the caching.' },
  { cat: 'DevOps', title: 'Incident postmortem', body: 'Help me write a blameless postmortem. Ask me for what you need, then draft it with timeline, impact, root cause, and action items.\n\nWhat happened: {{summary}}' },

  { cat: 'Data', title: 'Write SQL', body: 'Write a SQL query that {{what you want}}.\n\nSchema:\n```\n{{paste the relevant tables}}\n```\n\nExplain the query and any performance concerns.' },
  { cat: 'Data', title: 'Optimise a query', body: 'This query is slow. Explain the likely plan, what to index, and how to rewrite it:\n\n```sql\n{{paste your query}}\n```' },
  { cat: 'Data', title: 'Write a regex', body: 'Write a regex that matches {{describe what to match}}. Explain each part, and give examples that match and that deliberately do not.' },
  { cat: 'Data', title: 'Explain this regex', body: 'Explain this regex piece by piece, and give examples of what it does and does not match:\n\n```\n{{paste the regex}}\n```' },

  { cat: 'Write', title: 'Commit message', body: 'Write a clear commit message for this change. Subject under 72 characters, then a body explaining why:\n\n```diff\n{{paste your diff}}\n```' },
  { cat: 'Write', title: 'Pull request', body: 'Write a pull request description for this change: what it does, why, how to test it, and anything reviewers should look at closely.\n\n```diff\n{{paste your diff}}\n```' },
  { cat: 'Write', title: 'Document this', body: 'Write documentation for this. Include what it is for, a usage example, and the gotchas:\n\n```\n{{paste your code}}\n```' },
  { cat: 'Write', title: 'Reply to this', body: 'Draft a reply to this message. Tone: {{direct and friendly}}. Keep it short.\n\n```\n{{paste the message}}\n```' },
  { cat: 'Write', title: 'Summarise', body: 'Summarise this. Give me the three things that actually matter, then the detail:\n\n```\n{{paste the text}}\n```' },

  { cat: 'Learn', title: 'Explain simply', body: 'Explain {{topic}} to me as if I am an experienced engineer who has never used it. Use a concrete example, and tell me what it is usually confused with.' },
  { cat: 'Learn', title: 'Compare options', body: 'Compare {{option A}} and {{option B}} for {{use case}}. Give me the real trade-offs, not marketing — including when each is the wrong choice.' },
  { cat: 'Learn', title: 'Design review', body: 'I am designing {{describe the system}}. Challenge my approach: what will break at scale, what am I not thinking about, and what would you do differently?' },
  { cat: 'Learn', title: 'Learning plan', body: 'Build me a practical learning plan for {{topic}}, assuming {{hours}} per week. Focus on building things, not reading, and tell me how to know I have understood each step.' },
];

let aiSelected: string[] = ['claude'];
let aiTplCat = 'All';
let aiPinnedPrompts: string[] = [];
let aiShowPinned = false;

function aiProvider(id: string): AiProvider | undefined {
  return AI_PROVIDERS.find(p => p.id === id);
}

/** Providers whose site cannot take the prompt in the URL. */
function aiNeedsClipboard(ids: string[]): boolean {
  return ids.some(id => !aiProvider(id)?.url);
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall back to the old selection trick if the async API is unavailable
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

function initAI(defaultProvider: string) {
  const modal = document.getElementById('ai-modal') as HTMLElement;
  const textarea = document.getElementById('ai-prompt') as HTMLTextAreaElement;
  const historyWrap = document.getElementById('ai-history-wrap') as HTMLElement;
  const historyList = document.getElementById('ai-history-list') as HTMLElement;
  const submitBtn = document.getElementById('btn-ai-submit') as HTMLButtonElement;
  const countEl = document.getElementById('ai-count') as HTMLElement;
  const notePicker = document.getElementById('ai-note-picker') as HTMLElement;

  // ── Providers ──
  function renderProviders() {
    const wrap = document.getElementById('ai-providers') as HTMLElement;
    wrap.innerHTML = '';
    AI_PROVIDERS.forEach(p => {
      const on = aiSelected.includes(p.id);
      const btn = document.createElement('button');
      btn.className = `ai-provider-btn${on ? ' active' : ''}`;
      btn.title = p.url
        ? `${p.name} by ${p.by} — opens with your prompt already typed`
        : `${p.name} by ${p.by} — cannot prefill, so your prompt is copied to the clipboard`;
      btn.innerHTML = `<span class="ai-p-icon">${p.icon}</span><span class="ai-p-name">${p.name}</span>`;
      if (!p.url) {
        const dot = document.createElement('span');
        dot.className = 'ai-p-clip';
        dot.textContent = '📋';
        dot.title = 'Prompt is copied to your clipboard — paste it in';
        btn.appendChild(dot);
      }
      btn.addEventListener('click', async () => {
        if (aiSelected.includes(p.id)) {
          // Never let the last one be turned off — there would be nothing to send to
          if (aiSelected.length > 1) aiSelected = aiSelected.filter(x => x !== p.id);
        } else {
          aiSelected.push(p.id);
        }
        renderProviders();
        syncSubmit();
        await saveSettings({
          aiProviders: aiSelected,
          aiProvider: aiSelected[0] as Settings['aiProvider'],
        });
      });
      wrap.appendChild(btn);
    });
  }

  function syncSubmit() {
    const names = aiSelected.map(id => aiProvider(id)?.name ?? id);
    submitBtn.textContent = names.length === 1
      ? `Ask ${names[0]} →`
      : `Ask ${names.length} assistants →`;
    submitBtn.disabled = !textarea.value.trim();

    const len = textarea.value.length;
    countEl.textContent = len ? `${len.toLocaleString()} characters` : '';
  }

  // ── Template library ──
  function renderTemplates() {
    const cats = ['All', ...Array.from(new Set(AI_TEMPLATES.map(t => t.cat)))];
    const catWrap = document.getElementById('ai-tpl-cats') as HTMLElement;
    catWrap.innerHTML = '';
    cats.forEach(c => {
      const b = document.createElement('button');
      b.className = `ai-cat${c === aiTplCat ? ' active' : ''}`;
      b.textContent = c;
      b.addEventListener('click', () => { aiTplCat = c; renderTemplates(); });
      catWrap.appendChild(b);
    });

    const grid = document.getElementById('ai-tpl-grid') as HTMLElement;
    grid.innerHTML = '';
    AI_TEMPLATES
      .filter(t => aiTplCat === 'All' || t.cat === aiTplCat)
      .forEach(t => {
        const card = document.createElement('button');
        card.className = 'ai-tpl';
        card.innerHTML = `<span class="ai-tpl-title"></span><span class="ai-tpl-cat">${t.cat}</span>`;
        (card.querySelector('.ai-tpl-title') as HTMLElement).textContent = t.title;
        card.title = t.body.replace(/\n/g, ' ').slice(0, 140);
        card.addEventListener('click', () => insertTemplate(t.body));
        grid.appendChild(card);
      });
  }

  /** Drops the template in and selects its first {{placeholder}} to type over. */
  function insertTemplate(body: string) {
    textarea.value = body;
    textarea.focus();
    const m = body.match(/\{\{[^}]*\}\}/);
    if (m && m.index !== undefined) {
      textarea.setSelectionRange(m.index, m.index + m[0].length);
    } else {
      textarea.setSelectionRange(body.length, body.length);
    }
    autoGrow();
    syncSubmit();
  }

  /** Tab jumps to the next placeholder, so a template can be filled without the mouse. */
  function jumpToNextPlaceholder(): boolean {
    const from = textarea.selectionEnd;
    const re = /\{\{[^}]*\}\}/g;
    let m: RegExpExecArray | null;
    let first: RegExpExecArray | null = null;
    while ((m = re.exec(textarea.value))) {
      if (!first) first = m;
      if (m.index >= from) {
        textarea.setSelectionRange(m.index, m.index + m[0].length);
        return true;
      }
    }
    if (first) { // wrap around
      textarea.setSelectionRange(first.index, first.index + first[0].length);
      return true;
    }
    return false;
  }

  function autoGrow() {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(260, Math.max(76, textarea.scrollHeight)) + 'px';
  }

  // ── History + pinned ──
  async function showHistory() {
    aiPinnedPrompts = await getAiPinned();
    const list = aiShowPinned ? aiPinnedPrompts : await getAiHistory();
    const label = document.getElementById('ai-history-label') as HTMLElement;

    // The Recent / Pinned heading doubles as a toggle once anything is pinned
    label.innerHTML = '';
    if (aiPinnedPrompts.length) {
      (['Recent', 'Pinned'] as const).forEach(name => {
        const b = document.createElement('button');
        const on = (name === 'Pinned') === aiShowPinned;
        b.className = `ai-hist-tab${on ? ' active' : ''}`;
        b.textContent = name;
        b.addEventListener('click', () => { aiShowPinned = name === 'Pinned'; void showHistory(); });
        label.appendChild(b);
      });
    } else {
      label.textContent = 'Recent';
    }

    if (!list.length) {
      if (!aiPinnedPrompts.length) { historyWrap.classList.add('hidden'); return; }
      historyWrap.classList.remove('hidden');
      historyList.innerHTML = '<span class="ai-hist-empty">Nothing here yet</span>';
      return;
    }

    historyWrap.classList.remove('hidden');
    historyList.innerHTML = '';
    list.slice(0, 10).forEach(prompt => {
      const chip = document.createElement('span');
      chip.className = 'ai-history-chip';

      const use = document.createElement('button');
      use.className = 'ai-hist-use';
      use.textContent = prompt.length > 64 ? prompt.slice(0, 61) + '…' : prompt;
      use.title = prompt;
      use.addEventListener('click', () => {
        textarea.value = prompt;
        textarea.focus();
        autoGrow();
        syncSubmit();
      });

      const del = document.createElement('button');
      del.className = 'ai-hist-del';
      del.title = aiShowPinned ? 'Unpin' : 'Remove';
      del.innerHTML = svgIcon(ICON_CROSS, 9);
      del.addEventListener('click', async () => {
        if (aiShowPinned) {
          aiPinnedPrompts = aiPinnedPrompts.filter(p => p !== prompt);
          await saveAiPinned(aiPinnedPrompts);
        } else {
          await removeAiHistory(prompt);
        }
        await showHistory();
      });

      chip.append(use, del);
      historyList.appendChild(chip);
    });
  }

  document.getElementById('ai-history-clear')?.addEventListener('click', async () => {
    if (aiShowPinned) { aiPinnedPrompts = []; await saveAiPinned([]); }
    else await clearAiHistory();
    await showHistory();
  });

  // ── Attach ──
  document.getElementById('ai-attach-clip')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      const sep = textarea.value.trim() ? '\n\n' : '';
      textarea.value += `${sep}\`\`\`\n${text.trim()}\n\`\`\``;
      textarea.focus();
      autoGrow();
      syncSubmit();
    } catch {
      // Reading the clipboard needs permission the user may have declined
      textarea.focus();
      document.execCommand('paste');
    }
  });

  document.getElementById('ai-attach-note')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const notes = await getNotesList();
    notePicker.innerHTML = '';
    if (!notes.length) {
      notePicker.innerHTML = '<span class="ai-note-empty">No notes yet</span>';
    } else {
      notes.slice(0, 12).forEach(n => {
        const b = document.createElement('button');
        b.className = 'ai-note-item';
        b.textContent = n.title || 'Untitled';
        b.addEventListener('click', () => {
          const sep = textarea.value.trim() ? '\n\n' : '';
          textarea.value += `${sep}${n.content}`;
          notePicker.classList.add('hidden');
          textarea.focus();
          autoGrow();
          syncSubmit();
        });
        notePicker.appendChild(b);
      });
    }
    notePicker.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!notePicker.contains(e.target as Node)) notePicker.classList.add('hidden');
  });

  document.getElementById('ai-pin')?.addEventListener('click', async () => {
    const q = textarea.value.trim();
    if (!q) return;
    aiPinnedPrompts = [q, ...aiPinnedPrompts.filter(p => p !== q)];
    await saveAiPinned(aiPinnedPrompts);
    aiShowPinned = true;
    await showHistory();
  });

  // ── Open / close ──
  function open() {
    modal.classList.remove('hidden');
    void showHistory();
    renderProviders();
    renderTemplates();
    syncSubmit();
    setTimeout(() => { textarea.focus(); autoGrow(); }, 50);
  }
  function close() {
    modal.classList.add('hidden');
    notePicker.classList.add('hidden');
  }

  document.getElementById('btn-ai-toggle')?.addEventListener('click', open);
  document.getElementById('btn-ai-close')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });

  // ── Send ──
  async function submitPrompt() {
    const q = textarea.value.trim();
    if (!q || !aiSelected.length) return;
    await addAiHistory(q);

    // One clipboard copy covers every provider that cannot take a URL prompt
    if (aiNeedsClipboard(aiSelected)) await copyToClipboard(q);

    const encoded = encodeURIComponent(q);
    aiSelected.forEach(id => {
      const p = aiProvider(id);
      if (!p) return;
      const url = p.url ? p.url.replace('%s', encoded) : p.home!;
      window.open(url, '_blank', 'noopener');
    });

    close();
    textarea.value = '';
    autoGrow();
    syncSubmit();
  }

  submitBtn.addEventListener('click', () => void submitPrompt());

  textarea.addEventListener('input', () => { autoGrow(); syncSubmit(); });
  textarea.addEventListener('keydown', (e) => {
    // Enter sends; Shift+Enter is a newline. Cmd/Ctrl+Enter also sends, for muscle memory.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitPrompt();
    } else if (e.key === 'Tab' && /\{\{[^}]*\}\}/.test(textarea.value)) {
      // Only hijack Tab while placeholders remain, so focus still escapes normally
      if (jumpToNextPlaceholder()) e.preventDefault();
    }
  });

  // The stored default seeds the selection the first time
  aiSelected = [defaultProvider];
  void getSettings().then(s => {
    const saved = (s.aiProviders ?? []).filter(id => aiProvider(id));
    aiSelected = saved.length ? saved : [defaultProvider];
    renderProviders();
    syncSubmit();
  });
  renderProviders();
  renderTemplates();
}

/** The Settings → AI grid mirrors the modal's provider picker. */
function initAiSettings(settings: Settings) {
  const grid = document.getElementById('set-ai-provider-grid');
  if (!grid) return;
  let chosen = (settings.aiProviders ?? [settings.aiProvider]).filter(id => AI_PROVIDERS.some(p => p.id === id));
  if (!chosen.length) chosen = ['claude'];

  const render = () => {
    grid.innerHTML = '';
    AI_PROVIDERS.forEach(p => {
      const on = chosen.includes(p.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `ai-provider-card${on ? ' is-on' : ''}`;
      card.innerHTML = `
        <span class="ai-provider-icon">${p.icon}</span>
        <span class="ai-provider-name"></span>
        <span class="ai-provider-by"></span>
        ${p.url ? '' : '<span class="ai-provider-tag">clipboard</span>'}`;
      (card.querySelector('.ai-provider-name') as HTMLElement).textContent = p.name;
      (card.querySelector('.ai-provider-by') as HTMLElement).textContent = p.by;
      card.addEventListener('click', async () => {
        if (chosen.includes(p.id)) {
          if (chosen.length > 1) chosen = chosen.filter(x => x !== p.id);
        } else {
          chosen.push(p.id);
        }
        render();
        aiSelected = [...chosen];
        await saveSettings({ aiProviders: chosen, aiProvider: chosen[0] as Settings['aiProvider'] });
      });
      grid.appendChild(card);
    });
  };
  render();
}

// ─── Soundscapes ──────────────────────────────────────────────────────────────

function initSoundscapes() {
  const panel = document.getElementById('sound-panel') as HTMLElement;
  const grid = document.getElementById('sound-grid') as HTMLElement;
  const variantBar = document.getElementById('sound-variant-bar') as HTMLElement;
  const volumeSlider = document.getElementById('sound-volume') as HTMLInputElement;
  let activeCatId: string | null = null;   // which category card is highlighted
  let activeVariantId: string | null = null; // which variant is actually playing

  function playVariant(variantId: string, variantLabel: string, catId: string) {
    // Stop any previously playing sound (fix mixing bug)
    stopSoundscape();
    activeVariantId = variantId;
    activeCatId = catId;
    fmSoundInfo = { label: variantLabel, variantId };
    playSoundscape(variantId, parseInt(volumeSlider.value, 10));
    updateNowPlaying(variantLabel);
    updateFmSoundChip();
  }

  function showVariants(sc: typeof SOUNDSCAPES[0]) {
    variantBar.innerHTML = '';
    variantBar.classList.remove('hidden');

    sc.variants.forEach((v, i) => {
      const chip = document.createElement('button');
      chip.className = `sv-chip${activeVariantId === v.id ? ' active' : ''}`;
      chip.textContent = v.label;
      // Start fetching the recording on hover so the click plays instantly
      chip.addEventListener('mouseenter', () => preloadSoundscape(v.id), { once: true });
      chip.addEventListener('click', () => {
        // If same variant is playing — stop it (toggle off)
        if (activeVariantId === v.id) {
          stopSoundscape();
          activeVariantId = null; activeCatId = null;
          fmSoundInfo = null;
          grid.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
          variantBar.querySelectorAll('.sv-chip').forEach(c => c.classList.remove('active'));
          variantBar.classList.add('hidden');
          updateNowPlaying(null); updateFmSoundChip();
          return;
        }
        playVariant(v.id, v.label, sc.id);
        variantBar.querySelectorAll('.sv-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
      variantBar.appendChild(chip);
      // Auto-play the first variant when category is first selected
      if (i === 0 && activeCatId !== sc.id) chip.click();
    });
  }

  function updateNowPlaying(label: string | null) {
    const el = document.getElementById('sound-now-playing');
    if (!el) return;
    if (label) {
      el.textContent = label;
      el.parentElement?.classList.remove('hidden');
    } else {
      el.parentElement?.classList.add('hidden');
    }
  }

  SOUNDSCAPES.forEach(sc => {
    const btn = document.createElement('button');
    btn.className = 'sound-btn';
    btn.dataset['id'] = sc.id;
    btn.innerHTML = `<span class="sound-icon">${sc.svg}</span><span class="sound-label">${sc.label}</span>`;
    btn.addEventListener('click', () => {
      const isActive = activeCatId === sc.id;
      if (isActive) {
        // Toggle off — stop everything and hide variants
        stopSoundscape();
        activeCatId = null; activeVariantId = null; fmSoundInfo = null;
        grid.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
        variantBar.classList.add('hidden');
        variantBar.innerHTML = '';
        updateNowPlaying(null); updateFmSoundChip();
        return;
      }
      // Switch to this category — deselect old
      grid.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCatId = sc.id; activeVariantId = null;
      showVariants(sc);
    });
    grid.appendChild(btn);
  });

  // One volume for both engines: Web Audio soundscapes and the YouTube player
  void getYtVolume().then(v => {
    ytVolume = v;
    volumeSlider.value = String(v);
    const fmSlider = document.getElementById('fm-volume') as HTMLInputElement | null;
    if (fmSlider) fmSlider.value = String(v);
    setSoundVolume(v);
    ytApplyVolume();
  });
  volumeSlider.addEventListener('input', () => {
    const v = parseInt(volumeSlider.value, 10);
    setSoundVolume(v);
    ytSetVolume(v);
    const fmSlider = document.getElementById('fm-volume') as HTMLInputElement | null;
    if (fmSlider) fmSlider.value = volumeSlider.value;
  });

  // ── Tab switching (Soundscapes / YouTube) ──
  const ytSection = document.getElementById('yt-section') as HTMLElement;
  panel.querySelectorAll<HTMLButtonElement>('.sound-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.sound-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isYt = tab.dataset['tab'] === 'youtube';
      grid.classList.toggle('hidden', isYt);
      variantBar.classList.toggle('hidden', isYt);
      ytSection.classList.toggle('hidden', !isYt);
      if (isYt) {
        // Stop soundscape when switching to YouTube
        stopSoundscape(); activeCatId = null; activeVariantId = null; fmSoundInfo = null;
        grid.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
        updateNowPlaying(null); updateFmSoundChip();
      }
    });
  });

  // ── YouTube beats ──
  void initYouTubeBeats(updateNowPlaying);

  document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    // Focus mode may be holding the player; take it back so the panel is not empty
    if (!panel.classList.contains('hidden')) mountNowPlayer('panel');
  });
  document.getElementById('btn-sound-close')?.addEventListener('click', () => {
    panel.classList.add('hidden');
    stopSoundscape();
    activeCatId = null; activeVariantId = null; fmSoundInfo = null;
    grid.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
    variantBar.classList.add('hidden');
    updateNowPlaying(null); updateFmSoundChip();
  });
}

// ─── YouTube Beats ────────────────────────────────────────────────────────────

// All videos verified embeddable (youtube-nocookie.com)
const YT_VIDEOS = [
  // Lofi / Chillhop
  { id: 'CFGLoQIhmow', title: 'Lofi Hip Hop Mix',         ch: 'Lofi Girl' },
  { id: 'n61ULEU7CO0', title: 'Best of Lofi 2021',        ch: 'Lofi Girl' },
  { id: 'HFQibg2OJkU', title: 'Chillhop Spring 2025',    ch: 'Chillhop Music' },
  { id: '5yx6BWlEVcY', title: 'Chillhop Radio Mix',       ch: 'Chillhop Music' },
  { id: 'D_uLM5i0Z4c', title: 'Endless Sunday',           ch: 'Chillhop Music' },
  { id: 'zUD8p1Nt7GM', title: 'Morning Jazz Lofi',        ch: 'The Jazz Hop Café' },
  // Piano & Relaxation
  { id: 'E7EOjkGVmyo', title: 'Relaxing Piano · 1h',      ch: "Jacob's Piano" },
  { id: 'lCOF9LN_Zxs', title: 'Beautiful Piano Music',   ch: 'Soothing Relaxation' },
  { id: 'sCwtp2lmUEU', title: 'Felt Piano · 30min',       ch: "Jacob's Piano" },
  { id: '1ZYbU82GVz4', title: 'Sleep & Relax Music',      ch: 'Soothing Relaxation' },
  // Ambient / Focus
  { id: 'lTRiuFIWV54', title: 'Deep Focus Music',         ch: 'Greenred Productions' },
  { id: 'WPni755-Krg', title: 'Study Music Alpha Waves',  ch: 'Yellow Brick Cinema' },
  { id: '4GnVDPD01as', title: 'Ambient Study · 4h',       ch: 'Focus Music' },
  // Nature & Atmosphere
  { id: 'eKFTSSKCzWA', title: 'Nature Sounds · 8h',       ch: 'Nature Sounds' },
  { id: '77ZozI0rw7w', title: 'Piano & Water Sounds',     ch: 'Soothing Relaxation' },
  { id: 'V1RPi2MYptM', title: 'Zen Music & Water',        ch: 'Soothing Relaxation' },
  { id: 'sjkrrmBnpGE', title: 'Jazz & Bossa Nova',        ch: 'Lofi Jazz' },
  { id: '2gliGzb2_1I', title: 'Coffee Shop Ambience',     ch: 'Ambient Sounds' },
];

// ─── YouTube helpers ──────────────────────────────────────────────────────────

function parseYouTubeId(input: string): string | null {
  input = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  const m = input.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function fetchYtMeta(id: string): Promise<{ title: string; embeddable: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { signal: controller.signal },
    );
    if (r.status === 401 || r.status === 403) return { title: 'Custom Video', embeddable: false };
    if (!r.ok) return { title: 'Custom Video', embeddable: true };
    const d = await r.json();
    return { title: (d.title as string) || 'Custom Video', embeddable: true };
  } catch { return { title: 'Custom Video', embeddable: true }; }
  finally { clearTimeout(timer); }
}

function buildYtCard(
  id: string, title: string, ch: string, isCustom: boolean,
  onPlay: (id: string, title: string, ch: string) => void,
  onDelete?: (id: string) => void,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'yt-card' + (isCustom ? ' yt-card-custom' : '');
  card.dataset['ytId'] = id;
  card.innerHTML = `
    <div class="yt-thumb-wrap">
      <img class="yt-thumb" src="https://img.youtube.com/vi/${id}/mqdefault.jpg" alt="${title}" loading="lazy"/>
      <div class="yt-play-overlay"><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
    </div>
    <div class="yt-card-info">
      <span class="yt-card-title">${title}</span>
      <span class="yt-card-ch">${ch}</span>
    </div>
    ${isCustom ? `<button class="yt-del-btn" title="Remove">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>` : ''}
  `;
  card.querySelector('.yt-thumb-wrap')?.addEventListener('click', () => onPlay(id, title, ch));
  card.querySelector('.yt-card-info')?.addEventListener('click', () => onPlay(id, title, ch));
  if (isCustom && onDelete) {
    card.querySelector('.yt-del-btn')?.addEventListener('click', (e) => { e.stopPropagation(); onDelete(id); });
  }
  return card;
}

// ─── YouTube state ────────────────────────────────────────────────────────────

let ytPlaylist: Array<{ id: string; title: string; ch: string }> = [];
let ytCurrentIdx = -1;
let activeYtIframe: HTMLIFrameElement | null = null;
let activeYtUpdateFn: ((label: string | null) => void) | null = null;
let activeYtTitle = '';
let activeYtCh = '';
let activeYtId = '';
let ytPlayStartedAt = 0;
let ytIsPaused = false;
let ytPausedPosition = 0; // seconds elapsed when paused; used to resume from correct position

// ── IFrame API bridge state ──
// YouTube only posts player events (onStateChange / infoDelivery) to the parent AFTER
// the parent sends a `listening` handshake. Without it the ENDED event never arrives
// and playback simply stops at the end of a track.
let ytApiBound = false;      // true once the player has answered the handshake
let ytHandshakeTimer = 0;
let ytLoadToken = 0;         // bumped on every playYtVideo — invalidates stale timers/events
let ytEndedToken = -1;       // token for which ENDED was already handled (dedupe)
let ytErrorSkipToken = -1;   // token for which we already auto-skipped an unplayable video
let ytErrorSkips = 0;        // consecutive auto-skips; reset once something actually plays
let ytDuration = 0;          // seconds, from infoDelivery (0 = unknown)
let ytEndTimer = 0;          // backstop timer in case the ENDED event is missed
let ytElapsedEl: HTMLElement | null = null;

// ── Scrub bar ──
let ytScrubEl: HTMLElement | null = null;
let ytScrubFill: HTMLElement | null = null;
let ytScrubKnob: HTMLElement | null = null;
let ytScrubTip: HTMLElement | null = null;
let ytDurationEl: HTMLElement | null = null;
let ytScrubbing = false;   // while true, player updates must not fight the drag
let ytScrubRatio = 0;

// ── Volume (shared with the soundscape slider) ──
let ytVolume = 50;
let ytVolumeSaveTimer = 0;

/** Push the current volume to the embedded player. Safe to call before it's ready. */
function ytApplyVolume() {
  const win = activeYtIframe?.contentWindow;
  if (!win || !activeYtIframe?.src.includes('youtube-nocookie.com')) return;
  win.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [ytVolume] }), '*');
  // setVolume(0) does not mute a muted-by-user player, so drive mute explicitly too
  win.postMessage(JSON.stringify({ event: 'command', func: ytVolume === 0 ? 'mute' : 'unMute', args: [] }), '*');
}

/** Called by every volume slider in the UI. */
function ytSetVolume(v: number) {
  ytVolume = Math.max(0, Math.min(100, Math.round(v)));
  ytApplyVolume();
  clearTimeout(ytVolumeSaveTimer);
  ytVolumeSaveTimer = window.setTimeout(() => void saveYtVolume(ytVolume), 400);
}

// Playback modes
let ytShuffle = false;
let ytLoopMode: 'all' | 'one' | 'none' = 'all';
let ytShuffledIndices: number[] = [];
let ytShufflePos = -1;

// Now Playing pane DOM refs (set in initYouTubeBeats)
let ytNpThumb: HTMLImageElement | null = null;
let ytNpTrack: HTMLElement | null = null;
let ytNpChannel: HTMLElement | null = null;
let ytNpYtLink: HTMLAnchorElement | null = null;
let ytNpPausePlayBtn: HTMLButtonElement | null = null;
let ytNpPauseIcon: SVGElement | null = null;
let ytNpPlayIcon: SVGElement | null = null;
let ytActivePane = 'library';

// Visualizer
let vizRaf = 0;
const VIZ_BARS = 26;
const vizH = new Float32Array(VIZ_BARS).fill(0.04);
const vizT = new Float32Array(VIZ_BARS).fill(0.04);

function startVisualizer(canvas: HTMLCanvasElement) {
  cancelAnimationFrame(vizRaf);
  const ctx2d = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  for (let i = 0; i < VIZ_BARS; i++) vizT[i] = 0.05 + Math.random() * 0.95;
  function frame() {
    ctx2d.clearRect(0, 0, W, H);
    const bw = W / VIZ_BARS;
    for (let i = 0; i < VIZ_BARS; i++) {
      vizH[i] += (vizT[i] - vizH[i]) * 0.1;
      if (Math.abs(vizH[i] - vizT[i]) < 0.008) {
        const max = ytIsPaused ? 0.14 : 1.0;
        const min = ytIsPaused ? 0.02 : 0.04;
        vizT[i] = min + Math.random() * (max - min);
      }
      const h = Math.max(2, vizH[i] * H);
      const x = i * bw + 1.5;
      const grad = ctx2d.createLinearGradient(0, H - h, 0, H);
      grad.addColorStop(0, 'rgba(167,139,250,0.95)');
      grad.addColorStop(1, 'rgba(109,40,217,0.45)');
      ctx2d.fillStyle = grad;
      ctx2d.beginPath();
      ctx2d.roundRect(x, H - h, bw - 3, h, [3, 3, 1, 1]);
      ctx2d.fill();
    }
    vizRaf = requestAnimationFrame(frame);
  }
  frame();
}

function stopVisualizer() { cancelAnimationFrame(vizRaf); vizRaf = 0; }

function updatePausePlayUI() {
  ytNpPauseIcon?.classList.toggle('hidden', ytIsPaused);
  ytNpPlayIcon?.classList.toggle('hidden', !ytIsPaused);
  if (ytNpPausePlayBtn) ytNpPausePlayBtn.title = ytIsPaused ? 'Play' : 'Pause';
}

function switchYtPane(pane: string) {
  ytActivePane = pane;
  ['library', 'recent', 'nowplaying'].forEach(p => {
    document.getElementById(`yt-pane-${p}`)?.classList.toggle('hidden', p !== pane);
    document.querySelector<HTMLButtonElement>(`.yt-tab[data-pane="${p}"]`)
      ?.classList.toggle('yt-tab--active', p === pane);
  });
}

function markActiveCard(id: string) {
  document.querySelectorAll<HTMLElement>('.yt-card').forEach(el => {
    el.classList.toggle('yt-card--active', el.dataset['ytId'] === id);
  });
}

/**
 * There is exactly one Now Playing player and one (hidden, audio-only) iframe.
 * Focus mode borrows the player element instead of cloning it, so a track keeps
 * playing from the same position when you move between the two surfaces.
 */
function mountNowPlayer(where: 'panel' | 'focus') {
  const player = document.getElementById('yt-np-player');
  const target = document.getElementById(where === 'focus' ? 'fm-np-slot' : 'yt-pane-nowplaying');
  if (!player || !target || player.parentElement === target) return;
  target.appendChild(player);
}

/** True once something has been played, so focus mode can open straight into it. */
function hasActiveTrack(): boolean {
  return Boolean(activeYtId);
}

function updateNowPlayingView(id: string, title: string, ch: string) {
  activeYtTitle = title; activeYtCh = ch; activeYtId = id;
  if (ytNpThumb) ytNpThumb.src = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
  if (ytNpTrack) ytNpTrack.textContent = title;
  if (ytNpChannel) ytNpChannel.textContent = ch;
  if (ytNpYtLink) ytNpYtLink.href = `https://www.youtube.com/watch?v=${id}`;
  // Reveal player, hide empty state, show the tab button
  document.getElementById('yt-np-empty')?.classList.add('hidden');
  document.getElementById('yt-np-player')?.classList.remove('hidden');
  document.getElementById('yt-tab-nowplaying')?.classList.remove('hidden');
  // One place to keep the focus-mode chip honest, including auto-advance
  fmSoundInfo = { label: title, variantId: `yt-${id}` };
  updateFmSoundChip();
}

// IDs the player has told us cannot be embedded (owner disabled off-site playback).
const ytBlockedIds = new Set<string>();

function setYtBlockedBanner(visible: boolean, reason?: string) {
  const banner = document.getElementById('yt-blocked-banner');
  const link   = document.getElementById('yt-blocked-link') as HTMLAnchorElement | null;
  if (!banner) return;
  banner.classList.toggle('hidden', !visible);
  const msg = banner.querySelector('span');
  if (visible && msg) {
    msg.textContent = reason
      ?? 'Playback blocked by your network. Video embeds may be restricted by a corporate proxy or firewall.';
  }
  if (visible && link) link.href = `https://www.youtube.com/watch?v=${activeYtId}`;
}

function markBlockedCards() {
  document.querySelectorAll<HTMLElement>('.yt-card').forEach(el => {
    const id = el.dataset['ytId'];
    const blocked = !!id && ytBlockedIds.has(id);
    el.classList.toggle('yt-card--blocked', blocked);
    if (blocked) el.title = "This video's owner doesn't allow playback outside YouTube";
  });
}

function ytFmtTime(sec: number): string {
  const s = Math.floor(Math.max(0, sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function setScrubVisual(ratio: number) {
  const pct = `${(Math.min(1, Math.max(0, ratio)) * 100).toFixed(3)}%`;
  if (ytScrubFill) ytScrubFill.style.width = pct;
  if (ytScrubKnob) ytScrubKnob.style.left = pct;
  if (ytScrubTip) ytScrubTip.style.left = pct;
}

function renderYtElapsed(sec: number) {
  const hasDuration = ytDuration > 0;
  if (ytDurationEl) ytDurationEl.textContent = hasDuration ? ytFmtTime(ytDuration) : '--:--';
  // Live streams (and tracks whose duration hasn't arrived yet) have nothing to scrub
  ytScrubEl?.classList.toggle('yt-scrub--live', !hasDuration);
  if (ytScrubbing) return; // the user is dragging — their position wins
  if (ytElapsedEl) ytElapsedEl.textContent = ytFmtTime(sec);
  setScrubVisual(hasDuration ? sec / ytDuration : 0);
  if (ytScrubEl && hasDuration) {
    ytScrubEl.setAttribute('aria-valuemax', String(Math.floor(ytDuration)));
    ytScrubEl.setAttribute('aria-valuenow', String(Math.floor(Math.max(0, sec))));
    ytScrubEl.setAttribute('aria-valuetext', `${ytFmtTime(sec)} of ${ytFmtTime(ytDuration)}`);
  }
}

/** Seek the active player to an absolute position, keeping all local clocks in sync. */
function ytSeekTo(pos: number) {
  if (!activeYtIframe || !activeYtId) return;
  // Guard: iframe not yet loaded (e.g. restored paused state) — origin mismatch would occur
  if (!activeYtIframe.src.includes('youtube-nocookie.com')) return;
  const clamped = ytDuration > 0
    ? Math.min(Math.max(0, pos), Math.max(0, ytDuration - 0.5))
    : Math.max(0, pos);
  activeYtIframe.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func: 'seekTo', args: [clamped, true] }),
    '*',
  );
  if (ytIsPaused) ytPausedPosition = clamped;
  else ytPlayStartedAt = Date.now() - clamped * 1000;
  ytEndedToken = -1; // scrubbing backwards must re-arm the end-of-track handler
  renderYtElapsed(clamped);
  scheduleYtEndFallback(clamped);
}

/**
 * Perform the IFrame API handshake with the embedded player.
 * The player ignores messages until it has finished loading, so we retry until it
 * answers (ytApiBound) or we give up after ~15s.
 */
function ytBindIframe(iframe: HTMLIFrameElement) {
  clearInterval(ytHandshakeTimer);
  ytApiBound = false;
  let tries = 0;
  const send = () => {
    const win = iframe.contentWindow;
    if (!win || !iframe.src.includes('youtube-nocookie.com')) return;
    win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
    win.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }), '*');
    win.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onError'] }), '*');
  };
  ytHandshakeTimer = window.setInterval(() => {
    if (ytApiBound) { clearInterval(ytHandshakeTimer); ytHandshakeTimer = 0; return; }
    if (++tries > 60) {
      clearInterval(ytHandshakeTimer); ytHandshakeTimer = 0;
      console.warn('[MonkTab] YouTube player never answered the IFrame API handshake — ' +
        'falling back to timer-based auto-advance.');
      return;
    }
    send();
  }, 250);
  // The player ignores messages sent before it finishes loading, so send on load too.
  iframe.addEventListener('load', send, { once: true });
  send();
}

// Durations resolved from the watch page, cached per video id.
const ytDurationCache = new Map<string, number>();

/**
 * Fallback duration source. If the IFrame API never reports a duration (handshake
 * blocked by a proxy, throttled tab), scrape `lengthSeconds` off the watch page —
 * we already hold host permission for www.youtube.com. This keeps the scrub bar and
 * the end-of-track auto-advance working even with no player events at all.
 */
async function loadYtDurationFallback(id: string, token: number) {
  const cached = ytDurationCache.get(id);
  if (cached) {
    if (token === ytLoadToken && !ytDuration) {
      ytDuration = cached;
      renderYtElapsed(Math.max(0, (Date.now() - ytPlayStartedAt) / 1000));
      scheduleYtEndFallback(Math.max(0, (Date.now() - ytPlayStartedAt) / 1000));
    }
    return;
  }
  // Give the player a moment — its own duration is authoritative when it arrives.
  await new Promise(r => setTimeout(r, 2500));
  if (token !== ytLoadToken || ytDuration > 0) return;
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${id}`);
    if (!r.ok) return;
    const html = await r.text();
    const m = html.match(/"lengthSeconds":"(\d+)"/);
    const secs = m ? Number(m[1]) : 0;
    if (!secs || token !== ytLoadToken || ytDuration > 0) return;
    ytDurationCache.set(id, secs);
    ytDuration = secs;
    const pos = ytIsPaused ? ytPausedPosition : Math.max(0, (Date.now() - ytPlayStartedAt) / 1000);
    renderYtElapsed(pos);
    scheduleYtEndFallback(pos);
  } catch { /* offline or blocked — scrub bar stays in live mode */ }
}

/**
 * Backstop: if the ENDED event is ever missed (blocked message, throttled tab),
 * advance once the track's known duration has elapsed.
 */
function scheduleYtEndFallback(currentTime: number) {
  clearTimeout(ytEndTimer);
  if (!ytDuration || ytIsPaused) return;
  const remainingMs = (ytDuration - currentTime) * 1000 + 3000;
  if (remainingMs <= 0 || remainingMs > 12 * 3600 * 1000) return;
  const token = ytLoadToken;
  ytEndTimer = window.setTimeout(() => {
    if (token !== ytLoadToken || ytIsPaused || ytEndedToken === token) return;
    ytEndedToken = token;
    ytPlayNext();
  }, remainingMs);
}

function playYtVideo(id: string, title: string, ch: string, startSec = 0) {
  if (!activeYtIframe) return;
  ytCurrentIdx = ytPlaylist.findIndex(v => v.id === id);
  const startParam = startSec > 0 ? `&start=${Math.floor(startSec)}` : '';
  ytLoadToken++;
  ytDuration = 0;
  clearTimeout(ytEndTimer);
  // NOTE: deliberately no `origin=` param. The service worker rewrites the request's
  // Origin header to https://www.youtube.com, so a chrome-extension:// origin param
  // contradicts it and the player silently refuses to post events back. Without the
  // param, the player replies to whoever sent the `listening` handshake — which is us.
  activeYtIframe.src =
    `https://www.youtube-nocookie.com/embed/${id}` +
    `?autoplay=1&rel=0&enablejsapi=1&widgetid=1${startParam}`;
  ytBindIframe(activeYtIframe);
  void loadYtDurationFallback(id, ytLoadToken);
  ytPlayStartedAt = Date.now() - startSec * 1000;
  ytIsPaused = false;
  setYtBlockedBanner(false);
  updateNowPlayingView(id, title, ch);
  updatePausePlayUI();
  markActiveCard(id);
  if (!ytElapsedEl) ytElapsedEl = document.getElementById('yt-elapsed');
  renderYtElapsed(startSec);
  switchYtPane('nowplaying');
  if (ytShuffle) rebuildShuffled();
  if (activeYtUpdateFn) activeYtUpdateFn(title);
  void saveYtPlayState({ id, title, ch, startedAt: ytPlayStartedAt, pausedPosition: 0, isPaused: false });
  void addYtRecent({ id, title, ch, playedAt: Date.now() });
}

function shuffleArray(arr: number[]): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rebuildShuffled() {
  ytShuffledIndices = shuffleArray(ytPlaylist.map((_, i) => i));
  ytShufflePos = ytShuffledIndices.indexOf(ytCurrentIdx);
  if (ytShufflePos === -1) ytShufflePos = 0;
}

function getNextIdx(): number {
  if (ytLoopMode === 'one') return ytCurrentIdx;
  if (ytShuffle) {
    if (!ytShuffledIndices.length) rebuildShuffled();
    const next = (ytShufflePos + 1) % ytShuffledIndices.length;
    if (next === 0 && ytLoopMode === 'none') return -1;
    ytShufflePos = next; return ytShuffledIndices[ytShufflePos];
  }
  const next = ytCurrentIdx + 1;
  return next >= ytPlaylist.length ? (ytLoopMode === 'all' ? 0 : -1) : next;
}

function getPrevIdx(): number {
  if (ytLoopMode === 'one') return ytCurrentIdx;
  if (ytShuffle) {
    if (!ytShuffledIndices.length) rebuildShuffled();
    ytShufflePos = (ytShufflePos - 1 + ytShuffledIndices.length) % ytShuffledIndices.length;
    return ytShuffledIndices[ytShufflePos];
  }
  const prev = ytCurrentIdx - 1;
  return prev < 0 ? (ytLoopMode === 'all' ? ytPlaylist.length - 1 : 0) : prev;
}

function ytPlayNext() {
  if (!activeYtIframe) return;
  const idx = getNextIdx();
  if (idx === -1) {
    activeYtIframe.src = '';
    if (activeYtUpdateFn) activeYtUpdateFn(null);
    void clearYtPlayState(); return;
  }
  const v = ytPlaylist[idx];
  playYtVideo(v.id, v.title, v.ch);
}

function ytPlayPrev() {
  if (!activeYtIframe) return;
  const v = ytPlaylist[getPrevIdx()];
  if (v) playYtVideo(v.id, v.title, v.ch);
}

// Auto-advance + pause/play state tracking
function handleYtPlayerState(state: number) {
  if (state === 0) {
    // ENDED — dedupe: it can arrive via both onStateChange and infoDelivery
    if (ytEndedToken === ytLoadToken) return;
    ytEndedToken = ytLoadToken;
    clearTimeout(ytEndTimer);
    ytPlayNext();
  } else if (state === 2) {
    ytIsPaused = true;
    clearTimeout(ytEndTimer);
    ytPausedPosition = Math.max(0, (Date.now() - ytPlayStartedAt) / 1000);
    updatePausePlayUI();
    void getYtPlayState().then(s => { if (s) void saveYtPlayState({ ...s, isPaused: true, pausedPosition: ytPausedPosition }); });
  } else if (state === 1 || state === 3) {
    ytApplyVolume();          // re-assert on play/buffer — a new video resets to 100%
    if (state === 3) return;  // buffering: nothing else to update
    ytIsPaused = false;
    ytErrorSkips = 0;         // something is actually playing
    setYtBlockedBanner(false);
    if (ytPausedPosition > 0) ytPlayStartedAt = Date.now() - ytPausedPosition * 1000;
    ytPausedPosition = 0;
    updatePausePlayUI();
    scheduleYtEndFallback(Math.max(0, (Date.now() - ytPlayStartedAt) / 1000));
    void getYtPlayState().then(s => {
      if (s) void saveYtPlayState({ ...s, isPaused: false, pausedPosition: 0, startedAt: ytPlayStartedAt });
    });
  }
}

window.addEventListener('message', (e) => {
  if (e.origin !== 'https://www.youtube-nocookie.com' && e.origin !== 'https://www.youtube.com') return;
  let data: any;
  try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
  if (!data || typeof data !== 'object') return;

  if (!ytApiBound) {
    ytApiBound = true; // the player is talking to us — stop the handshake retries
    ytApplyVolume();   // a fresh iframe always starts at 100%
  }

  if (data.event === 'onError' || data.event === 'onPlayerError') {
    // 100 = removed/private, 101 & 150 = owner disabled embedding (very common for
    // official music videos and YouTube Music tracks). Nothing will ever play here.
    const code = Number(data.info?.errorCode ?? data.info);
    const notEmbeddable = code === 101 || code === 150;
    setYtBlockedBanner(true,
      notEmbeddable
        ? "This video's owner doesn't allow playback on other sites. Open it on YouTube, or pick another track."
        : code === 100
          ? 'This video is unavailable (removed or private).'
          : undefined);
    if ((code === 100 || notEmbeddable)) {
      if (activeYtId) { ytBlockedIds.add(activeYtId); void addYtBlockedId(activeYtId); markBlockedCards(); }
      // Skip forward once per track, so a fully blocked network can't race
      // through the entire playlist.
      // Stop skipping after a few failures in a row — otherwise a network that blocks
      // every embed would cycle the playlist forever.
      if (ytErrorSkipToken !== ytLoadToken && ytErrorSkips < 4) {
        ytErrorSkipToken = ytLoadToken;
        ytErrorSkips++;
        setTimeout(() => ytPlayNext(), 2000);
      }
    }
    return;
  }

  if (data.event === 'infoDelivery' && data.info && typeof data.info === 'object') {
    const info = data.info;
    if (typeof info.duration === 'number' && info.duration > 0) ytDuration = info.duration;
    if (typeof info.currentTime === 'number' && info.currentTime >= 0) {
      // Trust the player's clock over wall-clock time (survives buffering + throttling)
      if (!ytIsPaused) {
        ytPlayStartedAt = Date.now() - info.currentTime * 1000;
        renderYtElapsed(info.currentTime);
        scheduleYtEndFallback(info.currentTime);
      }
    }
    if (typeof info.playerState === 'number') handleYtPlayerState(info.playerState);
    return;
  }

  if (data.event === 'onStateChange') handleYtPlayerState(Number(data.info));
});

async function initYouTubeBeats(updateNowPlaying: (label: string | null) => void) {
  activeYtIframe = document.getElementById('yt-iframe') as HTMLIFrameElement;
  activeYtUpdateFn = updateNowPlaying;
  ytNpThumb      = document.getElementById('yt-np-thumb')     as HTMLImageElement;
  ytNpTrack      = document.getElementById('yt-np-track')     as HTMLElement;
  ytNpChannel    = document.getElementById('yt-np-channel')   as HTMLElement;
  ytNpYtLink     = document.getElementById('yt-np-ytlink')    as HTMLAnchorElement;
  ytNpPausePlayBtn = document.getElementById('yt-np-playpause') as HTMLButtonElement;
  ytNpPauseIcon  = document.getElementById('yt-np-pause-icon') as unknown as SVGElement;
  ytNpPlayIcon   = document.getElementById('yt-np-play-icon')  as unknown as SVGElement;
  const canvas      = document.getElementById('yt-visualizer')   as HTMLCanvasElement;
  const ytGrid      = document.getElementById('yt-grid')         as HTMLElement;
  const elapsedEl   = document.getElementById('yt-elapsed')      as HTMLElement;

  // Elapsed time ticker (infoDelivery keeps ytPlayStartedAt in sync with the real player clock)
  ytElapsedEl = elapsedEl;
  setInterval(() => {
    if (!activeYtId || ytIsPaused || !elapsedEl) return;
    renderYtElapsed((Date.now() - ytPlayStartedAt) / 1000);
  }, 1000);

  // Seek helpers using YouTube iframe postMessage API
  function ytCurrentPos(): number {
    return ytIsPaused ? ytPausedPosition : Math.max(0, (Date.now() - ytPlayStartedAt) / 1000);
  }
  function ytSeekBy(deltaSec: number) {
    ytSeekTo(ytCurrentPos() + deltaSec);
  }
  document.getElementById('yt-seek-back')?.addEventListener('click', () => ytSeekBy(-15));
  document.getElementById('yt-seek-fwd')?.addEventListener('click',  () => ytSeekBy(+15));

  // ── Scrub bar: click or drag anywhere on the track to jump ──
  ytScrubEl    = document.getElementById('yt-scrub');
  ytScrubFill  = document.getElementById('yt-scrub-fill');
  ytScrubKnob  = document.getElementById('yt-scrub-knob');
  ytScrubTip   = document.getElementById('yt-scrub-tip');
  ytDurationEl = document.getElementById('yt-duration');

  function scrubRatioFrom(clientX: number): number {
    const r = ytScrubEl!.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  }
  function previewScrub(ratio: number) {
    ytScrubRatio = ratio;
    const sec = ratio * ytDuration;
    setScrubVisual(ratio);
    if (ytElapsedEl) ytElapsedEl.textContent = ytFmtTime(sec);
    if (ytScrubTip) ytScrubTip.textContent = ytFmtTime(sec);
  }

  ytScrubEl?.addEventListener('pointerdown', (e) => {
    if (!activeYtId || ytDuration <= 0) return;
    e.preventDefault();
    ytScrubbing = true;
    ytScrubEl!.classList.add('yt-scrub--dragging');
    ytScrubEl!.setPointerCapture(e.pointerId);
    previewScrub(scrubRatioFrom(e.clientX));
  });
  ytScrubEl?.addEventListener('pointermove', (e) => {
    if (!ytScrubbing) return;
    previewScrub(scrubRatioFrom(e.clientX));
  });
  function endScrub(commit: boolean) {
    if (!ytScrubbing) return;
    ytScrubbing = false;
    ytScrubEl?.classList.remove('yt-scrub--dragging');
    if (commit) ytSeekTo(ytScrubRatio * ytDuration);
    else renderYtElapsed(ytCurrentPos());
  }
  ytScrubEl?.addEventListener('pointerup', () => endScrub(true));
  ytScrubEl?.addEventListener('pointercancel', () => endScrub(false));

  // Keyboard access: ←/→ nudge 5s, Home/End jump to start/end
  ytScrubEl?.addEventListener('keydown', (e) => {
    if (!activeYtId || ytDuration <= 0) return;
    if (e.key === 'ArrowLeft')       { e.preventDefault(); e.stopPropagation(); ytSeekBy(-5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); ytSeekBy(+5); }
    else if (e.key === 'Home')       { e.preventDefault(); ytSeekTo(0); }
    else if (e.key === 'End')        { e.preventDefault(); ytSeekTo(ytDuration - 5); }
  });

  // "Browse Library" button in empty state
  document.querySelector<HTMLButtonElement>('.yt-np-empty-btn')?.addEventListener('click', () => {
    switchYtPane('library');
  });

  let customVideos = await getCustomYtVideos();
  (await getYtBlockedIds()).forEach(id => ytBlockedIds.add(id));

  function rebuildPlaylist() {
    ytPlaylist = [
      ...customVideos.map(v => ({ id: v.id, title: v.title, ch: 'My Playlist' })),
      ...YT_VIDEOS,
    ];
  }

  function renderGrid() {
    ytGrid.innerHTML = '';
    if (customVideos.length > 0) {
      const hdr = document.createElement('div');
      hdr.className = 'yt-section-hdr';
      hdr.innerHTML = `<span>MY PLAYLIST <span class="yt-count">${customVideos.length}</span></span>`;
      ytGrid.appendChild(hdr);
      customVideos.slice().reverse().forEach(v => {
        const card = buildYtCard(v.id, v.title, 'My Playlist', true,
          (id, t, ch) => playYtVideo(id, t, ch),
          async (id) => {
            customVideos = customVideos.filter(c => c.id !== id);
            await saveCustomYtVideos(customVideos);
            rebuildPlaylist(); renderGrid();
          }
        );
        ytGrid.appendChild(card);
      });
      const div = document.createElement('div');
      div.className = 'yt-section-hdr';
      div.innerHTML = '<span>BUILT-IN</span>';
      ytGrid.appendChild(div);
    }
    YT_VIDEOS.forEach(v => {
      ytGrid.appendChild(buildYtCard(v.id, v.title, v.ch, false, (id, t, ch) => playYtVideo(id, t, ch)));
    });
    rebuildPlaylist();
    markBlockedCards();
    if (activeYtId) markActiveCard(activeYtId);
  }

  async function renderRecent() {
    const recentGrid = document.getElementById('yt-recent-grid') as HTMLElement;
    const emptyMsg   = document.getElementById('yt-recent-empty') as HTMLElement;
    const recent = await getYtRecent();
    recentGrid.innerHTML = '';
    emptyMsg.classList.toggle('hidden', recent.length > 0);
    recent.forEach(v => {
      recentGrid.appendChild(buildYtCard(v.id, v.title, v.ch, false, (id, t, ch) => playYtVideo(id, t, ch)));
    });
  }

  // Tab bar
  document.querySelectorAll<HTMLButtonElement>('.yt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const pane = btn.dataset['pane']!;
      switchYtPane(pane);
      if (pane === 'recent') void renderRecent();
    });
  });

  // Add custom video form
  const form  = document.getElementById('yt-add-form')    as HTMLFormElement;
  const input = document.getElementById('yt-add-input')   as HTMLInputElement;
  const embedWarning = document.getElementById('yt-embed-warning') as HTMLElement;
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    embedWarning.classList.add('hidden');
    const id = parseYouTubeId(input.value);
    if (!id) { input.classList.add('yt-add-error'); setTimeout(() => input.classList.remove('yt-add-error'), 1200); return; }
    if (customVideos.some(v => v.id === id) || YT_VIDEOS.some(v => v.id === id)) { input.value = ''; return; }
    const btn = form.querySelector('.yt-add-btn') as HTMLButtonElement;
    btn.textContent = '…'; btn.disabled = true;
    const { title, embeddable } = await fetchYtMeta(id);
    customVideos.push({ id, title, addedAt: Date.now() });
    await saveCustomYtVideos(customVideos);
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add`;
    btn.disabled = false; input.value = '';
    if (!embeddable || ytBlockedIds.has(id)) embedWarning.classList.remove('hidden');
    rebuildPlaylist(); renderGrid();
  });

  // Now Playing controls
  ytNpPausePlayBtn?.addEventListener('click', () => {
    if (!activeYtIframe) return;
    // If paused and iframe not loaded (restored from saved state), resume from saved position
    if (ytIsPaused && activeYtId && !activeYtIframe.src.includes('youtube-nocookie.com')) {
      const resumeAt = ytPausedPosition;
      ytPausedPosition = 0;
      playYtVideo(activeYtId, activeYtTitle, activeYtCh, resumeAt);
      return;
    }
    const cmd = ytIsPaused ? 'playVideo' : 'pauseVideo';
    activeYtIframe.contentWindow?.postMessage(`{"event":"command","func":"${cmd}","args":""}`, '*');
    // Optimistic UI update — don't wait for YouTube's state-change echo
    ytIsPaused = !ytIsPaused;
    if (ytIsPaused) {
      // Save paused position immediately so other tabs can read it right away
      ytPausedPosition = Math.max(0, (Date.now() - ytPlayStartedAt) / 1000);
      clearTimeout(ytEndTimer); // don't auto-advance while paused
      void getYtPlayState().then(s => { if (s) void saveYtPlayState({ ...s, isPaused: true, pausedPosition: ytPausedPosition }); });
    } else {
      ytPlayStartedAt = Date.now() - ytPausedPosition * 1000;
      ytPausedPosition = 0;
      scheduleYtEndFallback(Math.max(0, (Date.now() - ytPlayStartedAt) / 1000));
    }
    updatePausePlayUI();
  });
  document.getElementById('yt-np-prev')?.addEventListener('click', ytPlayPrev);
  document.getElementById('yt-np-next')?.addEventListener('click', ytPlayNext);

  const shuffleBtn = document.getElementById('yt-np-shuffle') as HTMLButtonElement;
  shuffleBtn?.addEventListener('click', () => {
    ytShuffle = !ytShuffle;
    shuffleBtn.classList.toggle('active', ytShuffle);
    shuffleBtn.title = ytShuffle ? 'Shuffle: ON' : 'Shuffle: OFF';
    if (ytShuffle) rebuildShuffled();
  });

  const loopBtn = document.getElementById('yt-np-loop') as HTMLButtonElement;
  const loopLabels = { all: 'Loop: All', one: 'Loop: One', none: 'Loop: Off' };
  function updateLoopBtn() {
    loopBtn.title = loopLabels[ytLoopMode];
    loopBtn.style.opacity = ytLoopMode === 'none' ? '0.4' : '1';
    loopBtn.classList.toggle('active', ytLoopMode !== 'none');
    // Show "1" badge for loop-one
    const badge = loopBtn.querySelector<HTMLElement>('.yt-loop-badge');
    if (ytLoopMode === 'one') {
      if (!badge) {
        const b = document.createElement('span'); b.className = 'yt-loop-badge'; b.textContent = '1';
        loopBtn.appendChild(b);
      }
    } else {
      badge?.remove();
    }
  }
  updateLoopBtn();
  loopBtn?.addEventListener('click', () => {
    ytLoopMode = ytLoopMode === 'all' ? 'one' : ytLoopMode === 'one' ? 'none' : 'all';
    updateLoopBtn();
  });

  // Keyboard shortcuts (only when Beats panel is active)
  document.addEventListener('keydown', (e) => {
    const beatsPanel = document.getElementById('panel-beats');
    if (!beatsPanel || beatsPanel.classList.contains('hidden')) return;
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); ytPlayNext(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); ytPlayPrev(); }
    else if (e.key === ' ' && activeYtIframe?.src) {
      e.preventDefault();
      ytNpPausePlayBtn?.click();
    }
  });

  // Start visualizer (runs continuously, reacts to ytIsPaused state)
  startVisualizer(canvas);

  renderGrid();

  // Restore last-played track as paused — never auto-play in a new tab
  // (prevents music starting in every new tab and multiple tabs playing simultaneously)
  const savedState = await getYtPlayState();
  if (savedState && Date.now() - savedState.startedAt < 8 * 3600 * 1000) {
    rebuildPlaylist();
    updateNowPlayingView(savedState.id, savedState.title, savedState.ch);
    ytIsPaused = true;
    // If the track was paused, use the saved paused position.
    // If it was still playing in the other tab, estimate current position from startedAt.
    ytPausedPosition = savedState.isPaused
      ? (savedState.pausedPosition ?? 0)
      : Math.max(0, (Date.now() - savedState.startedAt) / 1000);
    updatePausePlayUI();
    switchYtPane('nowplaying');
  }

  // Live cross-tab sync: when another tab plays something new
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes['mt_yt_play_state']) return;
    const newState = changes['mt_yt_play_state'].newValue as YtPlayState | undefined;
    if (!newState || activeYtId) return; // this tab already has a track loaded
    updateNowPlayingView(newState.id, newState.title, newState.ch);
    ytIsPaused = newState.isPaused;
    updatePausePlayUI();
  });
}

// ─── Tab Sessions ──────────────────────────────────────────────────────────────

/**
 * Reopen a saved session in its own window, preserving order and pinned tabs.
 * Tabs past the first are created inactive and then discarded, so restoring a
 * 30-tab session doesn't try to load 30 pages at once.
 */
async function restoreSession(session: TabSession): Promise<void> {
  const tabs = session.tabs;
  let win: chrome.windows.Window | undefined;
  try {
    win = await chrome.windows.create({ url: tabs[0].url, focused: true });
  } catch {
    // Window creation blocked — fall back to opening in the current window
    tabs.forEach(t => chrome.tabs.create({ url: t.url, active: false }));
    return;
  }
  const windowId = win?.id;
  if (windowId === undefined) return;

  if (tabs[0].pinned && win?.tabs?.[0]?.id !== undefined) {
    try { await chrome.tabs.update(win.tabs[0].id!, { pinned: true }); } catch { /* ignore */ }
  }

  for (let i = 1; i < tabs.length; i++) {
    try {
      const created = await chrome.tabs.create({
        windowId, url: tabs[i].url, index: i, active: false, pinned: tabs[i].pinned === true,
      });
      // Unload it immediately; Chrome reloads on first view
      if (created.id !== undefined && tabs.length > 6) {
        setTimeout(() => { try { void chrome.tabs.discard(created.id!); } catch { /* ignore */ } }, 1500);
      }
    } catch { /* a single bad URL shouldn't abort the rest of the restore */ }
  }
}

async function initTabSessions() {
  const panel = document.getElementById('sessions-panel') as HTMLElement;
  const list  = document.getElementById('sessions-list')  as HTMLElement;
  const emptyEl = document.getElementById('sessions-empty') as HTMLElement;

  async function render() {
    const sessions = await getTabSessions();
    list.innerHTML = '';
    emptyEl.classList.toggle('hidden', sessions.length > 0);
    sessions.forEach(session => {
      const li = document.createElement('li');
      li.className = 'session-item';
      li.innerHTML = `
        <div class="session-meta">
          <span class="session-name">${session.name}</span>
          <span class="session-count">${session.tabs.length} tab${session.tabs.length !== 1 ? 's' : ''}</span>
          <span class="session-time">${new Date(session.savedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
        </div>
        <div class="session-actions">
          <button class="session-btn session-btn--open" data-id="${session.id}" title="Restore session">Open</button>
          <button class="session-btn session-btn--del" data-id="${session.id}" title="Delete session">✕</button>
        </div>`;
      list.appendChild(li);
    });

    list.querySelectorAll<HTMLButtonElement>('.session-btn--open').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset['id']!;
        const sessions = await getTabSessions();
        const session = sessions.find(s => s.id === id);
        if (!session || !session.tabs.length) return;
        await restoreSession(session);
      });
    });

    list.querySelectorAll<HTMLButtonElement>('.session-btn--del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset['id']!;
        const sessions = await getTabSessions();
        await saveTabSessions(sessions.filter(s => s.id !== id));
        render();
      });
    });
  }

  document.getElementById('btn-sessions-toggle')?.addEventListener('click', () => {
    panel.classList.remove('hidden');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) render();
  });

  document.getElementById('btn-sessions-close')?.addEventListener('click', () => panel.classList.remove('open'));

  // URLs no extension may reopen — saving them would only produce dead tabs
  const UNRESTORABLE = /^(chrome|chrome-extension|edge|about|devtools|view-source|file):/i;

  document.getElementById('btn-sessions-save')?.addEventListener('click', async () => {
    // `tabs` is an optional permission, so ask for it before anything else in this
    // handler — chrome.permissions.request() must run inside the user gesture, and a
    // prompt() beforehand would consume it. Resolves immediately if already granted.
    let granted = false;
    try { granted = await chrome.permissions.request({ permissions: ['tabs'] }); }
    catch { granted = false; }
    if (!granted) {
      alert('MonkTab needs permission to read your tabs in order to save a session.\n\n'
          + 'Without it Chrome hides tab URLs, and only a handful of tabs can be saved.');
      return;
    }

    const name = prompt('Session name:', `Session ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}`)?.trim();
    if (!name) return;

    const tabs = await chrome.tabs.query({ currentWindow: true });
    const saved = tabs
      .filter(t => t.url && !UNRESTORABLE.test(t.url))
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))   // preserve left-to-right order
      .map(t => ({
        title: t.title ?? t.url ?? '',
        url: t.url!,
        favicon: t.favIconUrl,
        pinned: t.pinned === true,
      }));

    if (!saved.length) {
      alert('No restorable tabs in this window — browser and extension pages cannot be reopened.');
      return;
    }

    const session: TabSession = {
      id: `sess_${Date.now()}`,
      name,
      savedAt: Date.now(),
      tabs: saved,
    };
    const sessions = await getTabSessions();
    sessions.unshift(session);
    await saveTabSessions(sessions.slice(0, 20));
    render();
  });

  render();
}

// ─── Keyboard shortcuts ────────────────────────────────────────────────────────

function initKeyboardShortcuts() {
  const shortcutsModal = document.getElementById('shortcuts-modal') as HTMLElement;

  document.addEventListener('keydown', (e) => {
    // Don't fire if user is typing in an input/textarea
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'n': e.preventDefault(); document.getElementById('btn-notes-toggle')?.click(); break;
        case 'p': e.preventDefault(); document.getElementById('btn-pomo-toggle')?.click(); break;
        case 'l': e.preventDefault(); document.getElementById('btn-links-toggle')?.click(); break;
        case 'm': e.preventDefault(); document.getElementById('btn-sound-toggle')?.click(); break;
        case 's': e.preventDefault(); document.getElementById('btn-sessions-toggle')?.click(); break;
        case 'w': e.preventDefault(); document.getElementById('btn-news-toggle')?.click(); break;
        case ',': e.preventDefault(); document.getElementById('btn-settings')?.click(); break;
        case '?': e.preventDefault(); shortcutsModal.classList.toggle('hidden'); break;
      }
    }
    if (e.key === 'Escape') {
      shortcutsModal.classList.add('hidden');
      // Close any open panel
      document.querySelectorAll('.notes-panel.open, .links-panel.open, .sessions-panel.open').forEach(p => p.classList.remove('open'));
      document.getElementById('news-panel')?.classList.remove('open');
    }
  });

  document.getElementById('btn-shortcuts-close')?.addEventListener('click', () => shortcutsModal.classList.add('hidden'));
  shortcutsModal.addEventListener('click', (e) => { if (e.target === shortcutsModal) shortcutsModal.classList.add('hidden'); });
}

// ─── Export data ───────────────────────────────────────────────────────────────

function initExportData() {
  document.getElementById('btn-export-data')?.addEventListener('click', async () => {
    const [todos, links, folders, notes, countdowns, sessions, settings] = await Promise.all([
      getTodos(), getLinks(), getFolders(), getNotesList(),
      getCountdowns(),
      getTabSessions(), getSettings(),
    ]);
    const data = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      settings: { name: settings.name, theme: settings.theme },
      todos, links, folders, notes, countdowns, sessions,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monktab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const btn = document.getElementById('btn-export-data') as HTMLButtonElement;
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Exported!`;
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  });
}



// ─── Pomodoro ─────────────────────────────────────────────────────────────────

type PomoMode = 'focus' | 'break' | 'longbreak';

/** Mirrors the focus settings; refreshed whenever settings are saved. */
const pomoCfg = {
  focusMins: 25,
  breakMins: 5,
  longBreakMins: 15,
  roundsPerLongBreak: 4,
  autoStartNext: false,
  focusBlur: true,
  dailyGoalMins: 120,
};

let pomoMode: PomoMode = 'focus';
let pomoTotal = pomoCfg.focusMins * 60;   // length of the interval on screen
let pomoSecondsLeft = pomoTotal;
let pomoInterval: ReturnType<typeof setInterval> | null = null;
let pomoRunning = false;
/** Focus rounds finished in the current set, reset by every long break. */
let pomoRound = 0;

function durationFor(mode: PomoMode): number {
  if (mode === 'focus') return pomoCfg.focusMins * 60;
  if (mode === 'break') return pomoCfg.breakMins * 60;
  return pomoCfg.longBreakMins * 60;
}

function modeLabel(mode: PomoMode): string {
  return mode === 'focus' ? 'Focus' : mode === 'break' ? 'Break' : 'Long break';
}

/** Applies focus settings and, if the timer is idle, re-length the current interval. */
function applyFocusSettings(s: Settings) {
  pomoCfg.focusMins = s.focusMins ?? 25;
  pomoCfg.breakMins = s.breakMins ?? 5;
  pomoCfg.longBreakMins = s.longBreakMins ?? 15;
  pomoCfg.roundsPerLongBreak = s.roundsPerLongBreak ?? 4;
  pomoCfg.autoStartNext = s.autoStartNext ?? false;
  pomoCfg.focusBlur = s.focusBlur ?? true;
  pomoCfg.dailyGoalMins = s.dailyGoalMins ?? 120;

  if (!pomoRunning) {
    pomoTotal = durationFor(pomoMode);
    pomoSecondsLeft = pomoTotal;
  }
  document.getElementById('bg')?.classList.toggle('is-blurred', focusModeActive && pomoCfg.focusBlur);
  renderPomo();
  void renderFocusGoal();
}

function stopTicking() {
  if (pomoInterval) { clearInterval(pomoInterval); pomoInterval = null; }
  pomoRunning = false;
}

function setPomoMode(mode: PomoMode) {
  stopTicking();
  pomoMode = mode;
  pomoTotal = durationFor(mode);
  pomoSecondsLeft = pomoTotal;
  renderPomo();
}

/** Nudges the current interval by ±5 minutes and remembers it as the new default. */
async function nudgeDuration(deltaMins: number) {
  if (pomoRunning) return;
  const mins = Math.round(pomoTotal / 60) + deltaMins;
  const clamped = pomoMode === 'focus'
    ? Math.max(5, Math.min(180, mins))
    : Math.max(1, Math.min(60, mins));
  pomoTotal = clamped * 60;
  pomoSecondsLeft = pomoTotal;

  if (pomoMode === 'focus') pomoCfg.focusMins = clamped;
  else if (pomoMode === 'break') pomoCfg.breakMins = clamped;
  else pomoCfg.longBreakMins = clamped;

  renderPomo();
  await saveSettings({
    focusMins: pomoCfg.focusMins,
    breakMins: pomoCfg.breakMins,
    longBreakMins: pomoCfg.longBreakMins,
  });
  syncFocusSettingsUI();
}

/** Runs when an interval reaches zero, or when the user skips it. */
async function completeInterval(skipped: boolean) {
  stopTicking();
  const wasFocus = pomoMode === 'focus';
  const elapsedMins = Math.round((pomoTotal - pomoSecondsLeft) / 60);

  if (wasFocus) {
    // A skipped round still banks the minutes actually spent, but does not
    // count as a completed round toward the long break.
    const mins = skipped ? elapsedMins : Math.round(pomoTotal / 60);
    if (mins > 0) await logFocusSession(mins);
    if (!skipped) {
      pomoRound++;
      const task = activeTask();
      if (task) {
        task.donePomos = (task.donePomos ?? 0) + 1;
        refreshTodos();
      }
    }
  }

  if (!skipped) {
    chrome.notifications?.create({
      type: 'basic', iconUrl: '/icons/icon48.png', title: 'MonkTab',
      message: wasFocus ? 'Focus round done — take a break.' : 'Break over — back to it!',
    });
    playPomoChime(wasFocus);
  }

  let next: PomoMode;
  if (wasFocus) {
    next = pomoCfg.roundsPerLongBreak > 0 && pomoRound % pomoCfg.roundsPerLongBreak === 0
      ? 'longbreak' : 'break';
  } else {
    if (pomoMode === 'longbreak') pomoRound = 0;
    next = 'focus';
  }

  setPomoMode(next);
  void renderFocusStats();
  void renderFocusGoal();
  if (pomoCfg.autoStartNext && !skipped) startPomo();
}

function startPomo() {
  if (pomoRunning) return;
  pomoRunning = true;
  pomoInterval = setInterval(() => {
    pomoSecondsLeft--;
    renderPomo();
    if (pomoSecondsLeft <= 0) void completeInterval(false);
  }, 1000);
  renderPomo();
}

function pausePomo() {
  stopTicking();
  renderPomo();
}

function formatPomo(s: number) {
  const safe = Math.max(0, s);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** Round progress toward the next long break, drawn in both the panel and focus mode. */
function renderPomoDots() {
  const per = Math.max(1, pomoCfg.roundsPerLongBreak);
  const filled = pomoRound % per;
  const html = Array.from({ length: per }, (_, i) => {
    const on = i < filled || (i === filled && pomoMode === 'focus' && pomoRunning);
    const active = i === filled && pomoMode === 'focus';
    return `<span class="pd${on ? ' on' : ''}${active ? ' now' : ''}"></span>`;
  }).join('');
  const dots = document.getElementById('pomo-dots');
  if (dots) dots.innerHTML = html;
  const fmDots = document.getElementById('fm-dots');
  if (fmDots) fmDots.innerHTML = html;
}

function renderPomo() {
  const timerEl = document.getElementById('pomo-timer');
  if (timerEl) timerEl.textContent = formatPomo(pomoSecondsLeft);
  const startEl = document.getElementById('pomo-start');
  if (startEl) startEl.textContent = pomoRunning ? 'Pause' : 'Start';

  // The tab title doubles as a timer when the panel is out of sight
  document.title = pomoRunning ? `${formatPomo(pomoSecondsLeft)} — ${modeLabel(pomoMode)}` : 'MonkTab';

  // Break modes share the "Break" tab; long break is a longer flavour of it
  document.querySelectorAll<HTMLButtonElement>('.pomo-tab').forEach(b =>
    b.classList.toggle('active', (b.dataset['mode'] === 'focus') === (pomoMode === 'focus')));

  renderPomoDots();
  syncFocusMode();
}

function playPomoChime(isFocusEnd: boolean) {
  try {
    const ctx = new AudioContext();
    // Two-tone chime: a pleasant descending or ascending pair
    const notes = isFocusEnd ? [880, 660] : [660, 880]; // focus end: high→low, break end: low→high
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.28;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t); osc.stop(t + 0.55);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* AudioContext unavailable */ }
}

/** The task the timer is pointed at — an explicit pick, else the top open task. */
function activeTask(): Todo | undefined {
  const open = todos.filter(t => !t.done);
  if (activeTaskId) {
    const picked = open.find(t => t.id === activeTaskId);
    if (picked) return picked;
    activeTaskId = null; // it was completed or deleted
  }
  return open.find(isToday) ?? open[0];
}

function updatePomoTask() {
  const sel = document.getElementById('pomo-task-select') as HTMLSelectElement | null;
  const open = todos.filter(t => !t.done);

  if (sel) {
    sel.innerHTML = '<option value="">— No task —</option>';
    open.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.text;
      sel.appendChild(opt);
    });
    sel.value = activeTaskId && open.some(t => t.id === activeTaskId) ? activeTaskId : '';
  }

  const task = activeTask();
  const text = task?.text ?? '';
  const panelLabel = document.getElementById('pomo-task');
  if (panelLabel) panelLabel.textContent = text;
  if (fmTaskLabelEl) {
    fmTaskLabelEl.textContent = text;
    const est = task?.estPomos ?? 0;
    fmTaskLabelEl.title = est ? `${task?.donePomos ?? 0} of ${est} rounds` : text;
  }
}

function initPomodoro() {
  document.querySelectorAll<HTMLButtonElement>('.pomo-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      setPomoMode(btn.dataset['mode'] === 'focus' ? 'focus' : 'break');
    });
  });

  document.getElementById('pomo-start')?.addEventListener('click', () => {
    if (pomoRunning) pausePomo(); else startPomo();
  });

  document.getElementById('pomo-reset')?.addEventListener('click', () => setPomoMode(pomoMode));
  document.getElementById('pomo-skip')?.addEventListener('click', () => void completeInterval(true));

  // Stats / Timer tab switching
  document.querySelectorAll<HTMLButtonElement>('.pomo-header-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pomo-header-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isStats = btn.dataset['ptab'] === 'stats';
      document.getElementById('pomo-timer-view')?.classList.toggle('hidden', isStats);
      document.getElementById('pomo-stats-view')?.classList.toggle('hidden', !isStats);
      if (isStats) void renderFocusStats();
    });
  });

  document.getElementById('btn-pomo-toggle')?.addEventListener('click', () => {
    document.getElementById('pomodoro-panel')?.classList.toggle('hidden');
    updatePomoTask();
  });

  document.getElementById('pomo-task-select')?.addEventListener('change', (e) => {
    activeTaskId = (e.target as HTMLSelectElement).value || null;
    updatePomoTask();
    renderTodos();
    renderFmTodos();
  });

  renderPomo();
}

/** Last 7 days of focus minutes, oldest first. */
async function focusWeek() {
  const history = await getFocusHistory();
  const days: { label: string; date: string; minutes: number; sessions: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const entry = history.find(h => h.date === dateStr);
    days.push({
      label: ['S','M','T','W','T','F','S'][d.getDay()],
      date: dateStr,
      minutes: entry?.minutes ?? 0,
      sessions: entry?.sessions ?? 0,
    });
  }
  return { history, days };
}

function minsLabel(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Consecutive days ending today (or yesterday) that had at least one session. */
function focusStreak(history: { date: string; sessions: number }[]): number {
  const byDate = new Map(history.map(h => [h.date, h.sessions]));
  const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  let streak = 0;
  const cursor = new Date();
  // A day that has not been used yet should not break yesterday's streak
  if (!(byDate.get(iso(cursor)) ?? 0)) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    if ((byDate.get(iso(cursor)) ?? 0) > 0) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  return streak;
}

async function renderFocusStats() {
  const { history, days } = await focusWeek();
  const today = todayString();
  const todayEntry = history.find(h => h.date === today);
  const todayMins = todayEntry?.minutes ?? 0;

  const set = (id: string, v: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };

  set('stat-today-mins', minsLabel(todayMins));
  set('stat-sessions', String(todayEntry?.sessions ?? 0));
  set('stat-tasks-done', String(todos.filter(t => t.done).length));
  set('stat-streak', String(focusStreak(history)));

  // Daily goal bar
  const goal = Math.max(1, pomoCfg.dailyGoalMins);
  const goalPct = Math.min(100, Math.round((todayMins / goal) * 100));
  const goalBar = document.getElementById('focus-goal-bar') as HTMLElement | null;
  if (goalBar) goalBar.style.width = goalPct + '%';
  set('focus-goal-label', `${goalPct}% of your ${minsLabel(goal)} goal`);

  const chartHtml = weekChartHtml(days, today);
  const chart = document.getElementById('focus-chart');
  if (chart) chart.innerHTML = chartHtml;

  // ── Focus-mode stats card ──
  set('fm-sc-today', minsLabel(todayMins));
  set('fm-sc-rounds', String(todayEntry?.sessions ?? 0));
  set('fm-sc-tasks', String(todos.filter(t => t.done).length));
  set('fm-sc-week', minsLabel(days.reduce((n, d) => n + d.minutes, 0)));
  const streak = focusStreak(history);
  set('fm-sc-streak', streak > 0 ? `🔥 ${streak} day${streak === 1 ? '' : 's'}` : '');
  const fmChart = document.getElementById('fm-sc-chart');
  if (fmChart) fmChart.innerHTML = chartHtml;
}

function weekChartHtml(days: { label: string; date: string; minutes: number }[], today: string): string {
  // The goal line gives the bars a fixed reference, so a good day looks like one
  const maxMins = Math.max(...days.map(d => d.minutes), pomoCfg.dailyGoalMins, 30);
  return days.map(d => {
    const pct = Math.round((d.minutes / maxMins) * 100);
    const isToday = d.date === today;
    const hit = d.minutes >= pomoCfg.dailyGoalMins && d.minutes > 0;
    return `<div class="fc-col">
      <div class="fc-bar-wrap">
        <div class="fc-bar${isToday ? ' fc-bar-today' : ''}${hit ? ' fc-bar-hit' : ''}"
          style="height:${Math.max(pct, d.minutes > 0 ? 8 : 2)}%" title="${minsLabel(d.minutes)}"></div>
      </div>
      <span class="fc-day${isToday ? ' fc-day-today' : ''}">${d.label}</span>
    </div>`;
  }).join('');
}

// ─── Focus Mode ───────────────────────────────────────────────────────────────

const FM_CIRC = 879.65;  // 2π × 140
const FM_GOAL_CIRC = 94.25; // 2π × 15

let focusModeActive = false;
let fmFilter: 'today' | 'all' = 'today';
// References to focus mode elements (set once on init)
let fmTimeEl: HTMLElement | null = null;
let fmArcEl: SVGCircleElement | null = null;
let fmTaskLabelEl: HTMLElement | null = null;
let fmPlayIcon: HTMLElement | null = null;
let fmPauseIcon: HTMLElement | null = null;

// Called by renderPomo every second to keep focus mode in sync
function syncFocusMode() {
  if (!focusModeActive || !fmTimeEl || !fmArcEl) return;
  fmTimeEl.textContent = formatPomo(pomoSecondsLeft);
  const progress = pomoTotal > 0 ? (pomoTotal - pomoSecondsLeft) / pomoTotal : 0;
  fmArcEl.style.strokeDashoffset = String(FM_CIRC * (1 - progress));

  if (fmPlayIcon && fmPauseIcon) {
    fmPlayIcon.classList.toggle('hidden', pomoRunning);
    fmPauseIcon.classList.toggle('hidden', !pomoRunning);
  }

  const overlay = document.getElementById('focus-mode');
  overlay?.classList.toggle('is-break', pomoMode !== 'focus');

  const title = document.getElementById('fm-title');
  if (title) title.textContent = pomoMode === 'focus' ? 'Focusing' : modeLabel(pomoMode);
  const session = document.getElementById('fm-session-label');
  if (session) {
    session.textContent = pomoMode === 'focus'
      ? `Round ${(pomoRound % Math.max(1, pomoCfg.roundsPerLongBreak)) + 1} of ${pomoCfg.roundsPerLongBreak}`
      : '';
  }

  // Length can only be changed between intervals
  document.querySelectorAll<HTMLButtonElement>('.fm-dur-btn').forEach(b => { b.disabled = pomoRunning; });

  document.querySelectorAll<HTMLButtonElement>('.fm-mode-tab').forEach(b =>
    b.classList.toggle('active', (b.dataset['fmode'] === 'focus') === (pomoMode === 'focus')));
}

/** The daily-goal ring in the focus mode top bar. */
async function renderFocusGoal() {
  const arc = document.getElementById('fm-goal-arc') as unknown as SVGCircleElement | null;
  const text = document.getElementById('fm-goal-text');
  if (!arc && !text) return;

  const history = await getFocusHistory();
  const mins = history.find(h => h.date === todayString())?.minutes ?? 0;
  const goal = Math.max(1, pomoCfg.dailyGoalMins);
  const frac = Math.min(1, mins / goal);

  if (arc) {
    arc.style.strokeDashoffset = String(FM_GOAL_CIRC * (1 - frac));
    arc.classList.toggle('is-complete', frac >= 1);
  }
  if (text) text.textContent = minsLabel(mins);
  const chip = document.getElementById('fm-stats-chip');
  chip?.setAttribute('title', `${minsLabel(mins)} of your ${minsLabel(goal)} daily goal`);
}

// Render todos in focus mode sidebar
function renderFmTodos() {
  const list = document.getElementById('fm-todo-list') as HTMLUListElement | null;
  if (!list) return;
  list.innerHTML = '';

  const open = todos.filter(t => !t.done);
  const visible = fmFilter === 'today' ? open.filter(isToday) : open;

  const countEl = document.getElementById('fm-tasks-count');
  if (countEl) countEl.textContent = visible.length ? String(visible.length) : '';

  if (visible.length === 0) {
    list.innerHTML = `<li class="fm-todo-empty">${
      fmFilter === 'today' ? 'Nothing on today’s list' : 'No open tasks'
    }</li>`;
    return;
  }

  const current = activeTask();
  visible.forEach((todo) => {
    const li = document.createElement('li');
    li.className = `fm-todo${todo.id === current?.id ? ' is-active' : ''}`;

    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'fm-cb'; cb.checked = todo.done;
    cb.addEventListener('change', () => {
      todo.done = cb.checked;
      if (todo.done) todo.doneAt = Date.now();
      refreshTodos();
      void renderFocusStats();
    });

    // Clicking the row points the timer at that task
    const body = document.createElement('button');
    body.className = 'fm-todo-body';
    body.title = 'Focus on this task';
    const span = document.createElement('span');
    span.className = 'fm-todo-text';
    span.textContent = todo.text;
    body.appendChild(span);

    const est = todo.estPomos ?? 0;
    const done = todo.donePomos ?? 0;
    if (est > 0 || done > 0) {
      const chip = document.createElement('span');
      chip.className = 'fm-todo-pomo';
      chip.textContent = est > 0 ? `${done}/${est}` : String(done);
      body.appendChild(chip);
    }

    body.addEventListener('click', () => {
      activeTaskId = todo.id;
      updatePomoTask();
      renderFmTodos();
      renderTodos();
    });

    li.append(cb, body);
    list.appendChild(li);
  });
}

// Shared sound state between main panel and focus mode
let fmSoundInfo: { label: string; variantId: string } | null = null;

function updateFmSoundChip() {
  const playingEl = document.getElementById('fm-sound-playing');
  const nameEl = document.getElementById('fm-sound-name');
  if (!playingEl || !nameEl) return;
  if (fmSoundInfo) {
    nameEl.textContent = fmSoundInfo.label;
    playingEl.classList.remove('hidden');
  } else {
    playingEl.classList.add('hidden');
  }
}

function enterFocusMode() {
  focusModeActive = true;
  const overlay = document.getElementById('focus-mode') as HTMLElement;
  overlay.classList.remove('hidden');
  fmTimeEl = document.getElementById('fm-time');
  fmArcEl = document.getElementById('fm-ring-arc') as unknown as SVGCircleElement;
  fmTaskLabelEl = document.getElementById('fm-task-label');
  fmPlayIcon = document.getElementById('fm-play-icon');
  fmPauseIcon = document.getElementById('fm-pause-icon');

  if (pomoCfg.focusBlur) document.getElementById('bg')?.classList.add('is-blurred');

  // Sync quote
  const qtSrc = document.getElementById('quote-text')?.textContent ?? '';
  const qEl = document.getElementById('fm-quote-text');
  if (qEl) qEl.textContent = qtSrc;

  renderFmTodos();
  renderPomoDots();
  updateFmSoundChip();
  syncFocusMode();
  updatePomoTask();
  void renderFocusGoal();
  void renderFocusStats();
}

function exitFocusMode() {
  focusModeActive = false;
  document.getElementById('focus-mode')?.classList.add('hidden');
  document.getElementById('fm-stats-card')?.classList.add('hidden');
  document.getElementById('bg')?.classList.remove('is-blurred');
  // Hand the shared player back so the music panel is not left with an empty slot.
  // Playback is unaffected — the audio iframe never moves.
  mountNowPlayer('panel');
}

function initFocusMode() {
  // Enter button in pomo panel
  document.getElementById('btn-enter-focus')?.addEventListener('click', () => {
    document.getElementById('pomodoro-panel')?.classList.add('hidden');
    enterFocusMode();
  });

  // Exit button + ESC, and Space as play/pause
  document.getElementById('btn-focus-exit')?.addEventListener('click', exitFocusMode);
  document.addEventListener('keydown', (e) => {
    if (!focusModeActive) return;
    if (e.key === 'Escape') { exitFocusMode(); return; }
    // Never steal the spacebar from the task composer
    const tag = (e.target as HTMLElement)?.tagName;
    if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      if (pomoRunning) pausePomo(); else startPomo();
    }
  });

  // Mode tabs
  document.querySelectorAll<HTMLButtonElement>('.fm-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setPomoMode(btn.dataset['fmode'] === 'focus' ? 'focus' : 'break');
    });
  });

  document.getElementById('fm-start')?.addEventListener('click', () => {
    if (pomoRunning) pausePomo(); else startPomo();
  });
  document.getElementById('fm-reset')?.addEventListener('click', () => setPomoMode(pomoMode));
  document.getElementById('fm-skip')?.addEventListener('click', () => void completeInterval(true));
  document.getElementById('fm-dur-minus')?.addEventListener('click', () => void nudgeDuration(-5));
  document.getElementById('fm-dur-plus')?.addEventListener('click', () => void nudgeDuration(5));

  // Task filter tabs
  document.querySelectorAll<HTMLButtonElement>('.fm-tt').forEach(btn => {
    btn.addEventListener('click', () => {
      fmFilter = btn.dataset['fmfilter'] as typeof fmFilter;
      document.querySelectorAll('.fm-tt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderFmTodos();
    });
  });

  // Add task from focus mode — lands on today's list, since that is the context
  document.getElementById('fm-todo-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('fm-todo-input') as HTMLInputElement;
    const parsed = parseQuickAdd(input.value);
    if (!parsed.text) return;
    todos.push({
      id: uid(),
      text: parsed.text,
      done: false,
      priority: parsed.priority ?? 'none',
      dueDate: parsed.dueDate,
      estPomos: parsed.estPomos,
      donePomos: 0,
      today: parsed.dueDate ? undefined : true,
      createdAt: Date.now(),
    });
    input.value = '';
    refreshTodos();
  });

  // Stats card
  const statsChip = document.getElementById('fm-stats-chip');
  const statsCard = document.getElementById('fm-stats-card');
  statsChip?.addEventListener('click', (e) => {
    e.stopPropagation();
    statsCard?.classList.toggle('hidden');
    if (!statsCard?.classList.contains('hidden')) void renderFocusStats();
  });
  document.addEventListener('click', (e) => {
    if (!statsCard || statsCard.classList.contains('hidden')) return;
    if (!statsCard.contains(e.target as Node) && !statsChip?.contains(e.target as Node)) {
      statsCard.classList.add('hidden');
    }
  });
  // ── Focus Mode Mini Sound Picker ──────────────────────────────────────────
  const chip = document.getElementById('fm-sound-chip') as HTMLButtonElement;
  const picker = document.getElementById('fm-sound-picker') as HTMLElement;
  const fmGrid = document.getElementById('fm-sound-grid') as HTMLElement;
  const fmVariantBar = document.getElementById('fm-variant-bar') as HTMLElement;
  const fmVol = document.getElementById('fm-volume') as HTMLInputElement;
  let fmActiveCat: string | null = null;
  let fmActiveVariant: string | null = null;

  // Toggle picker open/close
  chip.addEventListener('click', () => {
    picker.classList.toggle('hidden');
  });
  // Close picker when clicking outside
  document.addEventListener('click', (e) => {
    if (!chip.contains(e.target as Node) && !picker.contains(e.target as Node)) {
      picker.classList.add('hidden');
    }
  });

  // Volume slider synced with main slider
  fmVol.value = (document.getElementById('sound-volume') as HTMLInputElement)?.value ?? '50';
  fmVol.addEventListener('input', () => {
    const v = parseInt(fmVol.value, 10);
    setSoundVolume(v);
    ytSetVolume(v);
    const mainSlider = document.getElementById('sound-volume') as HTMLInputElement;
    if (mainSlider) mainSlider.value = fmVol.value;
  });

  function fmShowVariants(sc: typeof SOUNDSCAPES[0]) {
    fmVariantBar.innerHTML = '';
    fmVariantBar.classList.remove('hidden');
    sc.variants.forEach((v, i) => {
      const chip2 = document.createElement('button');
      chip2.className = `sv-chip${fmActiveVariant === v.id ? ' active' : ''}`;
      chip2.textContent = v.label;
      chip2.addEventListener('mouseenter', () => preloadSoundscape(v.id), { once: true });
      chip2.addEventListener('click', () => {
        if (fmActiveVariant === v.id) {
          // Toggle off
          stopSoundscape();
          fmActiveVariant = null; fmActiveCat = null; fmSoundInfo = null;
          fmGrid.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
          fmVariantBar.querySelectorAll('.sv-chip').forEach(c => c.classList.remove('active'));
          fmVariantBar.classList.add('hidden');
          updateFmSoundChip();
          // Also sync main panel
          document.getElementById('sound-grid')?.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
          document.getElementById('sound-now-playing')?.parentElement?.classList.add('hidden');
          return;
        }
        stopSoundscape();
        fmActiveVariant = v.id; fmActiveCat = sc.id;
        fmSoundInfo = { label: v.label, variantId: v.id };
        playSoundscape(v.id, parseInt(fmVol.value, 10));
        fmVariantBar.querySelectorAll('.sv-chip').forEach(c => c.classList.remove('active'));
        chip2.classList.add('active');
        updateFmSoundChip();
        // Sync now-playing in main panel too
        const mainNp = document.getElementById('sound-now-playing');
        if (mainNp) { mainNp.textContent = v.label; mainNp.parentElement?.classList.remove('hidden'); }
      });
      fmVariantBar.appendChild(chip2);
      if (i === 0 && fmActiveCat !== sc.id) chip2.click();
    });
  }

  // Build the FM ambient sound grid
  SOUNDSCAPES.forEach(sc => {
    const btn = document.createElement('button');
    btn.className = 'sound-btn fm-sc-btn';
    btn.dataset['id'] = sc.id;
    btn.innerHTML = `<span class="sound-icon">${sc.svg}</span><span class="sound-label">${sc.label}</span>`;
    btn.addEventListener('click', () => {
      if (fmActiveCat === sc.id) {
        stopSoundscape();
        fmActiveCat = null; fmActiveVariant = null; fmSoundInfo = null;
        fmGrid.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
        fmVariantBar.classList.add('hidden');
        updateFmSoundChip();
        return;
      }
      fmGrid.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      fmActiveCat = sc.id; fmActiveVariant = null;
      fmShowVariants(sc);
    });
    fmGrid.appendChild(btn);
  });

  // ── FM YouTube tab ──────────────────────────────────────────────────────────
  const fmAmbientSection = document.getElementById('fm-ambient-section') as HTMLElement;
  const fmYtSection = document.getElementById('fm-yt-section') as HTMLElement;
  const fmYtGrid = document.getElementById('fm-yt-grid') as HTMLElement;
  const fmYtMount = document.getElementById('fm-yt-mount') as HTMLElement;

  /** Swaps the focus-mode YouTube tab between the library grid and the shared player. */
  function fmShowPlayer(show: boolean) {
    fmYtGrid.classList.toggle('hidden', show);
    fmYtMount.classList.toggle('hidden', !show);
    mountNowPlayer(show ? 'focus' : 'panel');
  }

  picker.querySelectorAll<HTMLButtonElement>('.fm-sp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      picker.querySelectorAll('.fm-sp-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isYt = tab.dataset['fptab'] === 'youtube';
      fmAmbientSection.classList.toggle('hidden', isYt);
      fmYtSection.classList.toggle('hidden', !isYt);
      if (isYt) {
        // Stop ambient when switching to YouTube
        stopSoundscape(); fmActiveCat = null; fmActiveVariant = null;
        fmGrid.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
        fmVariantBar.classList.add('hidden');
        // Already listening to something? Open straight into the player
        fmShowPlayer(hasActiveTrack());
      } else {
        // Leaving the tab hands the player back, but does not stop playback —
        // the music panel behaves the same way when you switch to Soundscapes
        fmShowPlayer(false);
      }
    });
  });

  // Build FM YouTube grid (shared custom videos + built-in)
  async function renderFmYtGrid() {
    fmYtGrid.innerHTML = '';
    const customVideos = await getCustomYtVideos();

    function fmPlay(id: string, title: string, ch: string) {
      fmShowPlayer(true);
      // Same playlist, same iframe, same controls as the music panel
      if (!ytPlaylist.length) ytPlaylist = [...YT_VIDEOS];
      playYtVideo(id, title, ch);
    }

    if (customVideos.length > 0) {
      const hdr = document.createElement('div');
      hdr.className = 'yt-section-hdr';
      hdr.innerHTML = `<span>MY PLAYLIST <span class="yt-count">${customVideos.length}</span></span>`;
      fmYtGrid.appendChild(hdr);
      customVideos.slice().reverse().forEach(v => {
        fmYtGrid.appendChild(buildYtCard(v.id, v.title, 'My Playlist', false, fmPlay));
      });
      const div = document.createElement('div');
      div.className = 'yt-section-hdr';
      div.innerHTML = '<span>BUILT-IN</span>';
      fmYtGrid.appendChild(div);
    }

    YT_VIDEOS.forEach(v => {
      fmYtGrid.appendChild(buildYtCard(v.id, v.title, v.ch, false, fmPlay));
    });
  }
  renderFmYtGrid();

  // FM add form — adds to shared storage and refreshes both grids
  const fmAddForm = document.getElementById('fm-yt-add-form') as HTMLFormElement;
  const fmAddInput = document.getElementById('fm-yt-add-input') as HTMLInputElement;
  const fmEmbedWarning = document.getElementById('fm-yt-embed-warning') as HTMLElement;
  fmAddForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    fmEmbedWarning.classList.add('hidden');
    const id = parseYouTubeId(fmAddInput.value);
    if (!id) { fmAddInput.classList.add('yt-add-error'); setTimeout(() => fmAddInput.classList.remove('yt-add-error'), 1200); return; }
    const existing = await getCustomYtVideos();
    if (existing.some(v => v.id === id) || YT_VIDEOS.some(v => v.id === id)) { fmAddInput.value = ''; return; }
    const btn = fmAddForm.querySelector('.yt-add-btn') as HTMLButtonElement;
    btn.textContent = '…'; btn.disabled = true;
    const { title, embeddable } = await fetchYtMeta(id);
    existing.push({ id, title, addedAt: Date.now() });
    await saveCustomYtVideos(existing);
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add`;
    btn.disabled = false;
    fmAddInput.value = '';
    if (!embeddable) fmEmbedWarning.classList.remove('hidden');
    renderFmYtGrid();
  });

  // Back to the library — browsing does not interrupt what is playing
  document.getElementById('fm-yt-back')?.addEventListener('click', () => fmShowPlayer(false));

  // The focus-mode task form is wired at the top of initFocusMode, alongside the
  // rest of the task controls.
}

// ─── Vision Board (custom backgrounds) ───────────────────────────────────────

function renderCustomBgGrid(settings: Settings) {
  const grid = document.getElementById('custom-bg-grid') as HTMLElement;
  grid.innerHTML = '';
  settings.customBackgrounds.forEach((dataUrl, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'custom-bg-item';
    const img = document.createElement('img');
    img.className = `custom-bg-thumb${settings.activeCustomBg === i ? ' active' : ''}`;
    img.src = dataUrl;
    img.title = 'Set as background';
    img.onerror = () => { img.classList.add('is-broken'); img.title = 'This image could not be loaded'; };
    img.addEventListener('click', () => {
      settings.activeCustomBg = i;
      settings.activeBackground = 'custom';
      (document.getElementById('bg-custom') as HTMLInputElement).checked = true;
      grid.querySelectorAll('.custom-bg-thumb').forEach((el, idx) => el.classList.toggle('active', idx === i));
    });
    const del = document.createElement('button');
    del.className = 'del-bg'; del.textContent = '✕';
    del.addEventListener('click', () => {
      settings.customBackgrounds.splice(i, 1);
      if (settings.activeCustomBg >= settings.customBackgrounds.length) settings.activeCustomBg = 0;
      renderCustomBgGrid(settings);
    });
    wrap.append(img, del);
    grid.appendChild(wrap);
  });
}

const MAX_CUSTOM_BG = 12;

function initVisionBoard(settings: Settings) {
  renderCustomBgGrid(settings);

  (document.getElementById('bg-daily') as HTMLInputElement).checked = settings.activeBackground === 'daily';
  (document.getElementById('bg-custom') as HTMLInputElement).checked = settings.activeBackground === 'custom';

  document.getElementById('bg-upload')?.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const room = MAX_CUSTOM_BG - settings.customBackgrounds.length;
    if (room <= 0) { alert(`Maximum ${MAX_CUSTOM_BG} photos. Remove one first.`); return; }

    files.slice(0, room).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        settings.customBackgrounds.push(ev.target?.result as string);
        settings.activeBackground = 'custom';
        renderCustomBgGrid(settings);
      };
      reader.readAsDataURL(file);
    });
    input.value = '';   // let the same file be re-picked after a delete
  });

  // Paste a link instead of uploading — useful for images already hosted somewhere
  const urlInput = document.getElementById('bg-url-input') as HTMLInputElement | null;
  const addUrl = () => {
    const raw = urlInput?.value.trim() ?? '';
    if (!raw) return;
    if (!/^https:\/\//i.test(raw)) { alert('Image links must start with https://'); return; }
    if (settings.customBackgrounds.length >= MAX_CUSTOM_BG) {
      alert(`Maximum ${MAX_CUSTOM_BG} photos. Remove one first.`); return;
    }
    settings.customBackgrounds.push(raw);
    settings.activeCustomBg = settings.customBackgrounds.length - 1;
    settings.activeBackground = 'custom';
    urlInput!.value = '';
    renderCustomBgGrid(settings);
  };
  document.getElementById('bg-url-add')?.addEventListener('click', addUrl);
  urlInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } });

  initBgTopics(settings);
}

/**
 * Topic chips + a free-text box. The chips are presets; anything typed is passed
 * through to the same image search, so "tokyo at night" works as well as "Nature".
 */
function initBgTopics(settings: Settings) {
  const chipsEl = document.getElementById('bg-topic-chips') as HTMLElement | null;
  const input   = document.getElementById('bg-topic-input') as HTMLInputElement | null;
  const block   = document.getElementById('bg-topic-block') as HTMLElement | null;
  if (!chipsEl || !input || !block) return;

  const isPreset = (t: string) => BG_TOPICS.some(x => x.id === t);

  const paint = () => {
    chipsEl.querySelectorAll<HTMLElement>('.bg-chip').forEach(el =>
      el.classList.toggle('active', el.dataset['topic'] === settings.backgroundTopic));
    // A custom topic lives in the text box; a preset leaves it empty
    input.value = isPreset(settings.backgroundTopic) ? '' : settings.backgroundTopic;
  };

  chipsEl.innerHTML = BG_TOPICS.map(t =>
    `<button class="bg-chip" data-topic="${t.id}" type="button">` +
    `<span class="bg-chip-emoji">${t.emoji}</span>${t.label}</button>`).join('');
  chipsEl.querySelectorAll<HTMLElement>('.bg-chip').forEach((el) => {
    el.addEventListener('click', () => {
      settings.backgroundTopic = el.dataset['topic']!;
      settings.backgroundSource = 'topic';
      syncBgSourceSeg(settings.backgroundSource);
      paint();
    });
  });

  const applyCustom = () => {
    const v = input.value.trim();
    if (!v) return;
    settings.backgroundTopic = v;
    settings.backgroundSource = 'topic';
    syncBgSourceSeg(settings.backgroundSource);
    paint();
  };
  document.getElementById('bg-topic-apply')?.addEventListener('click', applyCustom);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyCustom(); } });

  // Source selector: only the topic mode needs the chips visible
  const seg = document.getElementById('seg-bgsrc');
  seg?.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      settings.backgroundSource = b.dataset['val'] as Settings['backgroundSource'];
      syncBgSourceSeg(settings.backgroundSource);
    });
  });

  syncBgSourceSeg(settings.backgroundSource);
  paint();
}

function syncBgSourceSeg(source: string) {
  document.getElementById('seg-bgsrc')?.querySelectorAll<HTMLButtonElement>('.seg-btn')
    .forEach(b => b.classList.toggle('active', b.dataset['val'] === source));
  document.getElementById('bg-topic-block')?.classList.toggle('hidden', source !== 'topic');
}

// ─── World Clocks settings ────────────────────────────────────────────────────

// ─── Timezone search picker ───────────────────────────────────────────────────

/** Current wall-clock time in a zone, for the preview column. */
function tzNow(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
  } catch { return '--:--'; }
}

/** UTC offset like "+5:30", computed live so it follows daylight saving. */
function tzOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date());
    const name = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
    return name.replace('GMT', 'UTC').replace(/UTC([+-])0?(\d)/, 'UTC$1$2') || 'UTC';
  } catch { return ''; }
}

/**
 * Rank a zone against the query. Lower score is better; -1 means no match.
 * Prefix matches beat substring matches, and city beats country beats zone id.
 * When the hit came from an alias, that alias becomes the display name — someone
 * typing "Bangalore" should see Bangalore, not the zone's name of Kolkata.
 */
function tzMatch(e: TzEntry, q: string): TzHit | null {
  const label = e.label.toLowerCase();
  const country = e.country.toLowerCase();
  const hit = (score: number, display = e.label): TzHit => ({ e, display, score });

  if (label === q) return hit(0);
  if (country === q) return hit(0.2);
  for (const a of e.aliases) {
    const al = a.toLowerCase();
    if (al === q) return hit(0.1, a);
    if (al.startsWith(q)) return hit(1.5, a);
  }
  if (label.startsWith(q)) return hit(1);
  if (country.startsWith(q)) return hit(2);
  if (label.includes(q)) return hit(3);
  for (const a of e.aliases) if (a.toLowerCase().includes(q)) return hit(4, a);
  if (country.includes(q)) return hit(5);
  if (e.tz.toLowerCase().replace(/_/g, ' ').includes(q)) return hit(6);
  return null;
}

function tzSearch(query: string): TzHit[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return POPULAR_TZ
      .map(tz => TIMEZONES.find(e => e.tz === tz))
      .filter((e): e is TzEntry => !!e)
      .map(e => ({ e, display: e.label, score: 0 }));
  }
  return TIMEZONES
    .map(e => tzMatch(e, q))
    .filter((r): r is TzHit => r !== null)
    .sort((a, b) => a.score - b.score || a.display.localeCompare(b.display))
    .slice(0, 60);
}

/** Wire the type-to-search timezone picker. `onPick` receives the chosen zone. */
function initTzPicker(onPick: (label: string, tz: string) => void) {
  const input   = document.getElementById('tz-search') as HTMLInputElement | null;
  const results = document.getElementById('tz-results') as HTMLElement | null;
  const clearBtn = document.getElementById('tz-clear') as HTMLButtonElement | null;
  if (!input || !results) return;

  let active = -1;
  let shown: TzHit[] = [];

  const close = () => {
    results.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };

  function paint() {
    shown = tzSearch(input!.value);
    if (!shown.length) {
      results!.innerHTML = `<div class="tz-no-result">No city or country matches “${newsEscape(input!.value)}”</div>`;
    } else {
      const heading = input!.value.trim() ? '' : '<div class="tz-group">Popular</div>';
      results!.innerHTML = heading + shown.map(({ e, display }, i) => `
        <button class="tz-row${i === active ? ' tz-row--active' : ''}" role="option"
                data-i="${i}" type="button" aria-selected="${i === active}">
          <span class="tz-flag">${countryFlag(e.cc)}</span>
          <span class="tz-names">
            <span class="tz-city">${newsEscape(display)}</span>
            <span class="tz-country">${newsEscape(e.country)} · ${newsEscape(tzOffset(e.tz))}</span>
          </span>
          <span class="tz-time">${tzNow(e.tz)}</span>
        </button>`).join('');
    }
    results!.classList.remove('hidden');
    input!.setAttribute('aria-expanded', 'true');
    clearBtn?.classList.toggle('hidden', !input!.value);
  }

  function choose(i: number) {
    const hit = shown[i];
    if (!hit) return;
    onPick(hit.display, hit.e.tz);   // label the clock with the name they typed
    input!.value = '';
    close();
    clearBtn?.classList.add('hidden');
  }

  function moveActive(delta: number) {
    if (!shown.length) return;
    active = (active + delta + shown.length) % shown.length;
    results!.querySelectorAll<HTMLElement>('.tz-row').forEach((el, i) => {
      el.classList.toggle('tz-row--active', i === active);
      el.setAttribute('aria-selected', String(i === active));
      if (i === active) el.scrollIntoView({ block: 'nearest' });
    });
  }

  input.addEventListener('input', () => { active = -1; paint(); });
  input.addEventListener('focus', paint);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown')      { ev.preventDefault(); moveActive(1); }
    else if (ev.key === 'ArrowUp')   { ev.preventDefault(); moveActive(-1); }
    else if (ev.key === 'Enter')     { ev.preventDefault(); choose(active >= 0 ? active : 0); }
    else if (ev.key === 'Escape')    { close(); input.blur(); }
  });
  results.addEventListener('mousedown', (ev) => {
    // mousedown, not click — the input's blur would tear the list down first
    const row = (ev.target as HTMLElement).closest<HTMLElement>('.tz-row');
    if (!row) return;
    ev.preventDefault();
    choose(Number(row.dataset['i']));
  });
  clearBtn?.addEventListener('click', () => { input.value = ''; input.focus(); paint(); });
  document.addEventListener('click', (ev) => {
    if (!input.contains(ev.target as Node) && !results.contains(ev.target as Node)) close();
  });
}

function renderClocksConfig(clocks: WorldClock[]) {
  const container = document.getElementById('clocks-config') as HTMLElement;
  container.innerHTML = '';
  if (clocks.length === 0) {
    container.innerHTML = '<p class="clocks-empty">No clocks added yet. Pick a city below.</p>';
    return;
  }
  clocks.forEach((c, i) => {
    const chip = document.createElement('div');
    chip.className = 'clock-chip';
    const nameEl = document.createElement('span');
    nameEl.className = 'clock-chip-label';
    nameEl.textContent = c.label;
    const del = document.createElement('button');
    del.className = 'clock-chip-del'; del.textContent = '✕';
    del.addEventListener('click', () => { clocks.splice(i, 1); renderClocksConfig(clocks); });
    chip.append(nameEl, del);
    container.appendChild(chip);
  });
}

// ─── Settings panel ───────────────────────────────────────────────────────────

function initSegmented(groupId: string, selectId: string) {
  const group = document.getElementById(groupId);
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!group || !select) return;
  const sync = () => {
    group.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach(b =>
      b.classList.toggle('active', b.dataset['val'] === select.value));
  };
  sync();
  group.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach(b => {
    b.addEventListener('click', () => { select.value = b.dataset['val'] ?? ''; sync(); });
  });
}

/** The Stocks settings section just reflects the watchlist; editing happens in the panel. */
function initStockSearchSettings() {
  const summary = document.getElementById('set-stock-summary');
  if (summary) {
    summary.innerHTML = '';
    if (watchlist.length === 0) {
      summary.innerHTML = '<span class="set-stock-empty">No stocks on your watchlist yet</span>';
    } else {
      watchlist.forEach(w => {
        const chip = document.createElement('span');
        chip.className = 'stock-chip';
        chip.textContent = w.symbol;
        summary.appendChild(chip);
      });
    }
  }

  document.getElementById('set-open-markets')?.addEventListener('click', () => {
    document.getElementById('settings-panel')?.classList.add('hidden');
    const panel = document.getElementById('market-panel');
    panel?.classList.remove('hidden');
    requestAnimationFrame(() => panel?.classList.add('open'));
  });
}


function initSettingsPanel(settings: Settings) {
  const overlay = document.getElementById('settings-panel') as HTMLElement;

  const open = () => overlay.classList.remove('hidden');
  const close = () => overlay.classList.add('hidden');

  document.getElementById('btn-settings')?.addEventListener('click', open);
  document.getElementById('btn-settings-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Category switching
  overlay.querySelectorAll<HTMLButtonElement>('.sn-item').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.sn-item').forEach(b => b.classList.remove('active'));
      overlay.querySelectorAll('.sc').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      overlay.querySelector<HTMLElement>(`.sc[data-cat="${btn.dataset['cat']}"]`)?.classList.add('active');
    });
  });

  // Segmented controls
  initSegmented('seg-theme', 'set-theme');
  initSegmented('seg-engine', 'set-engine');
  initSegmented('seg-bg', 'seg-bg-hidden');
  initSegmented('seg-quote-cat', 'set-quote-cat');

  // Background segmented syncs to radio buttons
  const segBg = document.getElementById('seg-bg');
  segBg?.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach(b => {
    b.addEventListener('click', () => {
      const val = b.dataset['val'];
      const radio = document.getElementById(val === 'custom' ? 'bg-custom' : 'bg-daily') as HTMLInputElement;
      if (radio) radio.checked = true;
      // Only show the card that applies to the chosen mode
      document.getElementById('bg-daily-card')?.classList.toggle('hidden', val === 'custom');
      document.getElementById('bg-custom-card')?.classList.toggle('hidden', val !== 'custom');
    });
  });

  // AI provider radio cards sync to hidden select
  // Assistants are multi-select and save on click, so there is no hidden select
  initAiSettings(settings);

  // Populate values
  (document.getElementById('set-name') as HTMLInputElement).value = settings.name;
  (document.getElementById('set-theme') as HTMLSelectElement).value = settings.theme;
  (document.getElementById('set-quote-cat') as HTMLSelectElement).value = settings.quoteCategory ?? 'motivation';
  initSegmented('seg-theme', 'set-theme');
  initSegmented('seg-quote-cat', 'set-quote-cat');

  (document.getElementById('set-weather') as HTMLInputElement).checked = settings.showWeather;
  (document.getElementById('set-location') as HTMLInputElement).value = settings.locationOverride ?? '';

  // Apply location override on button click — busts cache and re-fetches immediately
  document.getElementById('set-location-save')?.addEventListener('click', async () => {
    const override = (document.getElementById('set-location') as HTMLInputElement).value.trim();
    await saveSettings({ locationOverride: override });
    await chrome.storage.local.remove('mt_weather'); // bust cache
    if (settings.showWeather) void loadWeather(override);
    const btn = document.getElementById('set-location-save') as HTMLButtonElement;
    btn.textContent = '✓'; setTimeout(() => { btn.textContent = 'Apply'; }, 1500);
  });
  (document.getElementById('set-quote') as HTMLInputElement).checked = settings.showQuote;
  (document.getElementById('set-todos') as HTMLInputElement).checked = settings.showTodos;
  (document.getElementById('set-links') as HTMLInputElement).checked = settings.showLinks;
  (document.getElementById('set-pomodoro') as HTMLInputElement).checked = settings.showPomodoro;
  (document.getElementById('set-notes') as HTMLInputElement).checked = settings.showNotes;
  (document.getElementById('set-clocks') as HTMLInputElement).checked = settings.showWorldClocks;
  (document.getElementById('set-countdowns') as HTMLInputElement).checked = settings.showCountdowns;
  (document.getElementById('set-ai') as HTMLInputElement).checked = settings.showAi;

  (document.getElementById('set-unsplash') as HTMLInputElement).value = settings.unsplashKey;
  initStockSearchSettings();

  // Background mode
  const bgMode = settings.activeBackground === 'custom' ? 'bg-custom' : 'bg-daily';
  document.getElementById('bg-daily-card')?.classList.toggle('hidden', settings.activeBackground === 'custom');
  document.getElementById('bg-custom-card')?.classList.toggle('hidden', settings.activeBackground !== 'custom');
  (document.getElementById(bgMode) as HTMLInputElement).checked = true;
  segBg?.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset['val'] === settings.activeBackground));

  const clonedClocks = settings.worldClocks.map(c => ({ ...c }));
  renderClocksConfig(clonedClocks);

  initTzPicker((label, timezone) => {
    if (clonedClocks.some(c => c.timezone === timezone && c.label === label)) return; // already added
    clonedClocks.push({ label, timezone });
    renderClocksConfig(clonedClocks);
  });

  initVisionBoard(settings);
  // initVisionBoard mutates `settings` in place as chips are clicked, so snapshot
  // the background choice now to tell afterwards whether it actually changed.
  const bgBefore = `${settings.backgroundSource}|${settings.backgroundTopic}`;

  document.getElementById('btn-settings-save')?.addEventListener('click', async () => {
    // A new source or topic must take effect immediately, not tomorrow — the daily
    // cache would otherwise keep serving the photo picked under the old setting.
    if (`${settings.backgroundSource}|${settings.backgroundTopic}` !== bgBefore) {
      await saveDaily({ backgroundUrl: '', backgroundThumb: '' });
    }
    await saveSettings({
      name: (document.getElementById('set-name') as HTMLInputElement).value.trim(),
      theme: (document.getElementById('set-theme') as HTMLSelectElement).value as 'auto' | 'light' | 'dark',
      showWeather: (document.getElementById('set-weather') as HTMLInputElement).checked,
      showQuote: (document.getElementById('set-quote') as HTMLInputElement).checked,
      showTodos: (document.getElementById('set-todos') as HTMLInputElement).checked,
      showLinks: (document.getElementById('set-links') as HTMLInputElement).checked,
      showPomodoro: (document.getElementById('set-pomodoro') as HTMLInputElement).checked,
      showNotes: (document.getElementById('set-notes') as HTMLInputElement).checked,
      showWorldClocks: (document.getElementById('set-clocks') as HTMLInputElement).checked,
      showCountdowns: (document.getElementById('set-countdowns') as HTMLInputElement).checked,
      showAi: (document.getElementById('set-ai') as HTMLInputElement).checked,
      quoteCategory: (document.getElementById('set-quote-cat') as HTMLSelectElement).value as 'motivation' | 'stoic' | 'tech' | 'random',
      unsplashKey: (document.getElementById('set-unsplash') as HTMLInputElement).value.trim(),
      worldClocks: clonedClocks.filter(c => c.label && c.timezone),
      customBackgrounds: settings.customBackgrounds,
      backgroundSource: settings.backgroundSource,
      backgroundTopic: settings.backgroundTopic,
      activeBackground: (document.querySelector('input[name="bg-mode"]:checked') as HTMLInputElement)?.value as 'daily' | 'custom' ?? settings.activeBackground,
      activeCustomBg: settings.activeCustomBg,
    });
    close();
    location.reload();
  });
}

// ─── Focus settings ───────────────────────────────────────────────────────────

const FOCUS_LIMITS: Record<string, [number, number]> = {
  focusMins: [5, 180],
  breakMins: [1, 60],
  longBreakMins: [5, 90],
  roundsPerLongBreak: [2, 8],
  dailyGoalMins: [30, 720],
};

/** Pushes the live timer config back into the settings panel controls. */
function syncFocusSettingsUI() {
  const put = (id: string, v: number) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };
  put('set-focus-mins', pomoCfg.focusMins);
  put('set-break-mins', pomoCfg.breakMins);
  put('set-longbreak-mins', pomoCfg.longBreakMins);
  put('set-rounds', pomoCfg.roundsPerLongBreak);
  put('set-goal-mins', pomoCfg.dailyGoalMins);

  const auto = document.getElementById('set-auto-start') as HTMLInputElement | null;
  if (auto) auto.checked = pomoCfg.autoStartNext;
  const blur = document.getElementById('set-focus-blur') as HTMLInputElement | null;
  if (blur) blur.checked = pomoCfg.focusBlur;
}

/**
 * These apply and save on the spot rather than waiting for the Save button — the
 * timer is running right there, so a delayed change would be confusing.
 */
function initFocusSettings() {
  syncFocusSettingsUI();

  document.querySelectorAll<HTMLButtonElement>('.set-num-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset['num'] as keyof typeof pomoCfg;
      const step = Number(btn.dataset['step'] ?? 0);
      const [min, max] = FOCUS_LIMITS[key as string] ?? [1, 999];
      const next = Math.max(min, Math.min(max, (pomoCfg[key] as number) + step));
      (pomoCfg[key] as number) = next;

      if (!pomoRunning) { pomoTotal = durationFor(pomoMode); pomoSecondsLeft = pomoTotal; }
      syncFocusSettingsUI();
      renderPomo();
      void renderFocusGoal();
      void renderFocusStats();
      await saveSettings({ [key]: next } as Partial<Settings>);
    });
  });

  document.getElementById('set-auto-start')?.addEventListener('change', async (e) => {
    pomoCfg.autoStartNext = (e.target as HTMLInputElement).checked;
    await saveSettings({ autoStartNext: pomoCfg.autoStartNext });
  });

  document.getElementById('set-focus-blur')?.addEventListener('change', async (e) => {
    pomoCfg.focusBlur = (e.target as HTMLInputElement).checked;
    document.getElementById('bg')?.classList.toggle('is-blurred', focusModeActive && pomoCfg.focusBlur);
    await saveSettings({ focusBlur: pomoCfg.focusBlur });
  });
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(theme: string) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'auto' && prefersDark);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

// ─── Widget visibility ────────────────────────────────────────────────────────

function applyVisibility(s: Settings) {
  const hide = (id: string) => document.getElementById(id)?.classList.add('hidden');
  const show = (id: string) => document.getElementById(id)?.classList.remove('hidden');

  s.showWeather ? show('weather-widget') : hide('weather-widget');
  s.showQuote ? show('quote-wrap') : hide('quote-wrap');
  // Tasks has two visible forms, so the collapsed state decides which one shows
  todosWidgetOn = s.showTodos;
  if (s.showTodos) {
    applyTodosCollapsed();
  } else {
    hide('todos-panel'); hide('btn-todos-launcher');
  }
  s.showCountdowns ? show('countdowns-wrap') : hide('countdowns-wrap');
  s.showAi ? show('btn-ai-toggle') : hide('btn-ai-toggle');
  s.showNotes ? show('btn-notes-toggle') : hide('btn-notes-toggle');
  s.showPomodoro ? show('pomodoro-panel') : hide('pomodoro-panel');
  if (!s.showLinks) hide('btn-links-toggle');
  if (s.showWorldClocks) show('world-clocks-bar'); else hide('world-clocks-bar');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function showOnboarding(): Promise<string> {
  return new Promise((resolve) => {
    const modal = document.getElementById('onboarding-modal') as HTMLElement;
    const input = document.getElementById('onboarding-name') as HTMLInputElement;
    const btn = document.getElementById('btn-onboarding-done') as HTMLButtonElement;
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 100);
    const done = async () => {
      const name = input.value.trim();
      await saveSettings({ name });
      modal.classList.add('hidden');
      resolve(name);
    };
    btn.addEventListener('click', done);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
  });
}

async function init() {
  let settings = await getSettings();

  // Show onboarding on first install (no name set and never onboarded)
  if (!settings.name) {
    const name = await showOnboarding();
    settings = await getSettings();
    settings.name = name;
  }

  applyTheme(settings.theme);
  (document.getElementById('greeting') as HTMLElement).textContent = greeting(settings.name);

  initSettingsPanel(settings);
  applyFocusSettings(settings);
  initFocusSettings();
  await initFocus();
  await initTodos();
  await initLinks();
  await initNotes();
  await initCountdowns();
  initBookmarkImport();
  initNews();
  initMarkets();
  initPomodoro();
  initFocusMode();
  initQuoteRefresh(settings.quoteCategory ?? 'motivation');
  initAI(settings.aiProvider);
  initSoundscapes();
  await initTabSessions();
  initKeyboardShortcuts();
  initExportData();


  applyVisibility(settings);

  if (settings.showWorldClocks && settings.worldClocks.length > 0) {
    renderWorldClocks(settings.worldClocks);
  }

  // Background cycle button
  document.getElementById('btn-bg-cycle')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-bg-cycle') as HTMLButtonElement;
    btn.classList.add('is-loading');
    // Re-read settings: the topic may have been changed since the page loaded
    await loadBackground(await getSettings(), true);
    btn.classList.remove('is-loading');
  });

  // Async non-blocking
  loadBackground(settings);
  if (settings.showQuote) loadQuote(settings.quoteCategory ?? 'motivation');
  if (settings.showWeather) {
    initWeatherWidget(settings.locationOverride ?? '');
    void loadWeather(settings.locationOverride ?? '', settings.tempUnit ?? 'celsius');
  }

  // Ensure daily date
  const daily = await getDaily();
  if (!daily?.date || daily.date !== todayString()) {
    await saveDaily({ date: todayString(), focus: '', quote: '', quoteAuthor: '', backgroundUrl: '', backgroundThumb: '' });
  }
}

init();
