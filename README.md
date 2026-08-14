# MonkTab — Developer New Tab

> A privacy-first new tab page for developers and engineers.
> Built by [DevOps-Monk](https://devops-monk.com)

Everything renders on one page. No account, no backend, no analytics — your notes,
tasks, links and settings never leave the browser.

---

## Features

| Feature | What it does |
| --- | --- |
| 🕐 **Clock & greeting** | Live clock, personalised greeting, and one daily focus goal |
| ✅ **Tasks** | Subtasks, priorities, due dates, drag to reorder, a Today list, and quick-add tokens (`!high`, `@fri`, `~3`) |
| 🎯 **Focus mode** | Full-screen Pomodoro with long breaks, adjustable intervals, per-task round budgeting, a daily goal ring and 7-day stats |
| 📝 **Notes** | Two-pane markdown workspace with live preview, pinning and search |
| 🔗 **Quick links** | Folders, drag to reorder, grid or list, most-used sort, keyboard search, and a real Chrome bookmark import picker |
| 📈 **Stocks** | Watchlist with price and percent-move alerts, Reddit trending, buy signals, earnings calendar and per-ticker detail — powered by [StockMonk](https://stockmonk.devops-monk.com) |
| 📰 **News** | Ten curated feeds: HN, AI, dev, framework releases, security, CVEs, cloud, world |
| 🌤️ **Weather** | Hourly strip, air quality, UV, daylight arc and a 7-day forecast via Open-Meteo — no API key |
| 🌍 **World clocks** | Any IANA zone, with offsets, working-hours state and local weather |
| 🎧 **Soundscapes & music** | Bundled CC0 field recordings, synthesised noise and binaural tones, plus a YouTube audio player |
| ✦ **Ask AI** | 29 prompt templates, and one question sent to several assistants at once to compare |
| 🗂️ **Tab sessions** | Save and restore a whole window of tabs |
| ⏳ **Countdowns** | Days until the dates that matter |
| 🖼️ **Backgrounds** | A daily photo, a topic you choose, Bing's picture of the day, or your own images |
| ⚙️ **Settings** | Toggle every widget, pick a theme, tune focus timers |

---

## Privacy

- **No account and no backend.** MonkTab has no server of its own.
- **No analytics, no tracking, no ads.**
- Notes, tasks, links, sessions and settings stay in `chrome.storage` on your device.
- Outbound requests are read-only GETs for public content — weather, wallpapers,
  RSS feeds and stock data. Nothing you write is ever transmitted.
- Ask AI is a **launcher**: it opens the assistant's own site with your question in
  the URL. MonkTab never sends the prompt anywhere itself.

Every host the extension can reach is listed explicitly in `manifest.json` — no
wildcards, no `<all_urls>`. See [STORE-NOTES.md](STORE-NOTES.md) for the full
breakdown and per-permission justification.

---

## Install from Release

1. Go to [Releases](https://github.com/devops-monk/monkTab/releases/latest)
2. Download `monktab.zip` and unzip it anywhere
3. Open `chrome://extensions` → enable **Developer Mode** (top right)
4. Click **Load unpacked** → select the unzipped folder
5. Open a new tab

---

## Development

```bash
git clone https://github.com/devops-monk/monkTab.git
cd monkTab
npm install
npm run build       # production build → dist/
npm run dev         # watch mode
npx tsc --noEmit    # typecheck
```

Load `dist/` as an unpacked extension in `chrome://extensions`.

### Tech stack

- **Vite** + **TypeScript** — no runtime dependencies at all
- **Tailwind CSS v4** — imported alongside hand-written component CSS
- **vite-plugin-web-extension** — MV3 multi-entry build
- **Chrome Storage API** — all persistence, no backend

### External services

All keyless unless noted.

| Service | Used for |
| --- | --- |
| [Open-Meteo](https://open-meteo.com) | Weather, air quality, geocoding |
| [StockMonk](https://stockmonk.devops-monk.com) | Share prices, Reddit buzz, earnings, insider filings, technicals |
| [Wallhaven](https://wallhaven.cc) / Bing / Picsum | Backgrounds (Unsplash too, if you supply your own key) |
| Publisher RSS/Atom feeds | The News panel |
| YouTube (nocookie) | The music player |

### Project structure

```
sounds/                 # Bundled CC0 field recordings (see CREDITS-SOUNDS.md)
src/
├── newtab/             # The whole page — HTML + CSS + TS
├── background/         # MV3 service worker
├── options/            # Options page
└── utils/
    ├── storage.ts      # chrome.storage helpers and every stored type
    ├── weather.ts      # Open-Meteo wrapper
    ├── background.ts   # Wallhaven / Bing / Picsum / Unsplash wallpapers
    ├── soundscapes.ts  # Recorded loops with synthesised fallbacks
    ├── timezones.ts    # IANA zone table for the world clocks
    └── quotes.ts       # Local quote pool
```

---

## Soundscapes

Nature scenes play **real CC0 field recordings** bundled in `sounds/` — no streaming,
no network access, nothing to go offline. Each loop was trimmed to its most level-stable
passage, loudness-matched, and given a 3-second equal-power crossfade at the loop point,
so `loop = true` repeats seamlessly. Steady scenes (rain, wind, water) use 30-second
loops; eventful ones (birds, crickets, fire, storm) use 60 seconds, where repetition
would otherwise be noticeable.

Noise colours (white/brown/pink) and binaural tones stay **synthesised** — they are
defined mathematically, so a recording would only be a worse version of them. If a
recording ever fails to load, that scene falls back to its synth automatically.

Provenance and licensing for every clip is in [CREDITS-SOUNDS.md](CREDITS-SOUNDS.md).

---

## Configuration

Open a new tab → click **⚙️** (top right):

- **General** — your name, theme, export all data as JSON
- **Widgets** — show or hide any panel
- **Appearance** — background source: daily photo, a topic, Bing, or your own uploads
- **World clocks** — search any city or time zone
- **AI** — which assistants Ask AI opens, one or several
- **Stocks** — your watchlist and alerts (managed from the Stocks panel)
- **Focus mode** — focus/break/long-break lengths, rounds per set, daily goal,
  auto-start, background blur

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt` + `L` | Quick links |
| `Alt` + `N` | Notes |
| `Alt` + `W` | News |
| `Alt` + `M` | Music & soundscapes |
| `Alt` + `S` | Tab sessions |
| `Alt` + `P` | Focus timer |
| `Alt` + `,` | Settings |
| `Alt` + `?` | All shortcuts |

Inside focus mode, `Space` starts and pauses the timer and `Esc` leaves.
`Ctrl`/`Cmd` + `Alt` + `N` starts a new note.

---

## CI / CD

Every push to `main` automatically builds the extension, packages `monktab.zip`,
and publishes it as the [latest GitHub release](https://github.com/devops-monk/monkTab/releases/latest).

---

## License

MIT — built with ❤️ by [DevOps-Monk](https://devops-monk.com)
