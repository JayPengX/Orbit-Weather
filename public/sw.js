// Orbit Weather: the family's one service worker (Shared-Proxy/kit/sw.js),
// with this app's settings. It keeps the page's own files so the app opens
// without a connection and can be installed, and never keeps a file that
// isn't the one its address names (GitHub's CDN can answer a new address
// with the old file for a while after a deploy).
self.QUADRA_SW = { cache: 'orbit-weather-v1', title: 'Orbit Weather' };
importScripts('../Shared-Proxy/kit/sw.js');
