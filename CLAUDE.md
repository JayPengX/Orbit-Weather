# Working on Orbit Weather

Read `../Orbit-Core/docs/TRUTH.md` first (one page: how the owner works and what matters).
MAP.md is this repo's map (README.md is the short public front page).

- `npm test`, then `git push origin HEAD:main`.
- See it on a phone: `node ../Orbit-Core/tools/preview.mjs weather --live --width 375`.
- Screenshots for a change: `node ../Orbit-Core/tools/shots.mjs weather --before main` (320/390, light/dark, live data, a diff against what's live; `../Orbit-Core/tools/README.md`).
