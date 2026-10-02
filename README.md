# Orbit Weather

One forecast, one truth: rain, temperature and feels-like, UV, air quality,
10 days, sun and moon, for where you are. A home-screen web app (PWA).

Live: https://jaypengx.github.io/Orbit-Weather/

Behind the one answer, the proxy (`Shared-Proxy`'s `weather.js`, route
`/weather`) blends several forecasts (Google Weather, CWA 中央氣象署,
MOENV 環境部) and real station measurements. The app never shows sources
or second opinions; the plan is `Shared-Proxy/docs/WEATHER-PLAN.md`.

Always dark: the sky follows the weather and the sun in deep tones.

## Notices (🔔)

A morning brief at the chosen time (one line: rain, high / low, UV window,
air, what to wear) and a rain alert (once a day, 07:00–21:00, when the next
2 hours reach 60%), for where the app was last opened. No sign-in: the
device has a random id the proxy keeps its list under. On an iPhone, only
from the home-screen app (iOS 16.4+).

## Location, without depending on permission

1. The last forecast on the device shows at once.
2. Location already allowed: the device's coarse position (Wi-Fi / cell,
   about a second). Otherwise the proxy's estimate from the network (IP),
   which needs no permission, with a 「使用精確位置」 button that asks once.
3. Denied or wanted elsewhere: pick a township (📍 at the top).
4. The same ~1 km cell under 15 minutes old: no fetch.

## Files

| File | What |
| --- | --- |
| `public/index.html`, `app.css`, `app.mjs` | The page, its look (glass cards over a sky that follows the weather and the sun), the flow |
| `public/lib/api.mjs` | Proxy calls, location, the device's stored state |
| `public/lib/view.mjs` | The cards, as HTML from the forecast |
| `public/lib/chart.mjs` | The 48-hour curve (SVG) |
| `public/lib/format.mjs` | Labels, colours, icons (zh-TW) |
| `public/lib/sun.mjs` | Sunrise / sunset worked out on the page (when the forecast has none) |
| `public/lib/notify.mjs` | The morning brief and rain alert: device id, subscription, the next 7 days' notices |
| `public/sw.js` | Offline (the app's files cached; bump `VERSION` on every change), and showing notices |

## Develop

- `npm test` (Node 22, no dependencies).
- `npm start` serves `public/` on http://localhost:8080 (the proxy allows
  localhost).
- Push to `main` deploys (GitHub Actions → Pages; Settings → Pages → Source:
  **GitHub Actions**).
