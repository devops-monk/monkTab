import {
  getSettings, saveSettings, getDaily, saveDaily, getTodos, saveTodos,
  getLinks, saveLinks, getNotes, saveNotes, getCountdowns, saveCountdowns,
  todayString, type Todo, type QuickLink, type Countdown, type WorldClock, type Settings,
} from '../utils/storage';
import { fetchWeather } from '../utils/weather';
import { getBackground } from '../utils/background';
import { getQuote } from '../utils/quotes';
import { fetchOpenPRs, timeAgo } from '../utils/github';
import { SOUNDSCAPES } from '../utils/soundscapes';

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

async function loadBackground(settings: Settings) {
  const bg = document.getElementById('bg') as HTMLDivElement;

  if (settings.activeBackground === 'custom' && settings.customBackgrounds.length > 0) {
    const idx = Math.min(settings.activeCustomBg, settings.customBackgrounds.length - 1);
    bg.style.backgroundImage = `url(${settings.customBackgrounds[idx]})`;
    return;
  }

  const { url, thumb } = await getBackground(settings.unsplashKey);
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

// ─── World Clocks ─────────────────────────────────────────────────────────────

function renderWorldClocks(clocks: WorldClock[]) {
  const bar = document.getElementById('world-clocks-bar') as HTMLElement;
  bar.innerHTML = '';
  clocks.forEach(({ label, timezone }) => {
    const card = document.createElement('div');
    card.className = 'world-clock-card';
    const timeEl = document.createElement('div');
    timeEl.className = 'world-clock-time';
    const labelEl = document.createElement('div');
    labelEl.className = 'world-clock-label';
    labelEl.textContent = label;
    card.append(timeEl, labelEl);
    bar.appendChild(card);

    const update = () => {
      timeEl.textContent = new Date().toLocaleTimeString('en-GB', {
        timeZone: timezone, hour: '2-digit', minute: '2-digit',
      });
    };
    update();
    setInterval(update, 10000);
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

function renderTodos() {
  const list = document.getElementById('todo-list') as HTMLUListElement;
  list.innerHTML = '';
  todos.forEach((todo) => {
    const li = document.createElement('li');
    li.className = `todo-item${todo.done ? ' done' : ''}`;
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = todo.done;
    cb.addEventListener('change', () => {
      todo.done = cb.checked; saveTodos(todos);
      li.classList.toggle('done', todo.done);
      updatePomoTask();
    });
    const span = document.createElement('span');
    span.textContent = todo.text;
    const del = document.createElement('button');
    del.className = 'del-btn'; del.textContent = '✕';
    del.addEventListener('click', () => { todos = todos.filter(t => t.id !== todo.id); saveTodos(todos); renderTodos(); });
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
    saveTodos(todos); renderTodos(); input.value = ''; updatePomoTask();
  });
}

// ─── Quick Links ──────────────────────────────────────────────────────────────

let links: QuickLink[] = [];

function faviconUrl(url: string): string {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).origin}&sz=32`; }
  catch { return ''; }
}

function renderLinks() {
  const list = document.getElementById('links-list') as HTMLUListElement;
  list.innerHTML = '';
  links.forEach((link) => {
    const li = document.createElement('li');
    li.className = 'link-item';
    const a = document.createElement('a');
    a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    const favicon = document.createElement('img');
    favicon.src = faviconUrl(link.url); favicon.alt = '';
    favicon.onerror = () => { favicon.style.display = 'none'; };
    a.append(favicon, link.label);
    const del = document.createElement('button');
    del.className = 'link-del'; del.textContent = '✕'; del.title = 'Remove';
    del.addEventListener('click', () => { links = links.filter(l => l.id !== link.id); saveLinks(links); renderLinks(); });
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
    const label = labelInput.value.trim(); const url = urlInput.value.trim();
    if (!label || !url) return;
    links.push({ id: Date.now().toString(), label, url });
    saveLinks(links); renderLinks(); labelInput.value = ''; urlInput.value = '';
  });

  // Toggle panel
  const panel = document.getElementById('links-panel') as HTMLElement;
  document.getElementById('btn-links-toggle')?.addEventListener('click', () => {
    panel.classList.toggle('hidden', false);
    panel.classList.toggle('open');
  });
  document.getElementById('btn-links-close')?.addEventListener('click', () => panel.classList.remove('open'));
}

// ─── Bookmark Import ──────────────────────────────────────────────────────────

function initBookmarkImport() {
  document.getElementById('btn-bookmarks-import')?.addEventListener('click', async () => {
    const tree = await chrome.bookmarks.getTree();
    const flat: QuickLink[] = [];

    function walk(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
      for (const node of nodes) {
        if (node.url && node.title) {
          flat.push({ id: `bm-${node.id}`, label: node.title.slice(0, 20), url: node.url });
        }
        if (node.children) walk(node.children);
      }
    }
    walk(tree);

    // De-duplicate against existing links
    const existingUrls = new Set(links.map(l => l.url));
    const newLinks = flat.filter(l => !existingUrls.has(l.url)).slice(0, 30);
    links = [...links, ...newLinks];
    saveLinks(links);
    renderLinks();
    alert(`Imported ${newLinks.length} bookmarks.`);
  });
}

// ─── Notes ────────────────────────────────────────────────────────────────────

async function initNotes() {
  const panel = document.getElementById('notes-panel') as HTMLElement;
  const textarea = document.getElementById('notes-textarea') as HTMLTextAreaElement;

  textarea.value = await getNotes();

  let saveTimer: ReturnType<typeof setTimeout>;
  textarea.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNotes(textarea.value), 600);
  });

  document.getElementById('btn-notes-toggle')?.addEventListener('click', () => {
    panel.classList.toggle('hidden', false);
    panel.classList.toggle('open');
  });
  document.getElementById('btn-notes-close')?.addEventListener('click', () => panel.classList.remove('open'));
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

// ─── GitHub Activity ──────────────────────────────────────────────────────────

async function loadGithub(username: string, token: string) {
  const list = document.getElementById('github-list') as HTMLElement;
  const empty = document.getElementById('github-empty') as HTMLElement;
  const error = document.getElementById('github-error') as HTMLElement;
  list.innerHTML = '';
  empty.classList.add('hidden');
  error.classList.add('hidden');

  if (!username) {
    error.textContent = 'Set your GitHub username in Settings ⚙️';
    error.classList.remove('hidden');
    return;
  }

  try {
    const prs = await fetchOpenPRs(username, token);
    if (prs.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    prs.forEach((pr) => {
      const li = document.createElement('li');
      li.className = 'github-pr';
      const a = document.createElement('a');
      a.href = pr.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = pr.title;
      const meta = document.createElement('div');
      meta.className = 'github-pr-meta';
      meta.innerHTML = `${pr.repo} · ${timeAgo(pr.updatedAt)}${pr.draft ? '<span class="github-pr-draft">Draft</span>' : ''}`;
      li.append(a, meta);
      list.appendChild(li);
    });
  } catch (err) {
    error.textContent = `GitHub error: ${String(err).slice(0, 60)}`;
    error.classList.remove('hidden');
  }
}

// ─── Ask AI ───────────────────────────────────────────────────────────────────

const AI_URLS: Record<string, string> = {
  claude: 'https://claude.ai/new?q=',
  chatgpt: 'https://chat.openai.com/?q=',
  gemini: 'https://gemini.google.com/app?q=',
};

function initAI(defaultProvider: string) {
  const modal = document.getElementById('ai-modal') as HTMLElement;
  const textarea = document.getElementById('ai-prompt') as HTMLTextAreaElement;
  let provider = defaultProvider;

  document.getElementById('btn-ai-toggle')?.addEventListener('click', () => {
    modal.classList.remove('hidden');
    setTimeout(() => textarea.focus(), 50);
  });
  document.getElementById('btn-ai-close')?.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

  document.querySelectorAll<HTMLButtonElement>('.ai-provider-btn').forEach((btn) => {
    if (btn.dataset['provider'] === defaultProvider) btn.classList.add('active');
    btn.addEventListener('click', () => {
      provider = btn.dataset['provider']!;
      document.querySelectorAll('.ai-provider-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('btn-ai-submit')?.addEventListener('click', () => {
    const q = textarea.value.trim();
    if (!q) return;
    const base = AI_URLS[provider] ?? AI_URLS['claude'];
    window.open(base + encodeURIComponent(q), '_blank');
    modal.classList.add('hidden');
    textarea.value = '';
  });

  // Submit on Ctrl+Enter
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      document.getElementById('btn-ai-submit')?.click();
    }
  });
}

// ─── Soundscapes ──────────────────────────────────────────────────────────────

function initSoundscapes() {
  const panel = document.getElementById('sound-panel') as HTMLElement;
  const grid = document.getElementById('sound-grid') as HTMLElement;
  const volumeSlider = document.getElementById('sound-volume') as HTMLInputElement;

  let activeId: string | null = null;
  let audio: HTMLAudioElement | null = null;

  function setVolume(v: number) {
    if (audio) audio.volume = v / 100;
  }

  function play(id: string) {
    const sc = SOUNDSCAPES.find(s => s.id === id);
    if (!sc) return;

    if (audio) { audio.pause(); audio = null; }

    audio = new Audio(sc.url);
    audio.loop = true;
    audio.volume = parseInt(volumeSlider.value, 10) / 100;
    audio.play().catch(() => {});
    activeId = id;

    grid.querySelectorAll<HTMLButtonElement>('.sound-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset['id'] === id);
    });
  }

  function stop() {
    if (audio) { audio.pause(); audio = null; }
    activeId = null;
    grid.querySelectorAll('.sound-btn').forEach(btn => btn.classList.remove('active'));
  }

  // Build grid
  SOUNDSCAPES.forEach(sc => {
    const btn = document.createElement('button');
    btn.className = 'sound-btn';
    btn.dataset['id'] = sc.id;
    btn.innerHTML = `<span class="sound-emoji">${sc.emoji}</span><span class="sound-label">${sc.label}</span>`;
    btn.addEventListener('click', () => {
      if (activeId === sc.id) stop(); else play(sc.id);
    });
    grid.appendChild(btn);
  });

  volumeSlider.addEventListener('input', () => setVolume(parseInt(volumeSlider.value, 10)));

  document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
    panel.classList.toggle('hidden');
  });
  document.getElementById('btn-sound-close')?.addEventListener('click', () => {
    panel.classList.add('hidden');
    stop();
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
    window.location.href = (urls[sel.value] ?? urls['google']) + encodeURIComponent(q);
  });
  sel.addEventListener('change', () => saveSettings({ searchEngine: sel.value as 'google' | 'duckduckgo' | 'bing' }));
}

// ─── Pomodoro ─────────────────────────────────────────────────────────────────

const POMO_DURATIONS = { focus: 25 * 60, break: 5 * 60 };
let pomoMode: 'focus' | 'break' = 'focus';
let pomoSecondsLeft = POMO_DURATIONS.focus;
let pomoInterval: ReturnType<typeof setInterval> | null = null;
let pomoRunning = false;

function updatePomoTask() {
  const task = todos.find(t => !t.done);
  (document.getElementById('pomo-task') as HTMLElement).textContent = task?.text ?? '';
}

function formatPomo(s: number) {
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
      document.querySelectorAll('.pomo-tab').forEach(b => b.classList.remove('active'));
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
            type: 'basic', iconUrl: '/icons/icon48.png', title: 'MonkTab',
            message: pomoMode === 'focus' ? 'Focus session done! Take a break.' : 'Break over — back to it!',
          });
          pomoMode = pomoMode === 'focus' ? 'break' : 'focus';
          pomoSecondsLeft = POMO_DURATIONS[pomoMode];
          renderPomo();
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

function initVisionBoard(settings: Settings) {
  renderCustomBgGrid(settings);

  (document.getElementById('bg-daily') as HTMLInputElement).checked = settings.activeBackground === 'daily';
  (document.getElementById('bg-custom') as HTMLInputElement).checked = settings.activeBackground === 'custom';

  document.getElementById('bg-upload')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (settings.customBackgrounds.length >= 6) {
      alert('Maximum 6 custom backgrounds. Remove one first.'); return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      settings.customBackgrounds.push(dataUrl);
      renderCustomBgGrid(settings);
    };
    reader.readAsDataURL(file);
  });
}

// ─── World Clocks settings ────────────────────────────────────────────────────

function renderClocksConfig(clocks: WorldClock[]) {
  const container = document.getElementById('clocks-config') as HTMLElement;
  container.innerHTML = '';
  clocks.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'clock-config-row';
    const labelInput = document.createElement('input');
    labelInput.placeholder = 'City'; labelInput.value = c.label;
    labelInput.addEventListener('input', () => { clocks[i].label = labelInput.value; });
    const tzInput = document.createElement('input');
    tzInput.placeholder = 'Timezone (e.g. America/New_York)'; tzInput.value = c.timezone;
    tzInput.addEventListener('input', () => { clocks[i].timezone = tzInput.value; });
    const del = document.createElement('button');
    del.className = 'icon-btn-sm'; del.textContent = '✕';
    del.addEventListener('click', () => { clocks.splice(i, 1); renderClocksConfig(clocks); });
    row.append(labelInput, tzInput, del);
    container.appendChild(row);
  });
}

// ─── Settings panel ───────────────────────────────────────────────────────────

function initSettingsPanel(settings: Settings) {
  const panel = document.getElementById('settings-panel') as HTMLElement;
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    panel.classList.toggle('hidden', false);
    panel.classList.toggle('open');
  });
  document.getElementById('btn-settings-close')?.addEventListener('click', () => panel.classList.remove('open'));

  // Populate
  (document.getElementById('set-name') as HTMLInputElement).value = settings.name;
  (document.getElementById('set-engine') as HTMLSelectElement).value = settings.searchEngine;
  (document.getElementById('set-theme') as HTMLSelectElement).value = settings.theme;
  (document.getElementById('set-weather') as HTMLInputElement).checked = settings.showWeather;
  (document.getElementById('set-quote') as HTMLInputElement).checked = settings.showQuote;
  (document.getElementById('set-todos') as HTMLInputElement).checked = settings.showTodos;
  (document.getElementById('set-links') as HTMLInputElement).checked = settings.showLinks;
  (document.getElementById('set-pomodoro') as HTMLInputElement).checked = settings.showPomodoro;
  (document.getElementById('set-notes') as HTMLInputElement).checked = settings.showNotes;
  (document.getElementById('set-clocks') as HTMLInputElement).checked = settings.showWorldClocks;
  (document.getElementById('set-countdowns') as HTMLInputElement).checked = settings.showCountdowns;
  (document.getElementById('set-github') as HTMLInputElement).checked = settings.showGithub;
  (document.getElementById('set-ai') as HTMLInputElement).checked = settings.showAi;
  (document.getElementById('set-unsplash') as HTMLInputElement).value = settings.unsplashKey;
  (document.getElementById('set-gh-user') as HTMLInputElement).value = settings.githubUsername;
  (document.getElementById('set-gh-token') as HTMLInputElement).value = settings.githubToken;
  (document.getElementById('set-ai-provider') as HTMLSelectElement).value = settings.aiProvider;

  const clonedClocks = settings.worldClocks.map(c => ({ ...c }));
  renderClocksConfig(clonedClocks);
  document.getElementById('btn-add-clock')?.addEventListener('click', () => {
    clonedClocks.push({ label: '', timezone: '' });
    renderClocksConfig(clonedClocks);
  });

  initVisionBoard(settings);

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
      showNotes: (document.getElementById('set-notes') as HTMLInputElement).checked,
      showWorldClocks: (document.getElementById('set-clocks') as HTMLInputElement).checked,
      showCountdowns: (document.getElementById('set-countdowns') as HTMLInputElement).checked,
      showGithub: (document.getElementById('set-github') as HTMLInputElement).checked,
      showAi: (document.getElementById('set-ai') as HTMLInputElement).checked,
      unsplashKey: (document.getElementById('set-unsplash') as HTMLInputElement).value.trim(),
      githubUsername: (document.getElementById('set-gh-user') as HTMLInputElement).value.trim(),
      githubToken: (document.getElementById('set-gh-token') as HTMLInputElement).value.trim(),
      aiProvider: (document.getElementById('set-ai-provider') as HTMLSelectElement).value as 'claude' | 'chatgpt' | 'gemini',
      worldClocks: clonedClocks.filter(c => c.label && c.timezone),
      customBackgrounds: settings.customBackgrounds,
      activeBackground: (document.querySelector('input[name="bg-mode"]:checked') as HTMLInputElement)?.value as 'daily' | 'custom' ?? settings.activeBackground,
      activeCustomBg: settings.activeCustomBg,
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

function applyVisibility(s: Settings) {
  const hide = (id: string) => document.getElementById(id)?.classList.add('hidden');
  const show = (id: string) => document.getElementById(id)?.classList.remove('hidden');

  s.showWeather ? show('weather-widget') : hide('weather-widget');
  s.showQuote ? show('quote-wrap') : hide('quote-wrap');
  s.showTodos ? show('todos-panel') : hide('todos-panel');
  s.showCountdowns ? show('countdowns-wrap') : hide('countdowns-wrap');
  s.showGithub ? show('github-panel') : hide('github-panel');
  s.showAi ? show('btn-ai-toggle') : hide('btn-ai-toggle');
  s.showNotes ? show('btn-notes-toggle') : hide('btn-notes-toggle');
  s.showPomodoro ? show('pomodoro-panel') : hide('pomodoro-panel');
  if (!s.showLinks) hide('btn-links-toggle');
  if (s.showWorldClocks) show('world-clocks-bar'); else hide('world-clocks-bar');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const settings = await getSettings();

  applyTheme(settings.theme);
  (document.getElementById('greeting') as HTMLElement).textContent = greeting(settings.name);

  initSearch(settings.searchEngine);
  initSettingsPanel(settings);
  await initFocus();
  await initTodos();
  await initLinks();
  await initNotes();
  await initCountdowns();
  initBookmarkImport();
  initPomodoro();
  initAI(settings.aiProvider);
  initSoundscapes();

  applyVisibility(settings);

  if (settings.showWorldClocks && settings.worldClocks.length > 0) {
    renderWorldClocks(settings.worldClocks);
  }

  // Async non-blocking
  loadBackground(settings);
  if (settings.showQuote) loadQuote();
  if (settings.showWeather) loadWeather();
  if (settings.showGithub) loadGithub(settings.githubUsername, settings.githubToken);

  document.getElementById('btn-github-refresh')?.addEventListener('click', () => {
    loadGithub(settings.githubUsername, settings.githubToken);
  });

  // Ensure daily date
  const daily = await getDaily();
  if (!daily?.date || daily.date !== todayString()) {
    await saveDaily({ date: todayString(), focus: '', quote: '', quoteAuthor: '', backgroundUrl: '', backgroundThumb: '' });
  }
}

init();
