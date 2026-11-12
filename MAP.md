# Orbit Weather: the map

One forecast for where you are and the places you pin, to the township. Signs
in with the Orbit Pass (which keeps the pins); the kit draws the frame and
sends the notices. Live: https://orbit.jaypengx.com/weather/

## Rules

Jay's, dated (Taiwan day), newest wins; the family's are in Orbit-Core `docs/RULEBOOK.md`.

- 10-22 Graphs: rain bars by amount, the readout in the title line, no hint boxes, a graph never drags the sheet.
- 10-22 Typhoon day off: one number per county, the % the only indicator (no accuracy shown), the official word wins; hidden under 5%.
- 11-01 A day's sheet always has its graph: today's is the whole day, the hours gone by kept and faded, now marked (`sheetHours`, `past`).
- 11-03 Room to read: each part of 天氣 named in the kit's section head, 24 between parts, text at the family's sizes (a touch under Money's rows).
- 11-03 Nothing empty on a dry day: the rain track only when 30%+ comes within 24 hours, else one line saying when rain comes next (never past three days: `nextRain`); the sun's reading is the strongest UV still to come.
- 11-03 Weather draws its own flat pictures (`lib/icons.mjs`): no emoji, gradient, shadow or fixed colour in a drawing (tests check).
- 11-05 The temperature's pop fires only when it changes while that place is on screen, never on arriving.
- 11-06 搜尋地點 opens any township's whole 天氣 in a sheet, kept only on 加入 (one tap).
- 11-10 Rain coming is said so anyone gets it: how hard in words (毛毛雨 … 豪大雨, kit `rain-now.mjs`), never millimetres; when it starts and stops as clock times; what to do; how far it reaches (~1.5 km). Only rain the radar really sees, tracked as it moves, never CWA's hour-sum alone. The sky card, the hours, 降雨 and the notice say the same (`radarSay`, `radarHours`).
- 11-10 問天氣 is code first: a question is read and answered by code from the forecast as one drawn row; only a place the townships don't have goes to AI, on a tap.
- 11-10 With Orbit Class: a place can follow Class's timetable (40 minutes before the first class to 20 after the last on school days); nothing is sent, the two apps share the phone's notebook.
- One number means one thing everywhere: the line, the graph and the 10 days read the same hours; today's rain chance and advice count only the hours ahead (`dayPop`).
- No source named on screen (a test checks); no sentence over the hours (a test checks); no warning banner. An old forecast is never read as now: faded, 更新中, hidden past 6 hours.
- Light and dark from the kit's tokens; the sky stays in its card at the top in both. English through `W(zh, en)`; place names in English by the kit's `place()` (RULEBOOK 10-27), a pin's own name as typed. Abroad (11-06): Google alone in the place's time zone, OpenStreetMap's name; metric only.

## How it works

- **One answer.** The proxy (Orbit-Core `weather.js`, `/weather?lat=&lon=`) blends Google Weather, CWA, MOENV and real stations for a ~1 km cell, learning whom to trust (`weather-skill.js`); the app gets one value per thing. `/weather/where` names the township, `/weather/places` lists them all.
- **Opens at once** on the last forecast kept and refreshes behind it, asked again once 15 minutes old (opening, coming back, a change of place or tab, each minute on screen). A stalled request is dropped and asked again; the forecast is drawn before the place's name. Location: a quick fix first, GPS after; asked again only if GPS lands in another cell.
- **Rain soon:** the radar first (the proxy's `radar`, Orbit-Core `weather-radar.js`, read by the kit's `rain-now.mjs`) as a panel on the sky card (`cards.mjs radarPanel`); without it, `lib/soon.mjs` (a wet hour within 2 hours of a dry one). The notice is Orbit-Core `weather.js radarNotice`.
- **颱風:** only while CWA has a warning out: the county's 停班停課 once listed, else a fitted chance (the proxy's `dayOff`, Orbit-Core `typhoon.js`).
- **Two tabs:** 天氣 (the sky card and its day track, every hour of the next day, the owner's cards in 版面's order, ten days; a swipe goes to the next place, `daySwipe`) and 地點 (search, each place, 早晨天氣, 版面 put in order with the kit's `reorder`). `#tab=places`, `#pin=<id>`.
- **Pins** (`lib/pins.mjs`, payload `w1:`, one home pin) are saved on the Pass through the kit's `pass-sync.mjs`. **我的行程** (`lib/plan.mjs`): each hour is the forecast of where you'll be (pins; the phone's real position wins); a place can follow Class's timetable (`useClassHours`, `useClasses`). The family's notebook gets the places (`tellPlaces`), the day's lines (`tellToday`) and where rain is due (`wetSpans`, `weather.rain`, for Transit's 下雨改搭車).
- **Every screen:** on wide screens 天氣's head and hours run across and the cards go into the kit's flow columns; 地點 two columns.
- **Notices** (the kit's): the morning brief at the set time (the school's on a school day, 帶傘提醒) and the rain watch 07:00–21:00. **Offline:** the last forecast with the kit's capsule.

## Files

| File | What |
| --- | --- |
| `public/app.mjs`, `index.html`, `weather.css` | The page and its flow: session, location, pages, pins, sheets |
| `public/lib/api.mjs` | The proxy, the device's position, this device's copies |
| `public/lib/pages.mjs` | 天氣 (the sky card and its track, the hours, the readings, the advice, the ten days) and 地點 (each place, its rain track where rain comes, the settings) |
| `public/lib/cards.mjs` | The sheets 天氣 opens (a day, a metric, the advice, 更多資訊), the day off, and the rules the pages share (the sky, a place's name, a day's rain chance, the advice in order) |
| `public/lib/graph.mjs` | Every graph (one frame: `chart`) |
| `public/lib/pins.mjs`, `plan.mjs`, `soon.mjs` | Pins; 我的行程; the rain-soon heads-up, and where rain is due (`wetSpans`, the family's `weather.rain` for Transit's 下雨改搭車) |
| `public/lib/ask.mjs` | 問天氣: a question read into a day, a place and what's asked, answered from the forecast |
| `public/lib/format.mjs`, `sun.mjs`, `icons.mjs` | Labels and colours (rain levels, what to wear, AQI names, stale text: one rule each); sunrise/sunset; the app's own pictures |
| `public/lib/advice-en.mjs` | English (words from the kit's `lang.mjs`); the proxy's advice turned over |
| `public/lib/testing.mjs` | The 測試工具's Weather switches (kit `testtools.mjs`, unlocked on the Pass): `typhoon` (official/chance), `radar` (soon/now), `airBad`, `extreme` (heat/cold), `forecastFail`; applied in `forecastOf`/`loadPage` to what's drawn only |
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
refuses the position). A push to `main` tests, stamps versions and deploys to Cloudflare.

## If you change…

| This | Also check |
| --- | --- |
| A field the page reads | `Orbit-Core/weather.js` and its fixtures |
| What a graph or row shows | Every place reading the same hours |
| A notice | The kit's `weather:*` kinds and `push.js` `weatherCheck` |
| The pins' shape (`w1:`) | Older copies, `plan.mjs`, each notice's place |
