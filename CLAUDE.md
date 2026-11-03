# Working on Orbit Weather

Read `../Orbit-Core/CLAUDE.md` first: the family's map (the kit, the Workers and their APIs,
data and sync, the component patterns) and the rules to read before any work
(`../Orbit-Core/docs/RULEBOOK.md`, `TRUTH.md`, `DESIGN.md`). Before writing a helper or a
component, look for it in the kit: `node ../Orbit-Core/tools/kit-find.mjs <word>`.
MAP.md is this repo's map (README.md is the short public front page).

- A change to how this app is built (a module, a data or sync path, a pattern) updates MAP.md
  in the same push; anything the kit or a Worker gains goes into `../Orbit-Core/CLAUDE.md`.
- Push with `sh ../Orbit-Core/tools/push.sh`: it rebases onto `origin/main`, runs what the deploy runs (tests against main's kit), and pushes main only if they pass (a red deploy mails Jay).
- See it on a phone: `node ../Orbit-Core/tools/preview.mjs weather --live --width 375`.
- Screenshots for a change: `node ../Orbit-Core/tools/shots.mjs weather --before main` (320/390, light/dark, live data, a diff against what's live; `../Orbit-Core/tools/README.md`).
