# Features kept

Every feature a person uses in this app, with the code that makes it.
`tests/features.test.mjs` fails if any mark below disappears, so a refactor cannot
drop a feature silently (2026-11-03, after the lost-features audit).
To remove a feature on purpose, delete its line here in the same commit and say why.
- Graphs: rain bars by amount, UV, air, the day's temperature — `public/lib/graph.mjs`: `rainGraph`, `uvGraph`, `airGraph`, `dayCharts`
- Graphs drawn for a wide sheet's width — `public/app.mjs`, `public/lib/graph.mjs`: `chartWidth`, `fitCharts`
- A finger on a graph reads it out — `public/app.mjs`: `armScrub`
- A day's sheet with the family's day strip — `public/app.mjs`: `openDay`, `dayBar`
- A measure's own sheet — `public/app.mjs`: `openMetric`
- Typhoon 停班停課 per county — `public/lib/cards.mjs`: `停班停課`
- Places and 行程: 地點, each place with its now and its day, its next hours of rain where rain comes, 我的行程 first — `public/lib/pages.mjs`, `public/lib/cards.mjs`: `placesHtml`, `wx-place-row`, `ot-pr`, `我的行程`
- 搜尋地點: a place's whole 天氣 once in a sheet, nothing kept unless 加入 (one tap, named after its town); its name, home and hours are 編輯's, the hours only if wanted (Jay 2026-11-06) — `public/app.mjs`, `public/lib/pages.mjs`: `findSheet`, `lookAt`, `addLook`, `data-act="find"`, `固定時間在這裡`, `bare`
- 問天氣: a question in 搜尋地點 (明天竹北會下雨嗎) answered in one row from Orbit's forecast by code; a place not among the townships found by AI on a tap (Jay 2026-11-10) — `public/lib/ask.mjs`: `readAsk`, `answerOf`; `public/app.mjs`: `answerAsk`, `askAi`, `data-ask-ai`; Orbit-Core `weather-ask`
- 下雨改搭車's half: where rain is due in the next 12 hours at each place (the radar's shower, then hours at 50%+), told to the family's notebook for Transit's trips (Jay 2026-11-10) — `public/lib/soon.mjs`, `public/app.mjs`: `wetSpans`, `tellRain`, `weather.rain`
- 版面 (what shows, in its order on 天氣) — `public/app.mjs`, `public/lib/pages.mjs`: `版面`, `shownCards`
- 天氣: today and the days ahead on one page (the hours, the readings, the advice, the ten days) — `public/lib/pages.mjs`: `nowHtml`, `readings`, `advice`, `days`
- The sky in its card at the top: now, the high and low, the day's stops or turns on one track — `public/lib/pages.mjs`, `public/weather.css`: `ot-hero`, `skyClass`, `ot-day`
- A swipe goes to the place beside, the title says which and opens 地點 — `public/app.mjs`, `public/lib/pages.mjs`: `daySwipe`, `data-act="places"`
- 我的行程's ten days say where you'll be each day, a stretch of days a place (the hours' rail) — `public/lib/pages.mjs`: `ot-where is-days`
- 我的行程's radar shower: each 5 minutes from the radar of where you'll be then, as on a city's page (Jay 2026-11-14) — `public/lib/plan.mjs`: `routeRadar`
- A dry day's rain is one line saying when rain comes next (never an empty track); the sun's row is the day's peak still to come, after dark tomorrow's — `public/lib/pages.mjs`: `nextRain`, `is-dry`, `uvDay`
- 早晨天氣 time and 版面 in 地點 — `public/lib/pages.mjs`: `brief-time`, `data-act="layout"`
- 定位 asks where the phone is; an old copy says so — `public/lib/pages.mjs`: `data-locate`, `wx-stale`
