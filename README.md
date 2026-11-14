<p align="center">
  <img src="public/icons/icon-192.png" width="96" height="96" alt="">
</p>

<h1 align="center">Orbit Weather</h1>

<p align="center">
  <b>One clear forecast.</b><br>
  <a href="https://orbit.jaypengx.com/app/"><b>Use it in Orbit</b></a> · on its own at <a href="https://orbit.jaypengx.com/weather/">orbit.jaypengx.com/weather</a>
</p>

<p align="center">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES_modules-F7DF1E?logo=javascript&logoColor=000"> <img alt="PWA" src="https://img.shields.io/badge/PWA-works_offline-5A0FC8?logo=pwa&logoColor=fff"> <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=fff"> <img alt="Tests" src="https://img.shields.io/badge/Tests-node_--test-339933?logo=nodedotjs&logoColor=fff">
</p>

One forecast for where you are and the places you pin, down to the township. Part of **Orbit**, a family of apps for life in Taiwan that share one sign-in, the Orbit Pass.

> **Best in Orbit.** Add [Orbit](https://orbit.jaypengx.com/app/) to your home screen: every Orbit app in one, signed in once, switching between them without reloading. Orbit Weather also works on its own at [orbit.jaypengx.com/weather](https://orbit.jaypengx.com/weather/) if it's the only one you want.

<p align="center">
  <img src="docs/screenshots/weather-1.webp" width="30%" alt="Your township's weather, in one look">
  <img src="docs/screenshots/weather-2.webp" width="30%" alt="Which of the next ten days it rains">
  <img src="docs/screenshots/weather-3.webp" width="30%" alt="Every hour's temperature and rain">
</p>

<p align="center">
  <img src="docs/screenshots/weather-4.webp" width="30%" alt="What to wear, umbrella or not">
  <img src="docs/screenshots/weather-5.webp" width="30%" alt="Air quality, hour by hour">
</p>

<details>
<summary>中文畫面</summary>

<p align="center">
  <img src="docs/screenshots/weather-1.zh.webp" width="30%" alt="你所在的鄉鎮，天氣一眼看完">
  <img src="docs/screenshots/weather-2.zh.webp" width="30%" alt="未來十天，哪天會下雨">
  <img src="docs/screenshots/weather-3.zh.webp" width="30%" alt="每小時的溫度與降雨">
</p>

<p align="center">
  <img src="docs/screenshots/weather-4.zh.webp" width="30%" alt="穿什麼、帶不帶傘，直接說">
  <img src="docs/screenshots/weather-5.zh.webp" width="30%" alt="空氣品質，每小時都看得到">
</p>

</details>

## Features

- **問天氣:** ask in the search (明天竹北會下雨嗎) and code answers from the forecast, drawn as the day's sky, the verdict, low–high and chips; only a place code can't find goes to AI. A shower the radar tracks is a panel on the sky card saying when and where.
- **With the family:** rain due at your places is told to Orbit Transit (下雨改搭車); a place that follows your timetable times its umbrella notices by Orbit Class's hours, with 體育課 rain or heat in its advice.
- **One answer:** Google Weather, CWA 中央氣象署, MOENV 環境部 and real station readings blended into one value per thing; the app never names a source.
- **Today:** the sky now, the next 24 hours and what to wear or bring.
- **Forecast:** rain, UV and air quality, each with day tabs and graphs, humidity, wind, and 10 days ahead.
- **Rain soon:** one line when rain starts or eases, the next hour read from CWA's radar; the first hours start from the nearest station's real reading.
- **Your day (我的行程):** each hour shows the forecast for where you'll be then, from your pinned places.
- **Typhoon days:** while a warning is out, the county's 停班停課 decision, or the chance of a day off fitted to past decisions.
- **Notices:** the morning brief at your time, and a rain watch from 07:00 to 21:00.
- **Opens at once** on the last forecast kept, then refreshes behind it; a slow request is dropped and asked again, so it never sits on 更新中.
- **Every screen, either way up:** on a phone on its side, a tablet or a computer each tab is two columns (the sky, hours and days beside the details, advice and places), the indicators as a grid.

## Tech stack

| Layer | What |
| --- | --- |
| App | Plain JavaScript (ES modules), HTML and CSS; no framework, no build step, no dependencies |
| Platform | Installable web app with a service worker; works offline on the last forecast |
| Shared | Look, Orbit Pass (which keeps the pins), notices from the kit in [Orbit-Core](https://github.com/JayPengX/Orbit-Core) |
| Data | The proxy's `/weather` (Cloudflare Workers): Google Weather + CWA + MOENV + stations, blended and kept 15 minutes per ~1 km cell in KV; it learns which source to trust |
| Graphics | The app draws its own icons and graphs; no emoji (a test checks) |
| Tests | `node --test` |

## How it works

```
phone position (Wi-Fi fix, then GPS)
   ▼
GET api.jaypengx.com/weather?lat=&lon=   ── Google · CWA · MOENV · stations
   ▼                                        blended per ~1 km cell (weather.js, weather-skill.js)
one value per thing ─► 今天 · 預報 · 地點
```

- **One number means one thing everywhere:** the line, the graph and the 10-day row read the same hours.
- **Fresh, never stale as now:** asked again once 15 minutes old; an older forecast is faded and hidden after 6 hours.
- **Pins** carry days and hours, so the app opens on school during school hours.

Details and the decisions still in force: **[MAP.md](MAP.md)**.

## Project structure

```
public/
├── index.html, app.mjs, weather.css   the page and its flow
├── lib/
│   ├── api.mjs          the proxy, the position, this device's copies
│   ├── cards.mjs        the three tabs and their sheets
│   ├── graph.mjs        every graph
│   ├── pins.mjs, plan.mjs, soon.mjs   pins, 我的行程, rain soon
│   ├── format.mjs, sun.mjs, icons.mjs labels and colours, sunrise, pictures
│   └── advice-en.mjs    English
└── sw.js
tests/                   node --test (with saved forecasts)
MAP.md                   how it works
```

## Getting started

The app loads the shared kit from a sibling folder, so clone this repo next to [Orbit-Core](https://github.com/JayPengX/Orbit-Core):

```bash
git clone https://github.com/JayPengX/Orbit-Core.git
git clone https://github.com/JayPengX/Orbit-Weather.git
cd Orbit-Weather
```

Requirements: Node.js 22 or newer. There is nothing to install: no framework, no `node_modules`.

```bash
npm test   # links ../Orbit-Core/kit as .kit, then runs node --test
```

See it on a phone-sized screen, signed in with a made-up wallet and real data (needs Playwright):

```bash
# a screenshot, saved in /tmp/orbit-preview
node ../Orbit-Core/tools/preview.mjs weather --live --width 375
# serve it, then open http://localhost:8123/Orbit-Weather/
node ../Orbit-Core/tools/preview.mjs weather --live --serve --port 8123
```

`--dark`, `--lang en`, `--webkit` (Safari's engine) and the other flags are listed in [Orbit-Core/tools/README.md](https://github.com/JayPengX/Orbit-Core/blob/main/tools/README.md).

Without `--live`, the preview uses saved forecasts for Taipei 101 (`--no-geo` refuses the position).

## Deploying

Push to `main`. GitHub Actions runs the tests, stamps every file with its content hash (so a phone downloads only what changed) and publishes `public/` to Cloudflare at its orbit.jaypengx.com address (Orbit-Core `deploy/cf-site.mjs`). There are no pull requests or release branches.

## Part of Orbit

Every app below is in **[Orbit](https://orbit.jaypengx.com/app/)**, one home-screen app for them all; each also works on its own.

| App | What it is |
| --- | --- |
| [Orbit Sports](https://github.com/JayPengX/Orbit-Sports) | Every game you can watch in Taiwan, live |
| [Orbit Transit](https://github.com/JayPengX/Orbit-Transit) | Bus, train, metro and YouBike, planned and navigated |
| [Orbit Weather](https://github.com/JayPengX/Orbit-Weather) | One clear forecast, to the township |
| [Orbit Words](https://github.com/JayPengX/Orbit-Words) | English vocabulary that stays |
| [Orbit Securities](https://github.com/JayPengX/Orbit-Securities) | A Taiwan broker on play money |
| [Orbit Class](https://github.com/JayPengX/Orbit-Class) | Today's classes at a glance |
| [Orbit Beats](https://github.com/JayPengX/Orbit-Beats) | Endless music and your own beats |
| [Orbit Law](https://github.com/JayPengX/Orbit-Law) | Laws, rulings and bills, linked |
| [Orbit Money](https://github.com/JayPengX/Orbit-Money) | Your own books |
| [Orbit-Core](https://github.com/JayPengX/Orbit-Core) | The kit, the Orbit Pass and the Workers behind them all |

How it was all built, in pictures and numbers: [jaypengx.com/showcase](https://jaypengx.com/showcase/).
