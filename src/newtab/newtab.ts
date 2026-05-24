import { getSettings, saveSettings, getDaily, saveDaily, getTodos, saveTodos, getLinks, saveLinks, todayString, type Todo, type QuickLink } from '../utils/storage';
import { fetchWeather } from '../utils/weather';
import { getBackground } from '../utils/background';
import { getQuote } from '../utils/quotes';

// ─── Clock ────────────────────────────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  (document.getElementById('clock') as HTMLElement).textContent = `${h}:${m}`;
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

async function loadBackground(unsplashKey: string) {
  const bg = document.getElementById('bg') as HTMLDivElement;
  const { url, thumb } = await getBackground(unsplashKey);
  // Load thumb first for instant display, then swap to full res
  bg.style.backgroundImage = `url(${thumb})`;
  const img = new Image();
  img.onload = () => { bg.style.backgroundImage = `url(${url})`; };
  img.src = url;
}

// ─── Quote ────────────────────────────────────────────────────────────────────

async function loadQuote() {
  const { quote, author } = await getQuote();
  (document.getElementById('quote-text') as HTMLElement).textContent = `"${quote}"`;
  (document.getElementById('quote-author') as HTMLElement).textContent = `— ${author}`;
}

// ─── Weather ──────────────────────────────────────────────────────────────────

async function loadWeather() {
  const w = await fetchWeather();
  if (!w) return;
  const widget = document.getElementById('weather-widget') as HTMLElement;
  (document.getElementById('weather-icon') as HTMLElement).textContent = w.icon;
  (document.getElementById('weather-temp') as HTMLElement).textContent = `${w.temp}°C`;
  (document.getElementById('weather-city') as HTMLElement).textContent = w.city;
  widget.classList.remove('hidden');
}

// ─── Focus ────────────────────────────────────────────────────────────────────

async function initFocus() {
  const input = document.getElementById('focus-input') as HTMLInputElement;
  const daily = await getDaily();
  if (daily?.date === todayString() && daily.focus) input.value = daily.focus;
  input.addEventListener('input', () => {
    saveDaily({ date: todayString(), focus: input.value });
  });
}

// ─── Todos ────────────────────────────────────────────────────────────────────

let todos: Todo[] = [];

function renderTodos() {
  const list = document.getElementById('todo-list') as HTMLUListElement;
  list.innerHTML = '';
  todos.forEach((todo) => {
    const li = document.createElement('li');
    li.className = `todo-item${todo.done ? ' done' : ''}`;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = todo.done;
    cb.addEventListener('change', () => {
      todo.done = cb.checked;
      saveTodos(todos);
      li.classList.toggle('done', todo.done);
    });

    const span = document.createElement('span');
    span.textContent = todo.text;

    const del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      todos = todos.filter((t) => t.id !== todo.id);
      saveTodos(todos);
      renderTodos();
    });

    li.append(cb, span, del);
    list.appendChild(li);
  });
}

async function initTodos() {
  todos = await getTodos();
  renderTodos();

  const form = document.getElementById('todo-form') as HTMLFormElement;
  const input = document.getElementById('todo-input') as HTMLInputElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    todos.push({ id: Date.now().toString(), text, done: false });
    saveTodos(todos);
    renderTodos();
    input.value = '';
    // Update pomodoro task display
    updatePomoTask();
  });
}

// ─── Quick Links ──────────────────────────────────────────────────────────────

let links: QuickLink[] = [];

function faviconUrl(url: string): string {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${origin}&sz=32`;
  } catch { return ''; }
}

function renderLinks() {
  const list = document.getElementById('links-list') as HTMLUListElement;
  list.innerHTML = '';
  links.forEach((link) => {
    const li = document.createElement('li');
    li.className = 'link-item';

    const a = document.createElement('a');
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const favicon = document.createElement('img');
    favicon.src = faviconUrl(link.url);
    favicon.alt = '';
    favicon.onerror = () => { favicon.style.display = 'none'; };

    a.append(favicon, link.label);

    const del = document.createElement('button');
    del.className = 'link-del';
    del.textContent = '✕';
    del.title = 'Remove';
    del.addEventListener('click', () => {
      links = links.filter((l) => l.id !== link.id);
      saveLinks(links);
      renderLinks();
    });

    li.append(a, del);
    list.appendChild(li);
  });
}

async function initLinks() {
  links = await getLinks();
  renderLinks();

  const form = document.getElementById('link-form') as HTMLFormElement;
  const labelInput = document.getElementById('link-label') as HTMLInputElement;
  const urlInput = document.getElementById('link-url') as HTMLInputElement;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = labelInput.value.trim();
    const url = urlInput.value.trim();
    if (!label || !url) return;
    links.push({ id: Date.now().toString(), label, url });
    saveLinks(links);
    renderLinks();
    labelInput.value = '';
    urlInput.value = '';
  });

  // Toggle panel
  const panel = document.getElementById('links-panel') as HTMLElement;
  document.getElementById('btn-links-toggle')?.addEventListener('click', () => {
    panel.classList.toggle('open');
    panel.classList.toggle('hidden', false);
  });
  document.getElementById('btn-links-close')?.addEventListener('click', () => {
    panel.classList.remove('open');
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────

function initSearch(engine: string) {
  const form = document.getElementById('search-form') as HTMLFormElement;
  const input = document.getElementById('search-input') as HTMLInputElement;
  const sel = document.getElementById('search-engine') as HTMLSelectElement;
  sel.value = engine;

  const urls: Record<string, string> = {
    google: 'https://www.google.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
    bing: 'https://www.bing.com/search?q=',
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const base = urls[sel.value] ?? urls['google'];
    window.location.href = base + encodeURIComponent(q);
  });

  sel.addEventListener('change', () => {
    saveSettings({ searchEngine: sel.value as 'google' | 'duckduckgo' | 'bing' });
  });
}

// ─── Pomodoro ─────────────────────────────────────────────────────────────────

const POMO_DURATIONS = { focus: 25 * 60, break: 5 * 60 };
let pomoMode: 'focus' | 'break' = 'focus';
let pomoSecondsLeft = POMO_DURATIONS.focus;
let pomoInterval: ReturnType<typeof setInterval> | null = null;
let pomoRunning = false;

function updatePomoTask() {
  const task = todos.find((t) => !t.done);
  (document.getElementById('pomo-task') as HTMLElement).textContent = task?.text ?? '';
}

function formatPomo(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function renderPomo() {
  (document.getElementById('pomo-timer') as HTMLElement).textContent = formatPomo(pomoSecondsLeft);
  (document.getElementById('pomo-start') as HTMLButtonElement).textContent = pomoRunning ? 'Pause' : 'Start';
  document.title = pomoRunning ? `${formatPomo(pomoSecondsLeft)} — MonkTab` : 'MonkTab';
}

function initPomodoro() {
  document.querySelectorAll<HTMLButtonElement>('.pomo-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      pomoMode = btn.dataset['mode'] as 'focus' | 'break';
      pomoSecondsLeft = POMO_DURATIONS[pomoMode];
      if (pomoInterval) { clearInterval(pomoInterval); pomoInterval = null; pomoRunning = false; }
      document.querySelectorAll('.pomo-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderPomo();
    });
  });

  document.getElementById('pomo-start')?.addEventListener('click', () => {
    if (pomoRunning) {
      clearInterval(pomoInterval!); pomoInterval = null; pomoRunning = false;
    } else {
      pomoRunning = true;
      pomoInterval = setInterval(() => {
        pomoSecondsLeft--;
        renderPomo();
        if (pomoSecondsLeft <= 0) {
          clearInterval(pomoInterval!); pomoInterval = null; pomoRunning = false;
          chrome.notifications?.create({
            type: 'basic',
            iconUrl: '/icons/icon48.png',
            title: 'MonkTab',
            message: pomoMode === 'focus' ? 'Focus session complete! Take a break.' : 'Break over — back to work!',
          });
          // Auto-switch mode
          pomoMode = pomoMode === 'focus' ? 'break' : 'focus';
          pomoSecondsLeft = POMO_DURATIONS[pomoMode];
        }
      }, 1000);
    }
    renderPomo();
  });

  document.getElementById('pomo-reset')?.addEventListener('click', () => {
    if (pomoInterval) { clearInterval(pomoInterval); pomoInterval = null; }
    pomoRunning = false;
    pomoSecondsLeft = POMO_DURATIONS[pomoMode];
    renderPomo();
  });

  document.getElementById('btn-pomo-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('pomodoro-panel') as HTMLElement;
    panel.classList.toggle('hidden');
    updatePomoTask();
  });

  renderPomo();
}

// ─── Settings panel ───────────────────────────────────────────────────────────

function initSettingsPanel(settings: Awaited<ReturnType<typeof getSettings>>) {
  const panel = document.getElementById('settings-panel') as HTMLElement;
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    panel.classList.toggle('open');
    panel.classList.toggle('hidden', false);
  });
  document.getElementById('btn-settings-close')?.addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // Populate
  (document.getElementById('set-name') as HTMLInputElement).value = settings.name;
  (document.getElementById('set-engine') as HTMLSelectElement).value = settings.searchEngine;
  (document.getElementById('set-theme') as HTMLSelectElement).value = settings.theme;
  (document.getElementById('set-weather') as HTMLInputElement).checked = settings.showWeather;
  (document.getElementById('set-quote') as HTMLInputElement).checked = settings.showQuote;
  (document.getElementById('set-todos') as HTMLInputElement).checked = settings.showTodos;
  (document.getElementById('set-links') as HTMLInputElement).checked = settings.showLinks;
  (document.getElementById('set-pomodoro') as HTMLInputElement).checked = settings.showPomodoro;
  (document.getElementById('set-unsplash') as HTMLInputElement).value = settings.unsplashKey;

  document.getElementById('btn-settings-save')?.addEventListener('click', async () => {
    await saveSettings({
      name: (document.getElementById('set-name') as HTMLInputElement).value.trim(),
      searchEngine: (document.getElementById('set-engine') as HTMLSelectElement).value as 'google' | 'duckduckgo' | 'bing',
      theme: (document.getElementById('set-theme') as HTMLSelectElement).value as 'auto' | 'light' | 'dark',
      showWeather: (document.getElementById('set-weather') as HTMLInputElement).checked,
      showQuote: (document.getElementById('set-quote') as HTMLInputElement).checked,
      showTodos: (document.getElementById('set-todos') as HTMLInputElement).checked,
      showLinks: (document.getElementById('set-links') as HTMLInputElement).checked,
      showPomodoro: (document.getElementById('set-pomodoro') as HTMLInputElement).checked,
      unsplashKey: (document.getElementById('set-unsplash') as HTMLInputElement).value.trim(),
    });
    panel.classList.remove('open');
    location.reload();
  });
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(theme: string) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'auto' && prefersDark);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

// ─── Widget visibility ────────────────────────────────────────────────────────

function applyVisibility(settings: Awaited<ReturnType<typeof getSettings>>) {
  const toggle = (id: string, show: boolean) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !show);
  };
  toggle('weather-widget', settings.showWeather);
  toggle('quote-wrap', settings.showQuote);
  toggle('todos-panel', settings.showTodos);
  if (!settings.showLinks) document.getElementById('btn-links-toggle')?.classList.add('hidden');
  if (settings.showPomodoro) document.getElementById('pomodoro-panel')?.classList.remove('hidden');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const settings = await getSettings();

  applyTheme(settings.theme);
  applyVisibility(settings);

  (document.getElementById('greeting') as HTMLElement).textContent = greeting(settings.name);

  initSearch(settings.searchEngine);
  initSettingsPanel(settings);
  await initFocus();
  await initTodos();
  await initLinks();
  initPomodoro();

  // Async (non-blocking)
  loadBackground(settings.unsplashKey);
  if (settings.showQuote) loadQuote();
  if (settings.showWeather) loadWeather();

  // Ensure daily date is set
  const daily = await getDaily();
  if (!daily?.date || daily.date !== todayString()) {
    await saveDaily({ date: todayString(), focus: '', quote: '', quoteAuthor: '', backgroundUrl: '', backgroundThumb: '' });
  }
}

init();
