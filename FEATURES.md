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
- Places and 行程 — `public/lib/cards.mjs`: `我的地點`, `行程`
- 版面 (what shows) — `public/app.mjs`: `版面`
