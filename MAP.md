# Orbit Weather: the map

One forecast for where you are and the places you pin, to the township.
Signs in with the Orbit Pass (which keeps the pins); the shared kit draws
the frame and sends the notices.

Live: https://orbit.jaypengx.com/weather/

## How it works

- **One answer.** The proxy (`Orbit-Core/weather.js`, `/weather`) blends
  Google Weather, CWA 中央氣象署, MOENV 環境部 and real station readings, and
  learns which to trust (`weather-skill.js`). The app gets one value per
  thing and never names a source.
- **Opens at once** on the last forecast kept, then refreshes behind it.
  Location: a quick Wi-Fi/cell fix first, GPS after; the forecast is asked
  again only if GPS lands in another ~1 km cell. iOS is asked for the
  position unprompted once, never at every opening.
- **Orbit's own look** (Jay 2026-11-03; Orbit-Core DESIGN.md §11; `<html data-look="native">`):
  today's dark page and graphite cards; the sky stays in its card at the top.
  Its mark is the track: time, a scale or a day as one thin line, where you
  are now a lit dot on it (`lib/pages.mjs`).
- **Room to read** (Jay 2026-11-03: Weather looked dense and cheap beside the other apps): each part of 天氣 is named on the page in the kit's section head (每小時, 今日數據, 明天的建議 with a grey 全部, 10 天 with its 最高 / 最低 key), its card under it, 24 px between parts; text at the family's sizes, a touch under Money's rows (16 for names, 14 for the line under, the kit's section heads; Jay: the first step up felt too big); a reading is its name over its line, the value on the right, its track under; the hours 56 px a column; the ten days 52 px a day at least, scrolling sideways like the hours where they don't fit. A day sheet's read-out (the day's 全天 and an hour under the finger) is an even two-by-two: a label over its number over its line, every cell keeping its line so it holds its height; the air's level a small dot of its colour, the number in the text's colour.
- **Rain soon:** under the numbers, one line when a wet hour (50%+) starts within 2 hours of a dry one, or rain eases (`lib/soon.mjs`; only from numbers under 30 minutes old).
- **颱風:** only while CWA has a typhoon warning out, a panel under the head: the county's 停班停課 once 人事行政總處 lists it, else the chance for today (until 10:00) or tomorrow (1–99%, fitted to past decisions; it moves with each forecast), with the wind, rain and warning it rests on (the proxy's `dayOff`, `Orbit-Core/typhoon.js`).
- **地名暫時讀不到:** when the place name can't be read, the note sits under 目前位置 and goes once it comes in.
- **Fresh:** asked again once the numbers are 15 minutes old (on opening,
  coming back, a change of place or tab, and each minute while on screen).
- **Never stuck on 更新中:** a stalled request is dropped and asked again; the
  forecast is asked before the phone's fix and drawn before the place's name.
- **Every screen** (Jay 2026-10-31; Orbit-Core DESIGN.md §10): on a phone on
  its side, a tablet or a computer 天氣's head and hours run across and the
  owner's cards go into the kit's flow columns (`.q-flow` + `flowColumns`,
  the phone's order), 地點 two columns, a smaller head on a phone on its side;
  the app turns with the phone.
- **Two tabs, one place:** 天氣 (the place's name, which opens 地點; the sky
  card: the temperature big and thin, the sky's word, the high and low, 體感,
  the rain soon line, and the day's track: 我的行程's stops, each place with
  its time and weather, else the day's turns, rain coming or easing, the high
  or the night's low, the sun; the card opens today's sheet with 更多資訊;
  then every hour of the next day as one track whose dots rise and fall with
  the temperature, the sun's rising and setting among them, and the owner's
  cards in 版面's order: 今日數據 (降雨 / 紫外線 / 空氣 each opening its sheet of
  day tabs and graphs, 濕度, 風, 日出日落, 體感, 能見度, each on its own bar);
  建議 four and 全部; the ten days side by side, the highs as one warm line and the lows as
  one cool line on one scale (最高 / 最低 named in the head in their colours), the range shaded between, a day opening its sheet). A swipe goes to the place beside (`daySwipe`), from its top, the kit's one slide every time; the temperature's pop (`data-q-live`) is keyed by the place and its visit, so it pops only when it changes while that place is on screen, never on arriving (Jay 2026-11-05: it felt random). 地點: each
  place with its now and its day, 新增地點, 早晨天氣, 版面 (天氣's three cards put in order by their grips, kit `reorder`; each shown or not). `#tab=places`,
  `#pin=<id>` (an old `#tab=week` opens 天氣).
- **Nothing empty on a dry day** (Jay 2026-11-03: most days are dry): the rain
  reading's hourly track shows only when a chance of 30%+ comes in the next
  24 hours; else it is one line saying when rain comes next (the second day's
  hours, then the day after, never further (Jay 2026-11-03: past three days rain is a guess): 「週日可能下雨 40%」, 「三天內不太會下雨」,
  `nextRain`). The sun's reading is the strongest UV still to come today, after
  dark tomorrow's peak with its day (never a 0 on an empty bar). 地點 draws a
  place's twelve-hour rain track only where rain comes.
- **Pins:** a name, a place and days/hours; inside its hours the app opens
  on that pin. Saved on the Pass (`lib/pins.mjs`, payload `w1:`; one home pin, the
  newest). The Pass's copy is read again before a write whenever another
  device may have written (the kit's `pass-sync.mjs`), and a copy that can't be
  read is never written over.
- **我的行程** (`lib/plan.mjs`): each hour is the forecast of where you'll
  be then (from the pins; the phone's real position wins). A school pin is
  off on Taiwan's holidays. Under the hours and the ten days, one rail of
  places (`.ot-where`): a stretch a place end to end (a sunrise or sunset
  column belongs to its hour, so no gap), a ring where you move, each name
  held at the left edge while its stretch is in view.
- **Notices** (the kit's): the morning brief at the set time, and the rain
  watch 07:00–21:00.
- **Offline:** opens on the last forecast with the kit's 沒有網路連線 capsule.

## Decisions in force

- **Abroad** (2026-11-06): Google alone in the place's own time zone (the proxy); the name is OpenStreetMap's city and country in the page's language (`/weather/where&lang=`, `weather.js whereIs`). Still metric only; the pin picker lists Taiwan's townships.

- The line, the graph and the 10-day row read the same hours: one number
  means one thing everywhere. Today's rain chance and advice count only
  the hours still ahead (`dayPop`).
- A day's sheet always has its graph (Jay 2026-11-01): today's is the whole
  day, the hours gone by kept (`past`: the proxy's from its last answer, the
  device's from its last copy) and faded, now marked; with too few kept late
  in the evening it runs on to 06:00 tomorrow (`sheetHours`). High and low
  are marked only on most of a day.
- No source named on screen; a test fails if one reaches it.
- An old forecast is never read as now: faded, 更新中, hidden past 6 hours.
- Weather draws its own pictures; a test fails if an emoji reaches the page.
  The pictures (`lib/icons.mjs`, Jay 2026-11-03: the glossy ones read as emoji) are
  Orbit's own flat drawings: a cloud is a line in the text's colour, the sun a lit disc
  ringed by dots, the moon a flat crescent, rain lines, drizzle dots; sunrise and sunset
  (`sunArt`) a half sun on the horizon with an arrow. No gradient, shadow or fixed colour
  in the drawing (a test checks): colours are `--wxi-*` in weather.css, deeper on a light
  card, the dark set on the sky.
- Light and dark (the kit's tokens); the sky stays a sky in both (sheets follow the theme). No warning banner.
- No sentence over the hours: the sky card's track and the readings say it (a test fails on one).
- English screens through `W(zh, en)`; place names stay Chinese.

## Files

| File | What |
| --- | --- |
| `public/app.mjs`, `index.html`, `weather.css` | The page and its flow: session, location, pages, pins, sheets |
| `public/lib/api.mjs` | The proxy, the device's position, this device's copies |
| `public/lib/pages.mjs` | 天氣 (the sky card and its track, the hours, the readings, the advice, the ten days) and 地點 (each place, its rain track where rain comes, the settings) |
| `public/lib/cards.mjs` | The sheets 天氣 opens (a day, a metric, the advice, 更多資訊), the day off, and the rules the pages share (the sky, a place's name, a day's rain chance, the advice in order) |
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
refuses the position). A push to `main` tests, stamps versions and deploys to Cloudflare.

## If you change…

| This | Also check |
| --- | --- |
| A field the page reads | `Orbit-Core/weather.js` and its fixtures |
| What a graph or row shows | Every place reading the same hours |
| A notice | The kit's `weather:*` kinds and `push.js` `weatherCheck` |
| The pins' shape (`w1:`) | Older copies, `plan.mjs`, each notice's place |
