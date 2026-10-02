// The app's files kept on the device, so it opens offline (the last
// forecast lives in localStorage). Bump VERSION with every change to these
// files.
const VERSION = 'orbit-weather-1';
const SHELL = ['./', 'index.html', 'app.css', 'app.mjs', 'lib/api.mjs', 'lib/chart.mjs', 'lib/format.mjs', 'lib/sun.mjs', 'lib/view.mjs', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// The app's own files: from the cache at once, refreshed behind. Anything
// else (the forecast) goes to the network untouched.
self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== location.origin) return;
  ev.respondWith(
    caches.open(VERSION).then(async cache => {
      const hit = await cache.match(ev.request, { ignoreSearch: true });
      const net = fetch(ev.request)
        .then(res => {
          if (res.ok) cache.put(ev.request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
