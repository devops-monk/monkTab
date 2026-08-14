# Chrome Web Store submission notes

Reference material for the listing form and for any reviewer follow-up. Nothing here
ships in the extension.

## Single purpose

MonkTab replaces the new tab page with a developer dashboard. Every feature (clock,
weather, notes, news, sessions, music, stocks) renders on that one page. There is no
background content script, no page injection, and no behaviour outside the new tab.

## Data handling

- **No account, no server.** MonkTab has no backend of its own.
- **No analytics, no tracking, no ads.**
- All user content (notes, tasks, links, sessions, settings) stays in
  `chrome.storage.local` on the device.
- Nothing the user writes is ever transmitted anywhere.
- Outbound requests are **read-only GETs for public content**: weather, background
  images, and public RSS/Atom feeds. No request carries user data beyond what the
  destination inherently sees (IP address, and for weather, the coordinates the user
  chose or approved).

The "handles sensitive user data" answer on the listing form is **no**; the data
disclosure section should be filled in as *does not collect* for every category.

## Permission justifications

| Permission | Why |
| --- | --- |
| `storage` | Persist notes, tasks, links, sessions and settings locally. |
| `geolocation` | Local weather, only after the user allows the browser prompt. Falls back to IP-based city lookup or a manually typed city. |
| `notifications` | Pomodoro timer and countdown alerts. |
| `bookmarks` | Read-only, to offer existing bookmarks when adding a quick link. |
| `declarativeNetRequest` | One static rule that sets the `Origin` header on requests to `youtube-nocookie.com` so the embedded player accepts IFrame API commands. It does not touch any other request. |
| `tabs` (**optional**) | Only requested when the user saves a tab session, because `chrome.tabs.query` omits `url`/`title` without it. Declined = the sessions feature is unavailable; nothing else changes. |

## Host permissions

Every host is listed explicitly — no wildcards, no `<all_urls>`. Each is a public,
read-only endpoint fetched from the new tab page:

- **Weather / location** — `api.open-meteo.com`, `geocoding-api.open-meteo.com`,
  `nominatim.openstreetmap.org`, `ipapi.co`
- **Backgrounds (random mode)** — `picsum.photos`, `fastly.picsum.photos`
- **Music player** — `youtube-nocookie.com`, `youtube.com`, `img.youtube.com`
- **Stocks** — `stockmonk.devops-monk.com`, a public read-only API operated by the
  same developer as this extension. It returns share prices, Reddit mention counts,
  earnings dates, SEC insider filings and technical indicators. No key, no account,
  and the only thing sent is the ticker being viewed. It replaced CoinGecko, Finnhub,
  Yahoo Finance and alternative.me in 1.12.0, all four of which were removed.
- **News feeds** — the publisher domains behind each News tab (Ars Technica, BBC,
  BleepingComputer, GitHub, Kubernetes, OpenAI, The Guardian, …). These are RSS/Atom
  URLs; the extension parses the XML and links out to the publisher.
- **Backgrounds (topic mode)** — `wallhaven.cc` (SFW-only search API), `www.bing.com`
  (picture of the day), `api.unsplash.com` / `images.unsplash.com` (only used when the
  user supplies their own Unsplash key)
- **Favicons** — `icons.duckduckgo.com`
- **Dev widgets** — `github.com`, `hn.algolia.com`, `dev.to`, `reddit.com`

If a reviewer pushes back on the size of the news host list, the fallback is to move
those entries to `optional_host_permissions` and request them on the first open of the
News panel (the panel toggle is a user gesture, so `chrome.permissions.request` is
allowed there). That trades a permission prompt for a shorter install-time list.

## Background image content

Topic-based backgrounds come from Wallhaven's public search API, always with
`purity=100` (SFW only) and `categories=100` (the "General" category, which excludes
the anime and people sections). Both filters are applied server-side, so a free-text
topic typed by the user cannot bypass them. Bing's picture of the day is editorially
curated. Users may also supply their own images by upload or https link.

Photo credit is displayed bottom-right and links back to the source, which satisfies
Unsplash's API attribution requirement when a user connects their own key.

## Screenshots / listing

Assets live in `store-assets/` and `store-screenshots/` (both untracked in git).
Screenshots must show the real UI with no mocked data.
