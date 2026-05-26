import {
  getSettings, saveSettings, getDaily, saveDaily, getTodos, saveTodos,
  getLinks, saveLinks, getFolders, saveFolders, getNotes, saveNotes, getCountdowns, saveCountdowns,
  getFocusHistory, logFocusSession, getCustomYtVideos, saveCustomYtVideos,
  getYtPlayState, saveYtPlayState, clearYtPlayState, getYtRecent, addYtRecent,
  todayString, type Todo, type QuickLink, type QuickLinkFolder, type Countdown, type WorldClock, type Settings,
  type CustomYtVideo, type YtPlayState, type WatchItem,
  getWatchlist, saveWatchlist,
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

  const doneCount = todos.filter(t => t.done).length;
  const activeCount = todos.length - doneCount;
  const countEl = document.getElementById('todo-count');
  if (countEl) countEl.textContent = activeCount > 0 ? String(activeCount) : '';

  // Progress bar
  const progressBar = document.getElementById('todo-progress-bar') as HTMLElement;
  if (progressBar) {
    const pct = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;
    progressBar.style.width = pct + '%';
  }

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

  // Priority chips
  const addCard = document.getElementById('todo-add-card')!;
  let selectedPri: 'none' | 'medium' | 'high' = 'none';
  document.querySelectorAll<HTMLButtonElement>('.todo-pri-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedPri = chip.dataset['pri'] as typeof selectedPri;
      document.querySelectorAll('.todo-pri-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  // Date picker — input stays in DOM always so picker anchors correctly
  const dateBtn = document.getElementById('todo-date-btn') as HTMLButtonElement;
  const dateLabel = document.getElementById('todo-date-label')!;
  const dueDateInput = document.getElementById('todo-due-date') as HTMLInputElement;
  dateBtn?.addEventListener('click', () => {
    dueDateInput.showPicker?.();
  });
  dueDateInput?.addEventListener('change', () => {
    const hasDate = !!dueDateInput.value;
    dateBtn?.classList.toggle('has-date', hasDate);
    if (hasDate) {
      const d = new Date(dueDateInput.value + 'T00:00:00');
      dateLabel.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else {
      dateLabel.textContent = 'Set date';
    }
  });

  // Expand meta row when input is focused
  const todoInput = document.getElementById('todo-input') as HTMLInputElement;
  todoInput?.addEventListener('focus', () => addCard.classList.add('expanded'));
  todoInput?.addEventListener('blur', () => {
    if (!todoInput.value) addCard.classList.remove('expanded');
  });

  // Add task form
  const form = document.getElementById('todo-form') as HTMLFormElement;
  const input = document.getElementById('todo-input') as HTMLInputElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const dueDate = dueDateInput?.value || undefined;
    todos.push({ id: Date.now().toString(), text, done: false, priority: selectedPri, dueDate });
    // Reset
    selectedPri = 'none';
    document.querySelectorAll('.todo-pri-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.todo-pri-chip.chip-none')?.classList.add('active');
    if (dueDateInput) dueDateInput.value = '';
    if (dateBtn) dateBtn.classList.remove('has-date');
    dateLabel.textContent = 'Set date';
    addCard.classList.remove('expanded');
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
  const labelSpan = document.createElement('span');
  labelSpan.className = 'link-item-label';
  labelSpan.textContent = link.label;
  a.append(favicon, labelSpan);
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
  const addToggleBtn = document.getElementById('btn-links-add-toggle') as HTMLButtonElement;
  const cancelBtn = document.getElementById('btn-link-form-cancel') as HTMLButtonElement;

  syncFolderSelect();

  // Toggle add form
  function showAddForm() { form.classList.remove('hidden'); addToggleBtn.classList.add('hidden'); labelInput.focus(); }
  function hideAddForm() { form.classList.add('hidden'); addToggleBtn.classList.remove('hidden'); labelInput.value = ''; urlInput.value = ''; if (folderSel) folderSel.value = ''; }
  addToggleBtn?.addEventListener('click', showAddForm);
  cancelBtn?.addEventListener('click', hideAddForm);

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
    saveLinks(links); renderLinks(); hideAddForm();
  });

  // Toggle panel
  const panel = document.getElementById('links-panel') as HTMLElement;
  document.getElementById('btn-links-toggle')?.addEventListener('click', () => {
    panel.classList.toggle('hidden', false);
    panel.classList.toggle('open');
  });
  document.getElementById('btn-links-close')?.addEventListener('click', () => panel.classList.remove('open'));

  // Export links as JSON
  document.getElementById('btn-bookmarks-export')?.addEventListener('click', () => {
    const data = { version: 1, exportedAt: new Date().toISOString(), folders, links };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'monktab-links.json'; a.click();
    URL.revokeObjectURL(url);
  });
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

// ─── Markets ──────────────────────────────────────────────────────────────────

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  sparkline_in_7d: { price: number[] };
}

interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
}

const MARKET_CACHE_TTL = 5 * 60 * 1000; // 5 min
let activeMarketTab = 'overview';

function fmtPrice(n: number): string {
  if (n >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function fmtLarge(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

function changeClass(pct: number): string { return pct >= 0 ? 'up' : 'down'; }
function changeArrow(pct: number): string { return pct >= 0 ? '▲' : '▼'; }

function sparklineSVG(data: number[], width: number, height: number, positive: boolean): string {
  if (!data || data.length < 2) return '';
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = data.length - 1;
  const H = 100; const pad = 6;
  const pts = data.map((v, i) => ({ x: (i / W) * W, y: pad + (1 - (v - min) / range) * (H - pad * 2) }));

  let line = pts.map((p, i) => `${i === 0 ? 'M' : 'C'} ${i === 0 ? `${p.x} ${p.y}` : `${(pts[i-1].x+p.x)/2} ${pts[i-1].y}, ${(pts[i-1].x+p.x)/2} ${p.y}, ${p.x} ${p.y}`}`).join(' ');
  const fill = `${line} L ${W} ${H} L 0 ${H} Z`;
  const color = positive ? '#4ade80' : '#f87171';
  const fillAlpha = positive ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)';
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><path d="${fill}" fill="${fillAlpha}" stroke="none"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

async function fetchCryptoMarkets(ids: string[]): Promise<CoinData[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&sparkline=true&price_change_percentage=24h&order=market_cap_desc`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  return r.json();
}

async function fetchCryptoGlobal(): Promise<{ market_cap_usd: number; volume_usd: number; btc_dominance: number; market_cap_change_pct: number }> {
  const r = await fetch('https://api.coingecko.com/api/v3/global', { signal: AbortSignal.timeout(6000) });
  const d = await r.json();
  const data = d.data;
  return {
    market_cap_usd: data.total_market_cap?.usd ?? 0,
    volume_usd: data.total_volume?.usd ?? 0,
    btc_dominance: data.market_cap_percentage?.btc ?? 0,
    market_cap_change_pct: data.market_cap_change_percentage_24h_usd ?? 0,
  };
}

async function fetchFearGreed(): Promise<{ value: number; classification: string }> {
  const r = await fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(5000) });
  const d = await r.json();
  const entry = d?.data?.[0];
  return { value: Number(entry?.value ?? 50), classification: entry?.value_classification ?? 'Neutral' };
}

async function fetchFinnhubQuote(symbol: string, key: string): Promise<StockQuote | null> {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`, { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    if (!d || d.c === 0) return null;
    return { symbol, price: d.c, change: d.d, changePct: d.dp, high: d.h, low: d.l };
  } catch { return null; }
}

async function fetchFinnhubCandles(symbol: string, key: string): Promise<number[]> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 30 * 86400;
  try {
    const r = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${key}`, { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    return d?.s === 'ok' ? (d.c as number[]) : [];
  } catch { return []; }
}

function renderMarketOverviewSkeleton() {
  const grid = document.getElementById('market-overview-grid')!;
  grid.innerHTML = `<div class="market-sk-card"></div><div class="market-sk-card"></div><div class="market-sk-card"></div>`;
}

function renderMarketWatchlistSkeleton() {
  const body = document.getElementById('market-watchlist-body')!;
  body.innerHTML = Array.from({ length: 6 }).map(() => `<div class="market-sk-row"></div>`).join('');
}

function renderFearGreed(value: number, label: string) {
  const scoreEl = document.getElementById('market-fng-score')!;
  const barEl = document.getElementById('market-fng-bar')!;
  const classEl = document.getElementById('market-fng-class')!;
  scoreEl.textContent = String(value);
  barEl.style.width = `${value}%`;
  // Color the score by zone
  const color = value <= 25 ? '#f87171' : value <= 45 ? '#fb923c' : value <= 55 ? '#facc15' : value <= 75 ? '#4ade80' : '#22d3ee';
  scoreEl.style.color = color;
  classEl.textContent = label;
  classEl.style.color = color;
}

function renderGlobalStats(data: { market_cap_usd: number; volume_usd: number; btc_dominance: number; market_cap_change_pct: number }) {
  const cap = document.getElementById('mkt-cap')!;
  const capChg = document.getElementById('mkt-cap-chg')!;
  const vol = document.getElementById('mkt-vol')!;
  const btcDom = document.getElementById('mkt-btc-dom')!;
  cap.textContent = fmtLarge(data.market_cap_usd);
  const pct = data.market_cap_change_pct;
  capChg.textContent = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`;
  capChg.style.color = pct >= 0 ? '#4ade80' : '#f87171';
  vol.textContent = fmtLarge(data.volume_usd);
  btcDom.textContent = `${data.btc_dominance.toFixed(1)}%`;
}

function renderOverviewGrid(coins: CoinData[]) {
  const grid = document.getElementById('market-overview-grid')!;
  grid.innerHTML = '';
  coins.slice(0, 3).forEach(c => {
    const pct = c.price_change_percentage_24h;
    const pos = pct >= 0;
    const spark = sparklineSVG(c.sparkline_in_7d?.price ?? [], 88, 36, pos);
    const card = document.createElement('a');
    card.className = 'market-asset-card';
    card.href = `https://www.coingecko.com/en/coins/${c.id}`;
    card.target = '_blank'; card.rel = 'noopener noreferrer';
    card.innerHTML = `
      <div class="market-asset-top">
        <div class="market-asset-info">
          <span class="market-asset-symbol">${c.symbol.toUpperCase()}</span>
          <span class="market-asset-name">${c.name}</span>
        </div>
        <div class="market-asset-sparkline">${spark}</div>
      </div>
      <div class="market-asset-price-row">
        <span class="market-asset-price">$${fmtPrice(c.current_price)}</span>
        <span class="market-asset-change ${changeClass(pct)}">${changeArrow(pct)} ${Math.abs(pct).toFixed(2)}%</span>
      </div>
      <div class="market-asset-meta">Vol ${fmtLarge(c.total_volume)} · MCap ${fmtLarge(c.market_cap)}</div>`;
    grid.appendChild(card);
  });
}

function renderWatchlistSection(title: string, rows: HTMLElement[]) {
  const body = document.getElementById('market-watchlist-body')!;
  if (rows.length === 0) return;
  const hdr = document.createElement('div');
  hdr.className = 'market-section-header';
  hdr.textContent = title;
  body.appendChild(hdr);
  rows.forEach(r => body.appendChild(r));
}

function buildCryptoRow(c: CoinData): HTMLElement {
  const pct = c.price_change_percentage_24h;
  const pos = pct >= 0;
  const spark = sparklineSVG(c.sparkline_in_7d?.price ?? [], 72, 28, pos);
  const a = document.createElement('a');
  a.className = 'market-watchlist-row';
  a.href = `https://www.coingecko.com/en/coins/${c.id}`;
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.innerHTML = `
    <span class="market-row-type crypto">CRYPTO</span>
    <div class="market-row-left">
      <span class="market-row-symbol">${c.symbol.toUpperCase()}</span>
      <span class="market-row-name">${c.name}</span>
    </div>
    <span class="market-row-price">$${fmtPrice(c.current_price)}</span>
    <span class="market-row-change ${changeClass(pct)}">${changeArrow(pct)} ${Math.abs(pct).toFixed(2)}%</span>
    <div class="market-row-sparkline">${spark}</div>`;
  return a;
}

function buildStockRow(q: StockQuote, candles: number[]): HTMLElement {
  const pos = q.changePct >= 0;
  const spark = sparklineSVG(candles, 72, 28, pos);
  const a = document.createElement('a');
  a.className = 'market-watchlist-row';
  a.href = `https://finance.yahoo.com/quote/${q.symbol}`;
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.innerHTML = `
    <span class="market-row-type stock">STOCK</span>
    <div class="market-row-left">
      <span class="market-row-symbol">${q.symbol}</span>
      <span class="market-row-name">H ${fmtPrice(q.high)} · L ${fmtPrice(q.low)}</span>
    </div>
    <span class="market-row-price">$${fmtPrice(q.price)}</span>
    <span class="market-row-change ${changeClass(q.changePct)}">${changeArrow(q.changePct)} ${Math.abs(q.changePct).toFixed(2)}%</span>
    <div class="market-row-sparkline">${spark}</div>`;
  return a;
}

function setMarketLastUpdated() {
  const el = document.getElementById('market-last-updated')!;
  el.textContent = `· ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

async function loadMarketOverview(force = false) {
  const cacheKey = 'mt_market_overview';
  if (!force) {
    const cached = await chrome.storage.local.get(cacheKey);
    const entry = cached[cacheKey] as { coins: CoinData[]; global: any; fng: any; cachedAt: number } | undefined;
    if (entry && Date.now() - entry.cachedAt < MARKET_CACHE_TTL) {
      renderFearGreed(entry.fng.value, entry.fng.classification);
      renderGlobalStats(entry.global);
      renderOverviewGrid(entry.coins);
      return;
    }
  }
  renderMarketOverviewSkeleton();
  try {
    const [coins, global, fng] = await Promise.all([
      fetchCryptoMarkets(['bitcoin', 'ethereum', 'solana']),
      fetchCryptoGlobal(),
      fetchFearGreed(),
    ]);
    renderFearGreed(fng.value, fng.classification);
    renderGlobalStats(global);
    renderOverviewGrid(coins);
    await chrome.storage.local.set({ [cacheKey]: { coins, global, fng, cachedAt: Date.now() } });
    setMarketLastUpdated();
  } catch {
    document.getElementById('market-overview-grid')!.innerHTML = '<p class="market-error">Failed to load market data.</p>';
  }
}

async function loadMarketWatchlist(settings: Settings, force = false) {
  const body = document.getElementById('market-watchlist-body')!;
  const noKeyEl = document.getElementById('market-no-key')!;
  body.innerHTML = ''; noKeyEl.classList.add('hidden');

  const cacheKey = 'mt_market_watchlist';
  if (!force) {
    const cached = await chrome.storage.local.get(cacheKey);
    const entry = cached[cacheKey] as { cryptoRows: CoinData[]; stockRows: { q: StockQuote; c: number[] }[]; cachedAt: number } | undefined;
    if (entry && Date.now() - entry.cachedAt < MARKET_CACHE_TTL) {
      renderWatchlistSection('Crypto', entry.cryptoRows.map(buildCryptoRow));
      if (entry.stockRows.length) renderWatchlistSection('Stocks', entry.stockRows.map(r => buildStockRow(r.q, r.c)));
      else if (!settings.finnhubKey) noKeyEl.classList.remove('hidden');
      return;
    }
  }

  renderMarketWatchlistSkeleton();

  const cryptoIds = settings.marketWatchlistCrypto.length ? settings.marketWatchlistCrypto : ['bitcoin', 'ethereum', 'solana'];
  const stockSymbols = settings.marketWatchlistStocks.length ? settings.marketWatchlistStocks : [];

  try {
    const cryptoCoins = await fetchCryptoMarkets(cryptoIds);
    body.innerHTML = '';
    renderWatchlistSection('Crypto', cryptoCoins.map(buildCryptoRow));

    if (settings.finnhubKey && stockSymbols.length) {
      const stockResults = await Promise.all(
        stockSymbols.map(async sym => {
          const [q, c] = await Promise.all([
            fetchFinnhubQuote(sym, settings.finnhubKey),
            fetchFinnhubCandles(sym, settings.finnhubKey),
          ]);
          return q ? { q, c } : null;
        })
      );
      const valid = stockResults.filter(Boolean) as { q: StockQuote; c: number[] }[];
      if (valid.length) renderWatchlistSection('Stocks', valid.map(r => buildStockRow(r.q, r.c)));
      await chrome.storage.local.set({ [cacheKey]: { cryptoRows: cryptoCoins, stockRows: valid, cachedAt: Date.now() } });
    } else {
      if (!settings.finnhubKey) noKeyEl.classList.remove('hidden');
      await chrome.storage.local.set({ [cacheKey]: { cryptoRows: cryptoCoins, stockRows: [], cachedAt: Date.now() } });
    }
    setMarketLastUpdated();
  } catch {
    body.innerHTML = '<p class="market-error">Failed to load watchlist.</p>';
  }
}

// ─── Watchlist + Alerts ───────────────────────────────────────────────────────

let watchlist: WatchItem[] = [];

function fireAlert(item: WatchItem, price: number) {
  if (!item.alertPrice || !item.alertDirection) return;
  const triggered = item.alertDirection === 'above' ? price >= item.alertPrice : price <= item.alertPrice;
  if (!triggered || item.alertTriggered) return;
  item.alertTriggered = true;
  const dir = item.alertDirection === 'above' ? '▲ above' : '▼ below';
  try {
    chrome.notifications.create(`alert-${item.id}`, {
      type: 'basic',
      iconUrl: '/icons/icon48.png',
      title: `MonkTab Price Alert — ${item.symbol}`,
      message: `${item.symbol} is now $${fmtPrice(price)}, ${dir} your target of $${fmtPrice(item.alertPrice)}`,
    });
  } catch { /* notifications may not be available */ }
}

async function renderWatchlistAlerts(settings: Settings) {
  const holdingsEl = document.getElementById('portfolio-holdings')!;
  holdingsEl.innerHTML = '';

  if (watchlist.length === 0) {
    holdingsEl.innerHTML = '<p class="portfolio-empty">No items yet. Add a stock or crypto below to start watching prices.</p>';
    return;
  }

  // Always fetch fresh prices — show skeleton rows first
  holdingsEl.innerHTML = `<div class="market-skeleton">${watchlist.map(() => `<div class="market-sk-row"></div>`).join('')}</div>`;

  const cryptoItems = watchlist.filter(i => i.type === 'crypto' && i.coinId);
  const stockItems = watchlist.filter(i => i.type === 'stock');

  let cryptoPrices: Record<string, { price: number; change24h: number; sparkline: number[] }> = {};
  let stockPrices: Record<string, { price: number; changePct: number; candles: number[] }> = {};

  await Promise.allSettled([
    (async () => {
      if (!cryptoItems.length) return;
      const ids = cryptoItems.map(i => i.coinId!).join(',');
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true&price_change_percentage=24h`, { signal: AbortSignal.timeout(8000) });
      const coins: CoinData[] = await r.json();
      coins.forEach(c => { cryptoPrices[c.id] = { price: c.current_price, change24h: c.price_change_percentage_24h, sparkline: c.sparkline_in_7d?.price ?? [] }; });
    })(),
    (async () => {
      if (!stockItems.length || !settings.finnhubKey) return;
      await Promise.all(stockItems.map(async item => {
        const [q, candles] = await Promise.all([
          fetchFinnhubQuote(item.symbol, settings.finnhubKey),
          fetchFinnhubCandles(item.symbol, settings.finnhubKey),
        ]);
        if (q) stockPrices[item.symbol] = { price: q.price, changePct: q.changePct, candles };
      }));
    })(),
  ]);

  // Check and fire alerts
  watchlist.forEach(item => {
    const p = item.type === 'crypto' ? cryptoPrices[item.coinId ?? '']?.price : stockPrices[item.symbol]?.price;
    if (p) fireAlert(item, p);
  });
  await saveWatchlist(watchlist);

  holdingsEl.innerHTML = '';

  const hasStocks = watchlist.some(i => i.type === 'stock');
  if (hasStocks && !settings.finnhubKey) {
    const banner = document.createElement('div');
    banner.className = 'watchlist-no-key-banner';
    banner.innerHTML = `🔑 Stock prices need a <strong>Finnhub API key</strong>. Add it in <a class="banner-settings-link" href="#">Settings → Markets</a>. It's free.`;
    banner.querySelector<HTMLAnchorElement>('.banner-settings-link')?.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('settings-btn')?.click();
    });
    holdingsEl.appendChild(banner);
  }

  watchlist.forEach(item => {
    const isCrypto = item.type === 'crypto';
    const data = isCrypto ? cryptoPrices[item.coinId ?? ''] : stockPrices[item.symbol];
    const price = data?.price ?? 0;
    const changePct = isCrypto ? (data as any)?.change24h ?? 0 : (data as any)?.changePct ?? 0;
    const sparkData = isCrypto ? (data as any)?.sparkline ?? [] : (data as any)?.candles ?? [];
    const pos = changePct >= 0;
    const spark = sparklineSVG(sparkData, 72, 28, pos);
    const hasAlert = !!item.alertPrice && !!item.alertDirection;
    const alertFired = item.alertTriggered;
    const alertLabel = hasAlert
      ? `${item.alertDirection === 'above' ? '▲' : '▼'} $${fmtPrice(item.alertPrice!)}`
      : '';

    const row = document.createElement('div');
    row.className = `portfolio-row${alertFired ? ' alert-fired' : ''}`;
    row.innerHTML = `
      <div class="portfolio-col-symbol">
        <span class="portfolio-symbol">${item.symbol}</span>
        <span class="portfolio-type-badge ${item.type}">${item.type}</span>
      </div>
      <span class="market-row-price" style="flex:1;text-align:right">${price ? '$' + fmtPrice(price) : (!isCrypto && !settings.finnhubKey ? '<span class="watch-no-key-hint" title="Add your Finnhub API key in Settings → Markets">🔑 Key needed</span>' : '—')}</span>
      <span class="market-row-change ${changeClass(changePct)}" style="min-width:72px">${price ? changeArrow(changePct) + ' ' + Math.abs(changePct).toFixed(2) + '%' : ''}</span>
      <div class="market-row-sparkline">${spark}</div>
      ${hasAlert ? `<span class="watch-alert-badge${alertFired ? ' triggered' : ''}" title="Alert: ${item.alertDirection} $${item.alertPrice}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        ${alertLabel}
      </span>` : ''}
      <button class="portfolio-del-btn" data-id="${item.id}" title="Remove">✕</button>`;
    holdingsEl.appendChild(row);
  });

  holdingsEl.querySelectorAll<HTMLButtonElement>('.portfolio-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      watchlist = watchlist.filter(i => i.id !== btn.dataset['id']);
      await saveWatchlist(watchlist);
      renderWatchlistAlerts(settings);
    });
  });
}

function initWatchlistForm(settings: Settings) {
  const form = document.getElementById('portfolio-add-form') as HTMLFormElement;
  const toggleBtn = document.getElementById('btn-portfolio-add-toggle') as HTMLButtonElement;
  const cancelBtn = document.getElementById('btn-portfolio-cancel') as HTMLButtonElement;
  const typeEl = document.getElementById('pf-type') as HTMLSelectElement;
  const coinIdInput = document.getElementById('pf-coinid') as HTMLInputElement;

  function showForm() { form.classList.remove('hidden'); toggleBtn.classList.add('hidden'); }
  function hideForm() { form.classList.add('hidden'); toggleBtn.classList.remove('hidden'); form.reset(); coinIdInput.parentElement!.style.display = ''; }

  toggleBtn.addEventListener('click', showForm);
  cancelBtn.addEventListener('click', hideForm);
  typeEl.addEventListener('change', () => {
    coinIdInput.parentElement!.style.display = typeEl.value === 'stock' ? 'none' : '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const symbol = (document.getElementById('pf-symbol') as HTMLInputElement).value.trim().toUpperCase();
    const type = typeEl.value as 'crypto' | 'stock';
    const coinId = coinIdInput.value.trim().toLowerCase() || undefined;
    const alertPriceRaw = (document.getElementById('pf-alert-price') as HTMLInputElement).value.trim();
    const alertDir = (document.getElementById('pf-alert-dir') as HTMLSelectElement).value as 'above' | 'below' | '';
    if (!symbol) return;
    const item: WatchItem = {
      id: Date.now().toString(), symbol, type, coinId,
      alertPrice: alertPriceRaw ? parseFloat(alertPriceRaw) : undefined,
      alertDirection: alertDir || undefined,
    };
    watchlist.push(item);
    await saveWatchlist(watchlist);
    hideForm();
    renderWatchlistAlerts(settings);
  });
}

function initMarkets(settings: Settings) {
  const panel = document.getElementById('market-panel')!;
  const panes = { overview: 'market-pane-overview', watchlist: 'market-pane-watchlist', portfolio: 'market-pane-portfolio' };

  function switchPane(tab: string) {
    Object.entries(panes).forEach(([key, id]) =>
      document.getElementById(id)?.classList.toggle('hidden', key !== tab));
  }

  function openMarket() {
    document.getElementById('news-panel')?.classList.remove('open');
    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.add('open'));
  }

  document.getElementById('btn-market-toggle')?.addEventListener('click', () => {
    const opening = !panel.classList.contains('open');
    if (opening) { openMarket(); loadMarketOverview(); }
    else panel.classList.remove('open');
  });

  document.getElementById('btn-market-close')?.addEventListener('click', () => panel.classList.remove('open'));

  // Pre-load watchlist from storage at init time
  getWatchlist().then(items => { watchlist = items; });

  document.getElementById('btn-market-refresh')?.addEventListener('click', () => {
    if (activeMarketTab === 'overview') loadMarketOverview(true);
    else if (activeMarketTab === 'watchlist') loadMarketWatchlist(settings, true);
    else renderWatchlistAlerts(settings);
  });

  panel.querySelectorAll<HTMLButtonElement>('.market-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset['mtab']!;
      if (tab === activeMarketTab) return;
      activeMarketTab = tab;
      panel.querySelectorAll('.market-tab').forEach(t => t.classList.remove('market-tab--active'));
      btn.classList.add('market-tab--active');
      switchPane(tab);
      if (tab === 'overview') loadMarketOverview();
      else if (tab === 'watchlist') loadMarketWatchlist(settings);
      else renderWatchlistAlerts(settings);
    });
  });

  initWatchlistForm(settings);
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
      if (!d.title || d.stickied || d.score < 10) return;
      all.push({
        id: `r_${d.id}`,
        title: d.title,
        url: d.is_self ? `https://www.reddit.com${d.permalink}` : (d.url ?? `https://www.reddit.com${d.permalink}`),
        score: d.score ?? 0,
        by: d.author ?? '',
        time: Math.floor(d.created_utc),
        comments: d.num_comments ?? 0,
        domain: d.is_self ? `r/${d.subreddit}` : (d.domain ?? 'reddit.com'),
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
  })).filter(i => i.title);
}

function mergeNewsItems(...lists: Array<NewsItem[]>): NewsItem[] {
  const seen = new Set<string>();
  return lists.flat()
    .filter(i => seen.has(String(i.id)) ? false : (seen.add(String(i.id)), true))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

async function fetchAINews(): Promise<NewsItem[]> {
  const [reddit, devto] = await Promise.allSettled([
    fetchReddit(['MachineLearning', 'LocalLLaMA', 'artificial', 'OpenAI']),
    fetchDevTo('ai,machinelearning,llm,openai'),
  ]);
  return mergeNewsItems(
    reddit.status === 'fulfilled' ? reddit.value : [],
    devto.status === 'fulfilled' ? devto.value : [],
  );
}

async function fetchReleasesNews(): Promise<NewsItem[]> {
  const [reddit, devto] = await Promise.allSettled([
    fetchReddit(['programming', 'webdev', 'javascript', 'java', 'Python']),
    fetchDevTo('javascript,typescript,python,java,webdev,react'),
  ]);
  return mergeNewsItems(
    reddit.status === 'fulfilled' ? reddit.value : [],
    devto.status === 'fulfilled' ? devto.value : [],
  );
}

async function fetchSecurityNews(): Promise<NewsItem[]> {
  const [reddit, devto] = await Promise.allSettled([
    fetchReddit(['netsec', 'cybersecurity', 'hacking']),
    fetchDevTo('security,cybersecurity,hacking'),
  ]);
  return mergeNewsItems(
    reddit.status === 'fulfilled' ? reddit.value : [],
    devto.status === 'fulfilled' ? devto.value : [],
  );
}

async function fetchCloudNews(): Promise<NewsItem[]> {
  const [reddit, devto] = await Promise.allSettled([
    fetchReddit(['aws', 'devops', 'kubernetes', 'docker', 'sysadmin']),
    fetchDevTo('devops,cloud,aws,kubernetes,docker'),
  ]);
  return mergeNewsItems(
    reddit.status === 'fulfilled' ? reddit.value : [],
    devto.status === 'fulfilled' ? devto.value : [],
  );
}

function renderNewsSkeleton() {
  const feed = document.getElementById('news-feed')!;
  feed.innerHTML = Array.from({ length: 7 }).map(() => `
    <div class="news-skeleton-card">
      <div class="sk-line sk-title-1"></div>
      <div class="sk-line sk-title-2"></div>
      <div class="sk-line sk-meta"></div>
    </div>`).join('');
}

function renderNewsCards(items: NewsItem[]) {
  const feed = document.getElementById('news-feed')!;
  if (!items.length) {
    feed.innerHTML = '<p class="news-empty">No stories found.</p>';
    return;
  }
  feed.innerHTML = '';
  items.forEach((item) => {
    const a = document.createElement('a');
    a.className = 'news-card';
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const scoreColor = item.score >= 300 ? '#fb923c' : item.score >= 100 ? '#a78bfa' : '#4ade80';
    a.innerHTML = `
      <div class="news-card-title">${item.title}</div>
      <div class="news-card-meta">
        <span class="news-score" style="color:${scoreColor};background:${scoreColor}1a">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ${item.score}
        </span>
        ${item.domain ? `<span class="news-sep">·</span><span class="news-domain">${item.domain}</span>` : ''}
        <span class="news-sep">·</span>
        <span class="news-time">${newsTimeAgo(item.time)}</span>
        ${item.comments ? `<span class="news-comments">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          ${item.comments}
        </span>` : ''}
      </div>`;
    feed.appendChild(a);
  });
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
    else if (tab === 'releases') items = await fetchReleasesNews();
    else if (tab === 'security') items = await fetchSecurityNews();
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
let ytPausedPosition = 0; // seconds elapsed when paused; used to resume from correct position

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
  // Reveal player, hide empty state, show the tab button
  document.getElementById('yt-np-empty')?.classList.add('hidden');
  document.getElementById('yt-np-player')?.classList.remove('hidden');
  document.getElementById('yt-tab-nowplaying')?.classList.remove('hidden');
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
  const elapsedReset = document.getElementById('yt-elapsed');
  if (elapsedReset) elapsedReset.textContent = startSec > 0 ? `${Math.floor(startSec / 60)}:${String(Math.floor(startSec % 60)).padStart(2, '0')}` : '0:00';
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
      ytPausedPosition = Math.max(0, (Date.now() - ytPlayStartedAt) / 1000);
      updatePausePlayUI();
      void getYtPlayState().then(s => { if (s) void saveYtPlayState({ ...s, isPaused: true, pausedPosition: ytPausedPosition }); });
    } else if (data.info === 1) {
      ytIsPaused = false;
      ytPlayStartedAt = Date.now() - ytPausedPosition * 1000;
      ytPausedPosition = 0;
      updatePausePlayUI();
      void getYtPlayState().then(s => {
        if (s) void saveYtPlayState({ ...s, isPaused: false, pausedPosition: 0, startedAt: ytPlayStartedAt });
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
  const canvas      = document.getElementById('yt-visualizer')   as HTMLCanvasElement;
  const ytGrid      = document.getElementById('yt-grid')         as HTMLElement;
  const elapsedEl   = document.getElementById('yt-elapsed')      as HTMLElement;

  // Elapsed time ticker
  function fmtTime(sec: number): string {
    const s = Math.floor(Math.max(0, sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  setInterval(() => {
    if (!activeYtId || ytIsPaused || !elapsedEl) return;
    elapsedEl.textContent = fmtTime((Date.now() - ytPlayStartedAt) / 1000);
  }, 1000);

  // Seek helpers using YouTube iframe postMessage API
  function ytSeekBy(deltaSec: number) {
    if (!activeYtIframe || !activeYtId) return;
    // Guard: iframe not yet loaded (e.g. restored paused state) — origin mismatch would occur
    if (!activeYtIframe.src.includes('youtube-nocookie.com')) return;
    const current = ytIsPaused
      ? ytPausedPosition
      : Math.max(0, (Date.now() - ytPlayStartedAt) / 1000);
    const newPos = Math.max(0, current + deltaSec);
    activeYtIframe.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [newPos, true] }),
      '*'
    );
    if (!ytIsPaused) {
      ytPlayStartedAt = Date.now() - newPos * 1000;
      if (elapsedEl) elapsedEl.textContent = fmtTime(newPos);
    }
  }
  document.getElementById('yt-seek-back')?.addEventListener('click', () => ytSeekBy(-15));
  document.getElementById('yt-seek-fwd')?.addEventListener('click',  () => ytSeekBy(+15));

  // "Browse Library" button in empty state
  document.querySelector<HTMLButtonElement>('.yt-np-empty-btn')?.addEventListener('click', () => {
    switchYtPane('library');
  });

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
      void getYtPlayState().then(s => { if (s) void saveYtPlayState({ ...s, isPaused: true, pausedPosition: ytPausedPosition }); });
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
          playPomoChime(pomoMode === 'focus');
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
  (document.getElementById('set-finnhub-key') as HTMLInputElement).value = settings.finnhubKey ?? '';
  (document.getElementById('set-market-stocks') as HTMLInputElement).value = (settings.marketWatchlistStocks ?? []).join(', ');
  (document.getElementById('set-market-crypto') as HTMLInputElement).value = (settings.marketWatchlistCrypto ?? []).join(', ');
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
      finnhubKey: (document.getElementById('set-finnhub-key') as HTMLInputElement).value.trim(),
      marketWatchlistStocks: (document.getElementById('set-market-stocks') as HTMLInputElement).value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
      marketWatchlistCrypto: (document.getElementById('set-market-crypto') as HTMLInputElement).value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
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
  initNews();
  initMarkets(settings);
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
