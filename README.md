# Orbit Weather

One forecast, one truth, for where you are and the places you pin. A Quadra
app (a related add-on, like Orbit Class): the Quadra Pass signs in and keeps
the pins; the shared kit draws the loading screen, keeps the app on the
newest version, gates phones to the home-screen app, and sends the notices.

Live: https://jaypengx.github.io/Orbit-Weather/

Behind the one answer, the proxy (`Shared-Proxy`'s `weather.js`, `/weather`)
blends several forecasts (Google Weather, CWA 中央氣象署, MOENV 環境部) and
real station measurements, and learns which to trust
(`weather-skill.js`). The app never names a source.

## A page, top to bottom

1. Where (the township, 鄉鎮市區, from the device's position), now, today's high
   and low with 體感 beside each, one sentence, when it was updated; a tap
   anywhere on it opens today. Under it, the next 24 hours every 3 hours (a
   column opens its day).

   **Opening, fast** (`boot` in `app.mjs`): on a phone that has opened it
   before, the last forecast is up at once (the loading screen gone) and the
   phone is asked where it is beside the sign-in, not after it; the kit's
   kept session token lets the forecast go out with them (each had waited on
   the one before: about 1.5 s more on a slow sign-in). A first opening waits
   for the sign-in, so no location prompt shows over it.
   iOS is asked where the phone is unprompted once (the kit's `mayLocate`,
   Transit's rule too): a phone that would ask again isn't asked at every
   opening, return or tick; the last place stands until 定位.

   **How the position is found, fast** (`locate` → `locateNow` in
   `app.mjs`): Wi-Fi's or the cell network's fix first (`getPosition` with
   `high: false`, 3 s at most, or the phone's own from the last two
   minutes), and the forecast is asked for it at once; GPS's fix follows
   (seconds outdoors, many more inside), and the page is asked again only
   when it lands in another ~1 km cell (`cellOf`). The township's name
   (`/weather/where`) is asked together with the forecast and drawn with it
   (`loadPage`'s `naming`), never before it. One locate at a time
   (`state.locating`). The proxy's quick answer (`more`) or an old copy it's
   still refreshing (`refreshing`) is asked again 1.2 s later
   (`MORE_FIRST_MS`), then every 2 s (`MORE_MS`), 7 times at most. The kit's `holidays.mjs` is fetched
   with the first files (a `modulepreload` in `index.html`), since
   `app.mjs` waits for it before its first screen.
2. 紫外線, 降雨機率, 空氣品質: a small card each; a tap opens its sheet,
   whose tabs are days (`RANGES`, `dayHours` in `cards.mjs`): 今天 (now to
   midnight; from 18:00 it's 今晚, on to 07:00, the night and the way out),
   明天 (all of it), then the days ahead as bars (rain and UV 10 天, air
   每天: now and its forecast days). UV's tabs are the daylight days ahead,
   named by their day. Air has its day tabs only where the forecast has
   its hours (`air.hourly`), else the days alone. A finger on a graph reads
   an hour (or a day) out.
   Every graph (these sheets' and a day's) has one frame (`chart` in
   `graph.mjs`): the plot `PLOT_W` wide, its scale in a gutter on the
   right, the labels kept inside the plot. UV is a line coloured by its
   level, its fill fading down; rain a bar an hour (the amount darker
   inside), and hours that stay dry (under 10%, no amount) show
   「不會下雨」 or 「最高 5%」 in the graph's place, at its height; the 10 days
   and the air a bar each. The air's level sits under its number.
3. 建議: umbrella, sunscreen, what to wear, mask, heat, the week.
4. 10 天預報: tap a day (or the top) for its sheet: the day's numbers, then
   temperature (feels-like dashed, the high and low marked), rain (a bar an
   hour, the amount darker; a dry day says 不會下雨 instead of a chart) and
   UV on the same hours, the scale in a gutter on the right
   (`dayCharts`); a finger on them reads each hour.
5. 更多資訊: wind, pressure, humidity, dew point, visibility, cloud, sun and
   moon, the nearest station's measurement, the place.

## Fresh

Asked again once the numbers are 15 minutes old (by when the proxy made
them, `f.at`): on opening, on coming back to the app, on a swipe, and every
minute's check while it's on screen. An old copy the proxy is still
refreshing is asked again 1.2 s later, then every 2 s (the proxy waits up
to 4 s for a refresh before answering with the old copy). The proxy matches its sources: Google
current every 15 minutes, its forecast every 30; stations and air hourly;
CWA's township forecast every 6 hours.

## Pins

Swipe the whole page (or tap a chip at the top) between 目前位置 and each
pinned place. A pin has a name, a place (the current location or a
township) and days and hours: opening the app inside them shows that pin,
any other time the current location. Saved on the Quadra Pass
(`lib/pins.mjs`, payload `w1:`), newest wins per pin.

## 我的行程

`lib/plan.mjs`: a page like any other, but each hour is the forecast of
the place you're in then.
- **Where you are when**: the pins say it (school on weekdays 07–17…), and
  home (a pin marked so, else the device's place) the rest of the time.
- **The phone wins**: while the device says you're somewhere else
  (`live.until`), that place is taken instead. A plan says where you
  usually are; the phone says where you are.
- **Drawing**: `routeForecast` stitches the places' forecasts into one, in
  the same shape, so the same cards draw it.
- **Holidays** (the kit's `holidays.mjs`, read before the first screen): a
  school pin is off on Taiwan's days off, so there is no 到學校 advice.

## One number, one meaning

The line, the graph and the 10-day row read the same hours (TRUTH §14,
Weather). The proxy gives one value per quantity, the blend, and never
which source said what. That is kept only in the cell's KV entry for the
scoring, which moves the blend's weights (Shared-Proxy README §3.2).

## Notices

The kit's (switches in the account sheet: 早晨天氣, 降雨提醒). The brief at
the time set in ⚙︎, for the pin whose hours hold it (else where the app was
last); the rain watch 07:00–21:00 each day, split by the pins' hours.

## Files

| File | What |
| --- | --- |
| `public/index.html`, `weather.css`, `app.mjs` | The page (the kit's frame, always dark), its look, the flow: session, location, pages, pins, sheets |
| `public/lib/api.mjs` | The proxy (signed in), the device's position, this device's copies |
| `public/lib/cards.mjs` | A page's sections, as HTML |
| `public/lib/graph.mjs` | The graphs (SVG): UV, rain, air, a day's |
| `public/lib/pins.mjs` | Pins: hours, the pass's copy, where each notice is for |
| `public/lib/plan.mjs` | 我的行程: where you are each hour, the forecasts stitched |
| `public/lib/format.mjs`, `sun.mjs` | Labels and colours; sunrise / sunset worked out |
| `public/lib/icons.mjs` | The app's own pictures (no emoji): weather by kind, line glyphs, the moon |
| `#kit/quadra.mjs` (the page's `kit:head`, `kit:boot`) | The kit, loaded from Shared-Proxy's Pages (`Shared-Proxy/kit/loader.html`) |
| `public/sw.js` | Offline, like the other Quadra apps; shows notices |

## Where the data comes from

All of it comes from `/weather` on Shared-Proxy's `orbit-workers-proxy`
(`weather.js`), signed in with the pass, 30 a minute a session:

| Read | What |
| --- | --- |
| `GET /weather?lat=&lon=` (`?auto=1` by IP until the position is known) | The blended forecast for the ~1 km cell: hourly and daily for 10 days, now, air, UV, the nearest station's measurement, `at` (when made), `partial` (a source missing) |
| `GET /weather/where` | The township (縣市 / 鄉鎮市區), NLSC's point query |
| `GET /weather/places` | Every township, for the pin picker |

The Worker keeps each cell 15 minutes in KV, answers one under 3 hours at
once while it refreshes, and stays inside Google's daily budget. A source
that fails is covered by its last good copy (under 6 hours).

The app keeps this device's copies (`api.mjs`) and opens on them at once,
then refreshes behind (§Fresh). Weather has no dev door: tests and the
preview tool use the saved fixtures (`weather.js`'s `?sample=`).

## Develop, test, deploy

```bash
npm test
```

```bash
node ../Shared-Proxy/tools/preview.mjs weather --webkit
```

- **Tests**: `npm test` (Node 22, no dependencies), `tests/app.test.mjs`.
- **The preview tool**: Taipei 101 by default, the forecast from
  `weather.js` on the saved fixtures (`--no-geo` refuses the position;
  `--store`, `--click`, `--eval`).
- **Deploy**: a push to `main` runs the tests, stamps versions
  (`scripts/stamp-version.mjs`) and deploys to Pages; the kit puts a new
  deploy in place at once.

## What depends on what

| If you change… | Also check |
| --- | --- |
| A field the page reads | Shared-Proxy's `weather.js` (the answer's shape) and its tests' fixtures |
| What a graph or the 10-day row shows | Every place that reads the same hours (one number, one meaning) |
| A notice | The kit's `weather:brief` / `weather:rain` kinds and the Worker's `weather` check in `push.js` (`weatherCheck`) |
| Pins' shape (`w1:`) | Older copies opening; `plan.mjs`'s routing; each notice's place |
