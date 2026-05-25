import {
  getSettings, saveSettings, getDaily, saveDaily, getTodos, saveTodos,
  getLinks, saveLinks, getFolders, saveFolders, getNotes, saveNotes, getCountdowns, saveCountdowns,
  getFocusHistory, logFocusSession, getCustomYtVideos, saveCustomYtVideos,
  getYtPlayState, saveYtPlayState, clearYtPlayState, getYtRecent, addYtRecent,
  todayString, type Todo, type QuickLink, type QuickLinkFolder, type Countdown, type WorldClock, type Settings,
  type CustomYtVideo, type YtPlayState,
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

async function loadWeather(locationOverride = '') {
  const w = await fetchWeather(locationOverride);
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
  (document.getElementById('wc-temp') as HTMLElement).textContent = String(w.temp);
  (document.getElementById('wc-feels') as HTMLElement).textContent = `${w.feelsLike ?? w.temp}°C`;
  (document.getElementById('wc-wind') as HTMLElement).textContent = `${w.windSpeed ?? '--'} km/h`;
  (document.getElementById('wc-rain') as HTMLElement).textContent = `${w.precipitation ?? 0} mm`;

  // 7-day forecast
  const forecastEl = document.getElementById('wc-forecast') as HTMLElement;
  forecastEl.innerHTML = '';
  (w.forecast ?? []).forEach(day => {
    const col = document.createElement('div');
    col.className = 'wc-fc-day';
    col.innerHTML = `
      <span class="wc-fc-label">${day.day}</span>
      <span class="wc-fc-icon">${day.icon}</span>
      <span class="wc-fc-hi">${day.hi}°</span>
      <span class="wc-fc-lo">${day.lo}°</span>
    `;
    forecastEl.appendChild(col);
  });

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

// Cache city temperatures (30 min TTL) — keyed by city label
const cityTempCache = new Map<string, { temp: number; unit: string; fetchedAt: number }>();

async function fetchCityTemp(cityLabel: string): Promise<{ temp: number; unit: string } | null> {
  const cached = cityTempCache.get(cityLabel);
  if (cached && Date.now() - cached.fetchedAt < 30 * 60 * 1000) {
    return { temp: cached.temp, unit: cached.unit };
  }
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
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m&temperature_unit=celsius`,
      { signal: ac2.signal },
    );
    const wxData = await wxRes.json();
    const temp = wxData.current?.temperature_2m;
    if (temp == null) return null;

    const rounded = Math.round(temp);
    cityTempCache.set(cityLabel, { temp: rounded, unit: '°C', fetchedAt: Date.now() });
    return { temp: rounded, unit: '°C' };
  } catch { return null; }
}

const THERM_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`;

function renderWorldClocks(clocks: WorldClock[]) {
  const bar = document.getElementById('world-clocks-bar') as HTMLElement;
  bar.innerHTML = '';
  clocks.forEach(({ label, timezone }) => {
    const card = document.createElement('div');
    card.className = 'world-clock-card';

    const cityEl = document.createElement('div');
    cityEl.className = 'world-clock-city';
    cityEl.textContent = label;

    const timeEl = document.createElement('div');
    timeEl.className = 'world-clock-time';

    const tempEl = document.createElement('div');
    tempEl.className = 'world-clock-temp';
    tempEl.innerHTML = `${THERM_SVG}<span>—</span>`;

    card.append(cityEl, timeEl, tempEl);
    bar.appendChild(card);

    // Update clock every minute
    const updateClock = () => {
      try {
        timeEl.textContent = new Date().toLocaleTimeString('en-GB', {
          timeZone: timezone, hour: '2-digit', minute: '2-digit',
        });
      } catch { timeEl.textContent = '--:--'; }
    };
    updateClock();
    setInterval(updateClock, 10000);

    // Fetch temperature and refresh every 30 min
    const updateTemp = () => {
      fetchCityTemp(label).then(result => {
        const span = tempEl.querySelector('span')!;
        span.textContent = result ? `${result.temp}${result.unit}` : '—';
      });
    };
    updateTemp();
    setInterval(updateTemp, 30 * 60 * 1000);
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

function dueDateLabel(dateStr: string): string {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00'); d.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'Past';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function buildTodoItem(todo: Todo): HTMLLIElement {
  const li = document.createElement('li');
  const pri = todo.priority ?? 'none';
  li.className = `todo-item${todo.done ? ' done' : ''}${pri !== 'none' ? ` pri-${pri}` : ''}`;

  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.className = 'todo-cb'; cb.checked = todo.done;
  cb.addEventListener('change', () => {
    todo.done = cb.checked;
    saveTodos(todos);
    renderTodos(); renderFmTodos(); updatePomoTask();
  });

  const textWrap = document.createElement('div');
  textWrap.className = 'todo-text-wrap';
  const span = document.createElement('span');
  span.textContent = todo.text;

  const meta = document.createElement('div');
  meta.className = 'todo-meta';

  if (pri !== 'none') {
    const priBadge = document.createElement('span');
    priBadge.className = 'todo-pri-badge';
    priBadge.textContent = pri === 'high' ? 'High' : 'Medium';
    meta.appendChild(priBadge);
  }

  if (todo.dueDate) {
    const today = todayString();
    const isOverdue = !todo.done && todo.dueDate < today;
    const isToday = todo.dueDate === today;
    const chip = document.createElement('span');
    chip.className = `todo-due-chip${isOverdue ? ' overdue' : isToday ? ' today' : ''}`;
    const d = new Date(todo.dueDate + 'T00:00:00');
    chip.textContent = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    meta.appendChild(chip);
  }

  textWrap.append(span, meta);

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
  return li;
}

function renderTodos() {
  const list = document.getElementById('todo-list') as HTMLUListElement;
  list.innerHTML = '';

  const activeCount = todos.filter(t => !t.done).length;
  const countEl = document.getElementById('todo-count');
  if (countEl) countEl.textContent = activeCount > 0 ? String(activeCount) : '';

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

  // Group by due date bucket
  const today = todayString();
  const groups = new Map<string, Todo[]>();

  const pastKey = '__past__';
  const todayKey = 'Today';
  const noneKey = '__none__';

  visible.forEach(todo => {
    let key: string;
    if (!todo.dueDate) key = noneKey;
    else if (todo.dueDate < today) key = pastKey;
    else if (todo.dueDate === today) key = todayKey;
    else key = todo.dueDate; // YYYY-MM-DD for future sorting
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(todo);
  });

  // Order: past → today → future dates (sorted) → no due date
  const orderedKeys: string[] = [];
  if (groups.has(pastKey)) orderedKeys.push(pastKey);
  if (groups.has(todayKey)) orderedKeys.push(todayKey);
  const futureKeys = [...groups.keys()].filter(k => k !== pastKey && k !== todayKey && k !== noneKey).sort();
  orderedKeys.push(...futureKeys);
  if (groups.has(noneKey)) orderedKeys.push(noneKey);

  orderedKeys.forEach(key => {
    const items = groups.get(key)!;

    // Section header
    const header = document.createElement('li');
    header.className = 'todo-section-header';
    let label = '';
    if (key === pastKey) label = 'Past';
    else if (key === todayKey) label = 'Today';
    else if (key === noneKey) label = 'No due date';
    else label = dueDateLabel(key);
    header.textContent = label;
    list.appendChild(header);

    items.forEach(todo => list.appendChild(buildTodoItem(todo)));
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

  // Date picker toggle
  const dateBtn = document.getElementById('todo-date-btn') as HTMLButtonElement;
  const dueDateInput = document.getElementById('todo-due-date') as HTMLInputElement;
  dateBtn?.addEventListener('click', () => {
    if (dueDateInput.classList.toggle('visible')) {
      dueDateInput.showPicker?.();
      dueDateInput.focus();
    } else {
      dueDateInput.value = '';
    }
  });
  dueDateInput?.addEventListener('change', () => {
    dateBtn?.classList.toggle('has-date', !!dueDateInput.value);
  });

  // Add task form
  const form = document.getElementById('todo-form') as HTMLFormElement;
  const input = document.getElementById('todo-input') as HTMLInputElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const priority = (priBtn?.dataset['pri'] ?? 'none') as Todo['priority'];
    const dueDate = dueDateInput?.value || undefined;
    todos.push({ id: Date.now().toString(), text, done: false, priority, dueDate });
    priIdx = 0; if (priBtn) priBtn.dataset['pri'] = 'none';
    if (dueDateInput) { dueDateInput.value = ''; dueDateInput.classList.remove('visible'); }
    dateBtn?.classList.remove('has-date');
    saveTodos(todos); renderTodos(); renderFmTodos(); input.value = ''; updatePomoTask();
  });
}

// ─── Quick Links ──────────────────────────────────────────────────────────────

let links: QuickLink[] = [];
let folders: QuickLinkFolder[] = [];
const collapsedFolders = new Set<string>();

function faviconUrl(url: string): string {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).origin}&sz=32`; }
  catch { return ''; }
}

function buildLinkItem(link: QuickLink): HTMLLIElement {
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
  return li;
}

function renderLinks() {
  const list = document.getElementById('links-list') as HTMLUListElement;
  list.innerHTML = '';

  // Ungrouped links first
  const ungrouped = links.filter(l => !l.folderId);
  ungrouped.forEach(link => list.appendChild(buildLinkItem(link)));

  // Folders
  folders.forEach(folder => {
    const folderLinks = links.filter(l => l.folderId === folder.id);
    const collapsed = collapsedFolders.has(folder.id);

    // Folder header row
    const headerLi = document.createElement('li');
    headerLi.className = 'link-folder-header';

    const toggle = document.createElement('button');
    toggle.className = 'link-folder-toggle';
    toggle.innerHTML = `
      <svg class="folder-icon" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/>
      </svg>
      <span class="link-folder-label">${folder.label}</span>
      <span class="link-folder-count">${folderLinks.length}</span>
      <svg class="link-folder-chevron${collapsed ? ' collapsed' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
    `;
    toggle.addEventListener('click', () => {
      if (collapsedFolders.has(folder.id)) collapsedFolders.delete(folder.id);
      else collapsedFolders.add(folder.id);
      renderLinks();
    });

    const delFolder = document.createElement('button');
    delFolder.className = 'link-del link-folder-del'; delFolder.textContent = '✕'; delFolder.title = 'Delete folder';
    delFolder.addEventListener('click', () => {
      // Move folder links to ungrouped
      links = links.map(l => l.folderId === folder.id ? { ...l, folderId: undefined } : l);
      folders = folders.filter(f => f.id !== folder.id);
      saveFolders(folders); saveLinks(links); renderLinks(); syncFolderSelect();
    });

    headerLi.append(toggle, delFolder);
    list.appendChild(headerLi);

    if (!collapsed) {
      folderLinks.forEach(link => {
        const li = buildLinkItem(link);
        li.classList.add('link-in-folder');
        list.appendChild(li);
      });
    }
  });
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

async function initLinks() {
  [links, folders] = await Promise.all([getLinks(), getFolders()]);
  renderLinks();

  const form = document.getElementById('link-form') as HTMLFormElement;
  const labelInput = document.getElementById('link-label') as HTMLInputElement;
  const urlInput = document.getElementById('link-url') as HTMLInputElement;
  const folderSel = document.getElementById('link-folder-sel') as HTMLSelectElement;
  const newFolderBtn = document.getElementById('btn-new-folder') as HTMLButtonElement;

  syncFolderSelect();

  // New folder
  newFolderBtn?.addEventListener('click', () => {
    const name = prompt('Folder name:')?.trim();
    if (!name) return;
    folders.push({ id: Date.now().toString(), label: name });
    saveFolders(folders); renderLinks(); syncFolderSelect();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = labelInput.value.trim(); const url = urlInput.value.trim();
    if (!label || !url) return;
    const folderId = folderSel?.value || undefined;
    links.push({ id: Date.now().toString(), label, url, folderId });
    saveLinks(links); renderLinks(); labelInput.value = ''; urlInput.value = '';
    if (folderSel) folderSel.value = '';
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
  const panel    = document.getElementById('notes-panel')    as HTMLElement;
  const textarea = document.getElementById('notes-textarea') as HTMLTextAreaElement;
  const wordCountEl  = document.getElementById('notes-wordcount')   as HTMLElement;
  const saveStatusEl = document.getElementById('notes-save-status') as HTMLElement;
  const saveIconEl   = document.getElementById('notes-save-icon')   as HTMLElement;

  textarea.value = await getNotes();
  updateWordCount();

  // ── Word count ──────────────────────────────────────────────────────────────
  function updateWordCount() {
    const text = textarea.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    wordCountEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  }

  // ── Autosave with status indicator ─────────────────────────────────────────
  let saveTimer: ReturnType<typeof setTimeout>;
  function setSaveStatus(state: 'saving' | 'saved') {
    saveStatusEl.className = `notes-save-status ${state}`;
    if (state === 'saving') {
      saveIconEl.innerHTML = `<circle cx="12" cy="12" r="9" stroke-dasharray="56" stroke-dashoffset="14" stroke-linecap="round"/>`;
      saveStatusEl.childNodes[saveStatusEl.childNodes.length - 1].textContent = ' Saving…';
    } else {
      saveIconEl.innerHTML = `<polyline points="20 6 9 17 4 12"/>`;
      saveStatusEl.childNodes[saveStatusEl.childNodes.length - 1].textContent = ' Saved';
    }
  }

  textarea.addEventListener('input', () => {
    updateWordCount();
    setSaveStatus('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await saveNotes(textarea.value);
      setSaveStatus('saved');
    }, 700);
  });

  // ── Keyboard shortcuts (Ctrl/Cmd + B/I) ────────────────────────────────────
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); applyFmt('bold'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); applyFmt('italic'); }
    // Tab inserts 2 spaces instead of leaving the textarea
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = textarea.selectionStart, en = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, s) + '  ' + textarea.value.slice(en);
      textarea.selectionStart = textarea.selectionEnd = s + 2;
    }
  });

  // ── Format toolbar ──────────────────────────────────────────────────────────
  function applyFmt(fmt: string) {
    const s = textarea.selectionStart, e = textarea.selectionEnd;
    const selected = textarea.value.slice(s, e);
    const before = textarea.value.slice(0, s);
    const after  = textarea.value.slice(e);

    let replacement = selected;
    let cursorOffset = 0;

    if (fmt === 'bold') {
      replacement = `**${selected || 'bold text'}**`;
      cursorOffset = selected ? 0 : -2;
    } else if (fmt === 'italic') {
      replacement = `_${selected || 'italic text'}_`;
      cursorOffset = selected ? 0 : -1;
    } else if (fmt === 'code') {
      replacement = `\`${selected || 'code'}\``;
      cursorOffset = selected ? 0 : -1;
    } else if (fmt === 'ul') {
      // Prefix each selected line with "- "
      const lines = (selected || 'List item').split('\n');
      replacement = lines.map(l => `- ${l}`).join('\n');
      cursorOffset = 0;
    } else if (fmt === 'task') {
      const lines = (selected || 'Task').split('\n');
      replacement = lines.map(l => `- [ ] ${l}`).join('\n');
      cursorOffset = 0;
    } else if (fmt === 'hr') {
      replacement = `\n---\n`;
      cursorOffset = 0;
    } else if (fmt === 'h1') {
      const lines = (selected || 'Heading').split('\n');
      replacement = lines.map(l => l.startsWith('# ') ? l.slice(2) : `# ${l}`).join('\n');
      cursorOffset = 0;
    }

    textarea.value = before + replacement + after;
    const newPos = s + replacement.length + cursorOffset;
    textarea.selectionStart = textarea.selectionEnd = newPos;
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
  }

  document.querySelectorAll<HTMLButtonElement>('.notes-fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => applyFmt(btn.dataset['fmt']!));
  });

  // ── Copy all ────────────────────────────────────────────────────────────────
  document.getElementById('btn-notes-copy')?.addEventListener('click', async () => {
    if (!textarea.value) return;
    await navigator.clipboard.writeText(textarea.value);
    const btn = document.getElementById('btn-notes-copy') as HTMLButtonElement;
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  });

  // ── Clear ───────────────────────────────────────────────────────────────────
  document.getElementById('btn-notes-clear')?.addEventListener('click', () => {
    if (!textarea.value) return;
    if (confirm('Clear all notes?')) {
      textarea.value = '';
      textarea.dispatchEvent(new Event('input'));
    }
  });

  // ── Open / close ────────────────────────────────────────────────────────────
  document.getElementById('btn-notes-toggle')?.addEventListener('click', () => {
    panel.classList.remove('hidden');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) setTimeout(() => textarea.focus(), 280);
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
  void initYouTubeBeats(updateNowPlaying);

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

async function fetchYtTitle(id: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { signal: controller.signal },
    );
    if (!r.ok) return 'Custom Video';
    const d = await r.json();
    return (d.title as string) || 'Custom Video';
  } catch { return 'Custom Video'; }
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

function updateNowPlayingView(id: string, title: string, ch: string) {
  activeYtTitle = title; activeYtCh = ch; activeYtId = id;
  if (ytNpThumb) ytNpThumb.src = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
  if (ytNpTrack) ytNpTrack.textContent = title;
  if (ytNpChannel) ytNpChannel.textContent = ch;
  if (ytNpYtLink) ytNpYtLink.href = `https://www.youtube.com/watch?v=${id}`;
}

function playYtVideo(id: string, title: string, ch: string, startSec = 0) {
  if (!activeYtIframe) return;
  ytCurrentIdx = ytPlaylist.findIndex(v => v.id === id);
  const startParam = startSec > 0 ? `&start=${Math.floor(startSec)}` : '';
  activeYtIframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&enablejsapi=1${startParam}`;
  ytPlayStartedAt = Date.now() - startSec * 1000;
  ytIsPaused = false;
  updateNowPlayingView(id, title, ch);
  updatePausePlayUI();
  markActiveCard(id);
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
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://www.youtube-nocookie.com') return;
  try {
    const data = JSON.parse(e.data as string);
    if (data.event !== 'onStateChange') return;
    if (data.info === 0) {
      ytPlayNext();
    } else if (data.info === 2) {
      ytIsPaused = true;
      updatePausePlayUI();
      const pos = (Date.now() - ytPlayStartedAt) / 1000;
      void getYtPlayState().then(s => { if (s) void saveYtPlayState({ ...s, isPaused: true, pausedPosition: pos }); });
    } else if (data.info === 1) {
      ytIsPaused = false;
      updatePausePlayUI();
      void getYtPlayState().then(s => {
        if (s) {
          ytPlayStartedAt = Date.now() - (s.pausedPosition ?? 0) * 1000;
          void saveYtPlayState({ ...s, isPaused: false, pausedPosition: 0, startedAt: ytPlayStartedAt });
        }
      });
    }
  } catch { /* non-JSON */ }
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
  const canvas   = document.getElementById('yt-visualizer')   as HTMLCanvasElement;
  const ytGrid   = document.getElementById('yt-grid')         as HTMLElement;

  let customVideos = await getCustomYtVideos();

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
  const form  = document.getElementById('yt-add-form')  as HTMLFormElement;
  const input = document.getElementById('yt-add-input') as HTMLInputElement;
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseYouTubeId(input.value);
    if (!id) { input.classList.add('yt-add-error'); setTimeout(() => input.classList.remove('yt-add-error'), 1200); return; }
    if (customVideos.some(v => v.id === id) || YT_VIDEOS.some(v => v.id === id)) { input.value = ''; return; }
    const btn = form.querySelector('.yt-add-btn') as HTMLButtonElement;
    btn.textContent = '…'; btn.disabled = true;
    const title = await fetchYtTitle(id);
    customVideos.push({ id, title, addedAt: Date.now() });
    await saveCustomYtVideos(customVideos);
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add`;
    btn.disabled = false; input.value = '';
    rebuildPlaylist(); renderGrid();
  });

  // Now Playing controls
  ytNpPausePlayBtn?.addEventListener('click', () => {
    if (!activeYtIframe) return;
    const cmd = ytIsPaused ? 'playVideo' : 'pauseVideo';
    activeYtIframe.contentWindow?.postMessage(`{"event":"command","func":"${cmd}","args":""}`, '*');
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

  // Cross-tab / new-tab auto-resume
  const savedState = await getYtPlayState();
  if (savedState && Date.now() - savedState.startedAt < 8 * 3600 * 1000) {
    rebuildPlaylist();
    const elapsed = savedState.isPaused
      ? savedState.pausedPosition
      : (Date.now() - savedState.startedAt) / 1000;
    if (savedState.isPaused) {
      // Show Now Playing in paused state without auto-playing
      updateNowPlayingView(savedState.id, savedState.title, savedState.ch);
      ytIsPaused = true;
      updatePausePlayUI();
      switchYtPane('nowplaying');
    } else {
      // Auto-resume from same position
      playYtVideo(savedState.id, savedState.title, savedState.ch, Math.max(0, Math.floor(elapsed)));
    }
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
  const fmYtPlayer = document.getElementById('fm-yt-player') as HTMLElement;
  const fmYtIframe = document.getElementById('fm-yt-iframe') as HTMLIFrameElement;
  const fmYtTitle = document.getElementById('fm-yt-title') as HTMLElement;
  const fmYtOpen = document.getElementById('fm-yt-open') as HTMLAnchorElement;

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
      } else {
        // Stop YouTube when switching back
        fmYtIframe.src = '';
        fmYtPlayer.classList.add('hidden');
        fmYtGrid.classList.remove('hidden');
        fmSoundInfo = null; updateFmSoundChip();
      }
    });
  });

  // Build FM YouTube grid (shared custom videos + built-in)
  async function renderFmYtGrid() {
    fmYtGrid.innerHTML = '';
    const customVideos = await getCustomYtVideos();

    function fmPlay(id: string, title: string, ch: string) {
      fmYtGrid.classList.add('hidden');
      fmYtPlayer.classList.remove('hidden');
      fmYtTitle.textContent = `${title} · ${ch}`;
      fmYtOpen.href = `https://www.youtube.com/watch?v=${id}`;
      fmYtIframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&enablejsapi=1`;
      fmSoundInfo = { label: title, variantId: `yt-${id}` };
      updateFmSoundChip();
      // Sync with shared playlist state
      activeYtIframe = fmYtIframe;
      activeYtUpdateFn = (label) => {
        if (label) { fmSoundInfo = { label, variantId: `yt-active` }; updateFmSoundChip(); }
      };
      ytCurrentIdx = ytPlaylist.findIndex(v => v.id === id);
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
  fmAddForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseYouTubeId(fmAddInput.value);
    if (!id) { fmAddInput.classList.add('yt-add-error'); setTimeout(() => fmAddInput.classList.remove('yt-add-error'), 1200); return; }
    const existing = await getCustomYtVideos();
    if (existing.some(v => v.id === id) || YT_VIDEOS.some(v => v.id === id)) { fmAddInput.value = ''; return; }
    const btn = fmAddForm.querySelector('.yt-add-btn') as HTMLButtonElement;
    btn.textContent = '…'; btn.disabled = true;
    const title = await fetchYtTitle(id);
    existing.push({ id, title, addedAt: Date.now() });
    await saveCustomYtVideos(existing);
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add`;
    btn.disabled = false;
    fmAddInput.value = '';
    renderFmYtGrid();
  });

  document.getElementById('fm-yt-back')?.addEventListener('click', () => {
    fmYtPlayer.classList.add('hidden');
    fmYtGrid.classList.remove('hidden');
    fmYtIframe.src = '';
    fmSoundInfo = null; updateFmSoundChip();
    activeYtIframe = null;
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
  if (settings.showWeather) void loadWeather(settings.locationOverride ?? '');
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
