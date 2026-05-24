# MonkTab — Developer New Tab

> A beautiful, privacy-first new tab page for developers and engineers.  
> Built by [DevOps-Monk](https://devops-monk.com) · Inspired by Momentum

![MonkTab Screenshot](https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80)

---

## Features

| Feature | Details |
|---|---|
| 🕐 **Clock & Greeting** | Live clock, personalised greeting by time of day |
| 🎯 **Daily Focus** | Set one goal for the day — persists until midnight |
| 🖼️ **Background Photo** | Beautiful daily landscape photo via Unsplash |
| 💬 **Daily Quote** | Inspirational quote, refreshes each day |
| 🌤️ **Weather** | Local temperature via Open-Meteo (no API key needed) |
| ✅ **To-do List** | Add, check off, and delete tasks — saved locally |
| 🔗 **Quick Links** | Pinned shortcuts with favicons (GitHub, AWS, etc.) |
| 🍅 **Pomodoro Timer** | 25/5 min focus/break timer, updates tab title |
| 🔍 **Search Bar** | Google, DuckDuckGo, or Bing — your choice |
| ⚙️ **Settings Panel** | Toggle every widget, set name, theme, search engine |
| 🌗 **Dark / Light / Auto** | Follows system preference or manual override |

**Privacy-first:** No account required. No data sold. Everything stored locally in `chrome.storage`.

---

## Install from Release

1. Go to [Releases](https://github.com/devops-monk/monkTab/releases/latest)
2. Download `monktab.zip`
3. Unzip it anywhere
4. Open `chrome://extensions` → Enable **Developer Mode** (top-right)
5. Click **Load unpacked** → select the unzipped folder
6. Open a new tab — MonkTab appears!

---

## Development

```bash
git clone https://github.com/devops-monk/monkTab.git
cd monkTab
npm install
npm run build       # production build → dist/
npm run dev         # watch mode
```

Load `dist/` as an unpacked extension in `chrome://extensions`.

### Tech Stack

- **Vite** + **TypeScript** — fast builds, type-safe
- **Tailwind CSS v4** — utility styling
- **vite-plugin-web-extension** — MV3 multi-entry build
- **Chrome Storage API** — all persistence, no backend
- **Open-Meteo** — weather, no API key needed
- **Unsplash** — daily backgrounds (optional API key for fresh photos)
- **Quotable API** — daily quotes with local fallbacks

### Project Structure

```
src/
├── newtab/          # Main new tab page (HTML + CSS + TS)
├── background/      # MV3 service worker
├── options/         # Options page
└── utils/
    ├── storage.ts   # chrome.storage helpers
    ├── weather.ts   # Open-Meteo wrapper
    ├── background.ts # Unsplash / fallback photos
    └── quotes.ts    # Quotable API + fallbacks
```

---

## Configuration

Open a new tab → click **⚙️** (top right):

- **Your name** — personalises the greeting
- **Search engine** — Google / DuckDuckGo / Bing
- **Theme** — Auto / Dark / Light
- **Widget toggles** — show/hide weather, quote, tasks, links, Pomodoro
- **Unsplash API key** — optional, for fresh daily photos (get free key at unsplash.com/developers)

---

## CI / CD

Every push to `main` automatically:
1. Installs dependencies
2. Builds the extension
3. Creates `monktab.zip`
4. Publishes it as the [latest GitHub release](https://github.com/devops-monk/monkTab/releases/latest)

---

## Roadmap

- [ ] GitHub activity widget (open PRs)
- [ ] Notes widget
- [ ] Vision board / custom backgrounds
- [ ] Bookmark import
- [ ] World clocks
- [ ] Countdowns
- [ ] Ask AI widget

---

## License

MIT — built with ❤️ by [DevOps-Monk](https://devops-monk.com)
