<p align="center">
  <img src="public/icons/icon-192.png" width="96" height="96" alt="">
</p>

<h1 align="center">Orbit Weather</h1>

<p align="center">
  <b>One clear forecast.</b><br>
  <a href="https://jaypengx.com/weather/"><b>jaypengx.com/weather</b></a>
</p>

<p align="center">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES_modules-F7DF1E?logo=javascript&logoColor=000"> <img alt="PWA" src="https://img.shields.io/badge/PWA-works_offline-5A0FC8?logo=pwa&logoColor=fff"> <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=fff"> <img alt="GitHub" src="https://img.shields.io/badge/GitHub-Pages-24292F?logo=github&logoColor=fff"> <img alt="Tests" src="https://img.shields.io/badge/Tests-node_--test-339933?logo=nodedotjs&logoColor=fff">
</p>

One forecast for where you are and the places you pin, down to the township. Part of **Orbit**, a family of phone apps for life in Taiwan that share one sign-in, the Orbit Pass. See them all at [jaypengx.com](https://jaypengx.com/).

## What it does

- **One answer:** several official sources blended into a single number for each thing.
- **Rain soon:** a one-line heads-up when rain starts or stops in the next two hours.
- **Your day:** each hour shows the forecast for where you'll be then, from your pinned places.
- **Typhoon days:** the chance of a day off, and the official word once it's out.
- **Morning brief and rain watch** notices.

## Stack

- Plain JavaScript (ES modules), HTML and CSS: no framework, no build step, no runtime dependencies.
- An installable phone web app (Add to Home Screen), cached by a service worker.
- The look, sign-in (the Orbit Pass) and notices come from the shared kit in [Shared-Proxy](https://github.com/JayPengX/Shared-Proxy).
- Live data goes through the Orbit proxy on Cloudflare Workers (`api.jaypengx.com`). Google Weather, CWA and MOENV, blended and cached per ~1 km cell.
- Hosted on GitHub Pages and served at jaypengx.com by a Cloudflare Worker; every push to `main` tests and deploys.

## For developers

```bash
npm test
```

How it works, file by file, and the decisions still in force: **[MAP.md](MAP.md)**.
