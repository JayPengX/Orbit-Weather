# Orbit Weather: the map

One forecast for where you are and the places you pin, to the township.
Signs in with the Orbit Pass (which keeps the pins); the shared kit draws
the frame and sends the notices.

Live: https://jaypengx.com/weather/

## How it works

- **One answer.** The proxy (`Orbit-Core/weather.js`, `/weather`) blends
  Google Weather, CWA 中央氣象署, MOENV 環境部 and real station readings, and
  learns which to trust (`weather-skill.js`). The app gets one value per
  thing and never names a source.
- **Opens at once** on the last forecast kept, then refreshes behind it.
  Location: a quick Wi-Fi/cell fix first, GPS after; the forecast is asked
  again only if GPS lands in another ~1 km cell. iOS is asked for the
  position unprompted once, never at every opening.
- **Rain soon:** under the numbers, one line when a wet hour (50%+) starts within 2 hours of a dry one, or rain eases (`lib/soon.mjs`; only from numbers under 30 minutes old).
- **颱風:** only while CWA has a typhoon warning out, a row under the sky: the county's 停班停課 once 人事行政總處 lists it, else the chance for today (until 10:00) or tomorrow (1–99%, fitted to past decisions; it moves with each forecast), with the wind, rain and warning it rests on (the proxy's `dayOff`, `Orbit-Core/typhoon.js`).
- **地名暫時讀不到:** when the place name can't be read, the note sits under 目前位置 and goes once it comes in.
- **Fresh:** asked again once the numbers are 15 minutes old (on opening,
  coming back, a change of place or tab, and each minute while on screen).
- **Three tabs, one place:** 今天 (the date over the place, the sky card
  opening today's sheet with 更多資訊, the next 24 hours, 建議 with 全部);
  預報 (指標: 降雨 / 紫外線 / 空氣 each open a sheet of day tabs and graphs,
  濕度, 風; then 10 天預報, a day opens its sheet); 地點 (the places, 新增地點,
  早晨天氣, 版面). The title on 今天 opens 地點. `#tab=week|places`, `#pin=<id>`.
- **Pins:** a name, a place and days/hours; inside its hours the app opens
  on that pin. Saved on the Pass (`lib/pins.mjs`, payload `w1:`; one home pin, the
  newest). The Pass's copy is read again before a write whenever another
  device may have written (the kit's `pass-sync.mjs`), and a copy that can't be
  read is never written over.
- **我的行程** (`lib/plan.mjs`): each hour is the forecast of where you'll
  be then (from the pins; the phone's real position wins). A school pin is
  off on Taiwan's holidays.
- **Notices** (the kit's): the morning brief at the set time, and the rain
  watch 07:00–21:00.
- **Offline:** opens on the last forecast with the kit's 沒有網路連線 capsule.

## Decisions in force

- The line, the graph and the 10-day row read the same hours: one number
  means one thing everywhere. Today's rain chance and advice count only
  the hours still ahead (`dayPop`).
- No source named on screen; a test fails if one reaches it.
- An old forecast is never read as now: faded, 更新中, hidden past 6 hours.
- Weather draws its own pictures; a test fails if an emoji reaches the page.
- Light and dark (the kit's tokens); the sky hero stays a sky. No warning banner.
- English screens through `W(zh, en)`; place names stay Chinese.

## Files

| File | What |
| --- | --- |
| `public/app.mjs`, `index.html`, `weather.css` | The page and its flow: session, location, pages, pins, sheets |
| `public/lib/api.mjs` | The proxy, the device's position, this device's copies |
| `public/lib/cards.mjs` | The tabs (今天, 預報, 地點) and the sheets they open |
| `public/lib/graph.mjs` | Every graph (one frame: `chart`) |
| `public/lib/pins.mjs`, `plan.mjs`, `soon.mjs` | Pins; 我的行程; the rain-soon heads-up |
| `public/lib/format.mjs`, `sun.mjs`, `icons.mjs` | Labels and colours (rain levels, what to wear, AQI names, stale text: one rule each); sunrise/sunset; the app's own pictures |
| `public/lib/advice-en.mjs` | English (words from the kit's `lang.mjs`); the proxy's advice turned over |
| `public/sw.js` | Offline and notices |

The proxy's reads: `GET /weather?lat=&lon=` (the blend for a ~1 km cell,
kept 15 minutes in KV), `/weather/where` (the township), `/weather/places`
(every township, for the pin picker).

## Run and test

```bash
npm test
```

```bash
node ../Orbit-Core/tools/preview.mjs weather --live --width 375
```

Without `--live`, the preview uses saved fixtures (Taipei 101; `--no-geo`
refuses the position). A push to `main` tests, stamps versions and deploys to Pages.

## If you change…

| This | Also check |
| --- | --- |
| A field the page reads | `Orbit-Core/weather.js` and its fixtures |
| What a graph or row shows | Every place reading the same hours |
| A notice | The kit's `weather:*` kinds and `push.js` `weatherCheck` |
| The pins' shape (`w1:`) | Older copies, `plan.mjs`, each notice's place |
