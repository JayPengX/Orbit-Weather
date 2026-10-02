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

1. Where (to the village, 里, from the device's position), now, today's high
   and low with 體感 beside each, one sentence.
2. 紫外線, 降雨機率, 空氣品質: a card each with its graph, hourly for as far
   as the forecast goes (10 days; air: the last 48 hours measured, then the
   coming days' forecast), swiped sideways, the time and date under it, a
   tap reads an hour out.
3. 建議: umbrella, sunscreen, what to wear, mask, heat, the week.
4. 10 天預報: tap a day for its own graph, everything on one.
5. 更多資訊: wind, pressure, humidity, dew point, visibility, cloud, sun and
   moon, the nearest station's measurement, the place.

## Pins

Swipe the whole page (or tap a chip at the top) between 目前位置 and each
pinned place. A pin has a name, a place (the current location or a
township) and days and hours: opening the app inside them shows that pin,
any other time the current location. Saved on the Quadra Pass
(`lib/pins.mjs`, payload `w1:`), newest wins per pin.

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
| `public/lib/format.mjs`, `sun.mjs` | Labels and colours; sunrise / sunset worked out |
| `public/quadra.css`, `lib/quadra.mjs`, `boot.js` | The kit's (synced from `Shared-Proxy/kit`, never edited here) |
| `public/sw.js` | Offline, like the other Quadra apps; shows notices |

## Develop

- `npm test` (Node 22, no dependencies).
- See it signed in, with data: `node tools/preview.mjs weather` in
  Shared-Proxy (screenshots; `--store`, `--click`, `--eval`).
- Push to `main` deploys (tests, `scripts/stamp-version.mjs`, Pages).
