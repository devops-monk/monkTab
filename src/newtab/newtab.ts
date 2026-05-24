import {
  getSettings, saveSettings, getDaily, saveDaily, getTodos, saveTodos,
  getLinks, saveLinks, getNotes, saveNotes, getCountdowns, saveCountdowns,
  getFocusHistory, logFocusSession,
  todayString, type Todo, type QuickLink, type Countdown, type WorldClock, type Settings,
} from '../utils/storage';
import { fetchWeather } from '../utils/weather';
import { getBackground } from '../utils/background';
import { getQuote, getRandomQuote } from '../utils/quotes';
import { fetchOpenPRs, timeAgo } from '../utils/github';
import { SOUNDSCAPES, playSoundscape, stopSoundscape, setSoundVolume } from '../utils/soundscapes';

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

async function loadQuote() {
  const { quote, author } = await getQuote();
  setQuote(quote, author);
}

function initQuoteRefresh() {
  document.getElementById('btn-quote-refresh')?.addEventListener('click', () => {
    const { quote, author } = getRandomQuote();
    setQuote(quote, author);
  });
}

// ─── Weather ──────────────────────────────────────────────────────────────────

async function loadWeather() {
  const w = await fetchWeather();
  if (!w) return;

  // Topbar badge
  const widget = document.getElementById('weather-widget') as HTMLElement;
  (document.getElementById('weather-icon') as HTMLElement).textContent = w.icon;
  (document.getElementById('weather-temp') as HTMLElement).textContent = `${w.temp}°`;
  (document.getElementById('weather-city') as HTMLElement).textContent = w.city;
  widget.classList.remove('hidden');

  // Expanded card fields
  (document.getElementById('wc-city') as HTMLElement).textContent = w.city;
  (document.getElementById('wc-condition') as HTMLElement).textContent = w.condition;
  (document.getElementById('wc-icon') as HTMLElement).textContent = w.icon;
  (document.getElementById('wc-temp') as HTMLElement).textContent = `${w.temp}°`;
  (document.getElementById('wc-feels') as HTMLElement).textContent = `${w.feelsLike ?? w.temp}°C`;
  (document.getElementById('wc-wind') as HTMLElement).textContent = `${w.windSpeed ?? '--'} km/h`;
  (document.getElementById('wc-rain') as HTMLElement).textContent = `${w.precipitation ?? 0} mm`;

  // Toggle expanded card on click
  const card = document.getElementById('weather-card') as HTMLElement;
  widget.addEventListener('click', (e) => {
    e.stopPropagation();
    card.classList.toggle('hidden');
  });
  document.addEventListener('click', () => card.classList.add('hidden'));
  card.addEventListener('click', e => e.stopPropagation());
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
      try {
        timeEl.textContent = new Date().toLocaleTimeString('en-GB', {
          timeZone: timezone, hour: '2-digit', minute: '2-digit',
        });
      } catch { timeEl.textContent = '--:--'; }
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
let todoFilter: 'active' | 'all' | 'done' = 'active';

function filteredTodos() {
  if (todoFilter === 'active') return todos.filter(t => !t.done);
  if (todoFilter === 'done')   return todos.filter(t => t.done);
  return todos;
}

function renderTodos() {
  const list = document.getElementById('todo-list') as HTMLUListElement;
  list.innerHTML = '';

  // Count badge
  const activeCount = todos.filter(t => !t.done).length;
  const countEl = document.getElementById('todo-count');
  if (countEl) countEl.textContent = activeCount > 0 ? String(activeCount) : '';

  // Clear-done button visibility
  const clearBtn = document.getElementById('btn-clear-done') as HTMLElement;
  clearBtn?.classList.toggle('hidden', !todos.some(t => t.done));

  const visible = filteredTodos();
  if (visible.length === 0) {
    const emptyMsgs: Record<string, string> = {
      active: 'All clear! Add a task below',
      done:   'No completed tasks yet',
      all:    'No tasks yet — add one below',
    };
    list.innerHTML = `<li class="todo-empty">${emptyMsgs[todoFilter]}</li>`;
    return;
  }

  visible.forEach((todo) => {
    const li = document.createElement('li');
    const pri = todo.priority ?? 'none';
    li.className = `todo-item${todo.done ? ' done' : ''}${pri !== 'none' ? ` pri-${pri}` : ''}`;

    // Checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'todo-cb'; cb.checked = todo.done;
    cb.addEventListener('change', () => {
      todo.done = cb.checked;
      saveTodos(todos);
      renderTodos(); renderFmTodos(); updatePomoTask();
    });

    // Text + priority badge
    const textWrap = document.createElement('div');
    textWrap.className = 'todo-text-wrap';
    const span = document.createElement('span');
    span.textContent = todo.text;
    const priBadge = document.createElement('span');
    priBadge.className = 'todo-pri-badge';
    priBadge.textContent = pri === 'high' ? 'High priority' : pri === 'medium' ? 'Medium' : '';
    textWrap.append(span, priBadge);

    // Actions: focus + delete
    const actions = document.createElement('div');
    actions.className = 'todo-item-actions';

    if (!todo.done) {
      const focusBtn = document.createElement('button');
      focusBtn.className = 'focus-task-btn';
      focusBtn.title = 'Start focus session on this task';
      focusBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
      focusBtn.addEventListener('click', () => {
        document.getElementById('pomodoro-panel')?.classList.add('hidden');
        enterFocusMode();
        if (fmTaskLabelEl) fmTaskLabelEl.textContent = todo.text;
      });
      actions.appendChild(focusBtn);
    }

    const del = document.createElement('button');
    del.className = 'del-btn'; del.title = 'Delete';
    del.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    del.addEventListener('click', () => {
      todos = todos.filter(t => t.id !== todo.id);
      saveTodos(todos); renderTodos(); renderFmTodos(); updatePomoTask();
    });
    actions.appendChild(del);

    li.append(cb, textWrap, actions);
    list.appendChild(li);
  });
}

async function initTodos() {
  todos = await getTodos();
  renderTodos();

  // Filter tabs
  document.querySelectorAll<HTMLButtonElement>('.todo-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      todoFilter = btn.dataset['filter'] as typeof todoFilter;
      document.querySelectorAll('.todo-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTodos();
    });
  });

  // Clear done
  document.getElementById('btn-clear-done')?.addEventListener('click', () => {
    todos = todos.filter(t => !t.done);
    saveTodos(todos); renderTodos(); renderFmTodos(); updatePomoTask();
  });

  // Priority toggle button
  const priBtn = document.getElementById('todo-priority-btn') as HTMLButtonElement;
  const PRIS: Array<'none' | 'medium' | 'high'> = ['none', 'medium', 'high'];
  let priIdx = 0;
  priBtn?.addEventListener('click', () => {
    priIdx = (priIdx + 1) % PRIS.length;
    priBtn.dataset['pri'] = PRIS[priIdx];
  });

  // Add task form
  const form = document.getElementById('todo-form') as HTMLFormElement;
  const input = document.getElementById('todo-input') as HTMLInputElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const priority = (priBtn?.dataset['pri'] ?? 'none') as Todo['priority'];
    todos.push({ id: Date.now().toString(), text, done: false, priority });
    // Reset priority
    priIdx = 0; if (priBtn) priBtn.dataset['pri'] = 'none';
    saveTodos(todos); renderTodos(); renderFmTodos(); input.value = ''; updatePomoTask();
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

  volumeSlider.addEventListener('input', () => setSoundVolume(parseInt(volumeSlider.value, 10)));

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
  initYouTubeBeats(updateNowPlaying);

  document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
    panel.classList.toggle('hidden');
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
  { id: 'jfKfPfyJRdk', title: 'Lofi Hip Hop Radio',       ch: 'Lofi Girl' },
  { id: '4xDzrJKXOOY', title: 'Synthwave Radio',           ch: 'Lofi Girl' },
  { id: 'Na0w3Mz46GA', title: 'Lofi Chill Beats',         ch: 'Lofi Girl' },
  { id: 'lCOF9LVlRks', title: 'Dark Academia Playlist',   ch: 'Lofi Girl' },
  { id: 'DWcJFNfaw9c', title: 'Brown Noise · 8h',         ch: 'Relaxing White Noise' },
  { id: 'lTRiuFIWV54', title: 'Deep Focus Music',         ch: 'Greenred Productions' },
  { id: 'WPni755-Krg', title: 'Classical Focus',          ch: 'Lofi Girl' },
  { id: '36YnV9STBqc', title: 'Piano for Studying',       ch: 'Soothing Relaxation' },
  { id: 'sjkrrmBnpGE', title: 'Jazz & Bossa Nova',        ch: 'Lofi Jazz' },
  { id: 'rUxyKA_-grg', title: 'Peaceful Piano',           ch: 'Soothing Relaxation' },
  { id: '2gliGzb2_1I', title: 'Coffee Shop Ambience',    ch: 'Ambient Sounds' },
  { id: 'qYnA9wWFHLI', title: 'Forest Rain · 3h',        ch: 'Nature Soundscapes' },
];

function initYouTubeBeats(updateNowPlaying: (label: string | null) => void) {
  const ytGrid = document.getElementById('yt-grid') as HTMLElement;

  YT_VIDEOS.forEach(v => {
    const card = document.createElement('a');
    card.className = 'yt-card';
    card.href = `https://www.youtube.com/watch?v=${v.id}`;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.title = `${v.title} — opens in YouTube`;
    card.innerHTML = `
      <div class="yt-thumb-wrap">
        <img class="yt-thumb" src="https://img.youtube.com/vi/${v.id}/mqdefault.jpg" alt="${v.title}" loading="lazy" />
        <div class="yt-play-overlay">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
        <span class="yt-ext-badge">↗</span>
      </div>
      <div class="yt-card-info">
        <span class="yt-card-title">${v.title}</span>
        <span class="yt-card-ch">${v.ch}</span>
      </div>
    `;
    card.addEventListener('click', () => updateNowPlaying(v.title));
    ytGrid.appendChild(card);
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
  const text = task?.text ?? '';
  (document.getElementById('pomo-task') as HTMLElement).textContent = text;
  if (fmTaskLabelEl) fmTaskLabelEl.textContent = text;
}

function formatPomo(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function renderPomo() {
  (document.getElementById('pomo-timer') as HTMLElement).textContent = formatPomo(pomoSecondsLeft);
  (document.getElementById('pomo-start') as HTMLButtonElement).textContent = pomoRunning ? 'Pause' : 'Start';
  document.title = pomoRunning ? `${formatPomo(pomoSecondsLeft)} — MonkTab` : 'MonkTab';
  syncFocusMode();
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
      const sessionDuration = POMO_DURATIONS[pomoMode];
      pomoRunning = true;
      pomoInterval = setInterval(async () => {
        pomoSecondsLeft--;
        renderPomo();
        if (pomoSecondsLeft <= 0) {
          clearInterval(pomoInterval!); pomoInterval = null; pomoRunning = false;
          if (pomoMode === 'focus') {
            await logFocusSession(Math.round(sessionDuration / 60));
            renderFocusStats();
          }
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

  // Stats / Timer tab switching
  document.querySelectorAll<HTMLButtonElement>('.pomo-header-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pomo-header-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isStats = btn.dataset['ptab'] === 'stats';
      document.getElementById('pomo-timer-view')?.classList.toggle('hidden', isStats);
      document.getElementById('pomo-stats-view')?.classList.toggle('hidden', !isStats);
      if (isStats) renderFocusStats();
    });
  });

  document.getElementById('btn-pomo-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('pomodoro-panel') as HTMLElement;
    panel.classList.toggle('hidden');
    updatePomoTask();
  });

  renderPomo();
}

async function renderFocusStats() {
  const history = await getFocusHistory();
  const today = todayString();

  // Build last-7-days array
  const days: { label: string; date: string; minutes: number; sessions: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = history.find(h => h.date === dateStr);
    days.push({ label: ['S','M','T','W','T','F','S'][d.getDay()], date: dateStr, minutes: entry?.minutes ?? 0, sessions: entry?.sessions ?? 0 });
  }

  const todayEntry = history.find(h => h.date === today);
  const todayMins = todayEntry?.minutes ?? 0;
  const todaySessions = todayEntry?.sessions ?? 0;

  // Format today
  const todayLabel = todayMins >= 60
    ? `${Math.floor(todayMins / 60)}h ${todayMins % 60}m`
    : `${todayMins}m`;
  (document.getElementById('stat-today-mins') as HTMLElement).textContent = todayLabel || '0m';
  (document.getElementById('stat-sessions') as HTMLElement).textContent = String(todaySessions);

  // Tasks done today
  const doneTasks = todos.filter(t => t.done).length;
  (document.getElementById('stat-tasks-done') as HTMLElement).textContent = String(doneTasks);

  // Streak: consecutive days with at least 1 session
  let streak = 0;
  const sortedHistory = [...history].sort((a, b) => b.date.localeCompare(a.date));
  for (const entry of sortedHistory) {
    if (entry.sessions > 0) streak++;
    else break;
  }
  (document.getElementById('stat-streak') as HTMLElement).textContent = String(streak);

  // Bar chart
  const chart = document.getElementById('focus-chart') as HTMLElement;
  const maxMins = Math.max(...days.map(d => d.minutes), 30);
  chart.innerHTML = days.map(d => {
    const pct = Math.round((d.minutes / maxMins) * 100);
    const isToday = d.date === today;
    return `<div class="fc-col">
      <div class="fc-bar-wrap">
        <div class="fc-bar${isToday ? ' fc-bar-today' : ''}" style="height:${Math.max(pct, d.minutes > 0 ? 8 : 2)}%"
          title="${d.minutes}m"></div>
      </div>
      <span class="fc-day${isToday ? ' fc-day-today' : ''}">${d.label}</span>
    </div>`;
  }).join('');
}

// ─── Focus Mode ───────────────────────────────────────────────────────────────

const FM_CIRC = 879.65; // 2π × 140

let focusModeActive = false;
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
  const total = POMO_DURATIONS[pomoMode];
  const progress = (total - pomoSecondsLeft) / total;
  fmArcEl.style.strokeDashoffset = String(FM_CIRC * (1 - progress));
  if (fmPlayIcon && fmPauseIcon) {
    fmPlayIcon.classList.toggle('hidden', pomoRunning);
    fmPauseIcon.classList.toggle('hidden', !pomoRunning);
  }
  // Sync mode tabs
  document.querySelectorAll<HTMLButtonElement>('.fm-mode-tab').forEach(b =>
    b.classList.toggle('active', b.dataset['fmode'] === pomoMode));
}

// Render todos in focus mode sidebar
function renderFmTodos() {
  const list = document.getElementById('fm-todo-list') as HTMLUListElement;
  if (!list) return;
  list.innerHTML = '';
  if (todos.length === 0) {
    list.innerHTML = '<li style="color:rgba(255,255,255,0.3);font-size:12px">No tasks yet</li>';
    return;
  }
  todos.forEach((todo) => {
    const li = document.createElement('li');
    li.className = todo.done ? 'fm-done' : '';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'fm-cb'; cb.checked = todo.done;
    cb.addEventListener('change', () => {
      todo.done = cb.checked;
      saveTodos(todos);
      li.className = todo.done ? 'fm-done' : '';
      updatePomoTask();
    });
    const span = document.createElement('span');
    span.textContent = todo.text;
    li.append(cb, span);
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

  // Sync quote
  const qtSrc = document.getElementById('quote-text')?.textContent ?? '';
  const qEl = document.getElementById('fm-quote-text');
  if (qEl) qEl.textContent = qtSrc;

  renderFmTodos();
  updateFmSoundChip();
  syncFocusMode();
  updatePomoTask(); // also updates fm-task-label via the extended version below
}

function exitFocusMode() {
  focusModeActive = false;
  document.getElementById('focus-mode')?.classList.add('hidden');
}

function initFocusMode() {
  // Enter button in pomo panel
  document.getElementById('btn-enter-focus')?.addEventListener('click', () => {
    document.getElementById('pomodoro-panel')?.classList.add('hidden');
    enterFocusMode();
  });

  // Exit button + ESC
  document.getElementById('btn-focus-exit')?.addEventListener('click', exitFocusMode);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && focusModeActive) exitFocusMode();
  });

  // Mode tabs mirror pomo tabs
  document.querySelectorAll<HTMLButtonElement>('.fm-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset['fmode'] as 'focus' | 'break';
      document.querySelectorAll<HTMLButtonElement>('.pomo-tab').forEach(pb => {
        if (pb.dataset['mode'] === mode) pb.click();
      });
    });
  });

  // Play/pause mirrors pomo start
  document.getElementById('fm-start')?.addEventListener('click', () => {
    document.getElementById('pomo-start')?.click();
    syncFocusMode();
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
    setSoundVolume(parseInt(fmVol.value, 10));
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

  // Build the FM sound grid
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

  // Focus mode task form
  const fmForm = document.getElementById('fm-todo-form') as HTMLFormElement;
  const fmInput = document.getElementById('fm-todo-input') as HTMLInputElement;
  fmForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = fmInput.value.trim();
    if (!text) return;
    todos.push({ id: Date.now().toString(), text, done: false });
    saveTodos(todos); renderTodos(); renderFmTodos(); fmInput.value = ''; updatePomoTask();
  });
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

  // Background segmented syncs to radio buttons
  const segBg = document.getElementById('seg-bg');
  segBg?.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach(b => {
    b.addEventListener('click', () => {
      const val = b.dataset['val'];
      const radio = document.getElementById(val === 'custom' ? 'bg-custom' : 'bg-daily') as HTMLInputElement;
      if (radio) radio.checked = true;
    });
  });

  // AI provider radio cards sync to hidden select
  const aiSelect = document.getElementById('set-ai-provider') as HTMLSelectElement;
  overlay.querySelectorAll<HTMLInputElement>('input[name="ai-provider-radio"]').forEach(r => {
    r.addEventListener('change', () => { aiSelect.value = r.value; });
  });

  // Populate values
  (document.getElementById('set-name') as HTMLInputElement).value = settings.name;
  (document.getElementById('set-engine') as HTMLSelectElement).value = settings.searchEngine;
  (document.getElementById('set-theme') as HTMLSelectElement).value = settings.theme;
  initSegmented('seg-theme', 'set-theme');
  initSegmented('seg-engine', 'set-engine');

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
  aiSelect.value = settings.aiProvider;

  // Sync AI provider radio
  const aiRadio = overlay.querySelector<HTMLInputElement>(`input[name="ai-provider-radio"][value="${settings.aiProvider}"]`);
  if (aiRadio) aiRadio.checked = true;

  // Background mode
  const bgMode = settings.activeBackground === 'custom' ? 'bg-custom' : 'bg-daily';
  (document.getElementById(bgMode) as HTMLInputElement).checked = true;
  segBg?.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset['val'] === settings.activeBackground));

  const clonedClocks = settings.worldClocks.map(c => ({ ...c }));
  renderClocksConfig(clonedClocks);

  document.getElementById('tz-preset')?.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value;
    if (!val) return;
    const [label, timezone] = val.split('|');
    if (label && timezone) { clonedClocks.push({ label, timezone }); renderClocksConfig(clonedClocks); }
    (e.target as HTMLSelectElement).value = '';
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
      aiProvider: aiSelect.value as 'claude' | 'chatgpt' | 'gemini',
      worldClocks: clonedClocks.filter(c => c.label && c.timezone),
      customBackgrounds: settings.customBackgrounds,
      activeBackground: (document.querySelector('input[name="bg-mode"]:checked') as HTMLInputElement)?.value as 'daily' | 'custom' ?? settings.activeBackground,
      activeCustomBg: settings.activeCustomBg,
    });
    close();
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

  initSearch(settings.searchEngine);
  initSettingsPanel(settings);
  await initFocus();
  await initTodos();
  await initLinks();
  await initNotes();
  await initCountdowns();
  initBookmarkImport();
  initPomodoro();
  initFocusMode();
  initQuoteRefresh();
  initAI(settings.aiProvider);
  initSoundscapes();

  applyVisibility(settings);

  if (settings.showWorldClocks && settings.worldClocks.length > 0) {
    renderWorldClocks(settings.worldClocks);
  }

  // Background cycle button
  document.getElementById('btn-bg-cycle')?.addEventListener('click', async () => {
    const { url, thumb } = await getBackground(settings.unsplashKey, true);
    const bg = document.getElementById('bg') as HTMLDivElement;
    bg.style.backgroundImage = `url(${thumb})`;
    const img = new Image();
    img.onload = () => { bg.style.backgroundImage = `url(${url})`; };
    img.src = url;
  });

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
