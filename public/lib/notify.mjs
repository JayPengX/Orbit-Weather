// Notices while the app is closed: the morning brief and the rain alert.
//
// The proxy (Shared-Proxy push.js) keeps this device's list and sends each
// notice when it's due, through Web Push. No sign-in: the device has its
// own random id (`dev`). Each notice carries a check the proxy runs at its
// time, for where the app was last opened:
//   brief  at the chosen time each morning, today in one line;
//   rain   from 07:00 to 21:00 each day, once, if the next 2 hours turn wet.
// On an iPhone this works only from the home-screen app (iOS 16.4+).

import { PROXY } from './api.mjs';

const APP_URL = 'https://jaypengx.github.io/Orbit-Weather/';
export const DAYS = 7;
export const RESEND_MS = 12 * 3_600_000;

// The device's id: 16 random bytes, base64url (22 characters), made once.
export function deviceId(state, rand = n => crypto.getRandomValues(new Uint8Array(n))) {
  if (state.dev && /^[A-Za-z0-9_-]{22}$/.test(state.dev)) return state.dev;
  let s = '';
  for (const b of rand(16)) s += String.fromCharCode(b);
  state.dev = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return state.dev;
}

// The device's local time on day `i` from today at "HH:MM".
const at = (now, i, clock) => {
  const [h, m] = clock.split(':').map(Number);
  const d = new Date(now);
  d.setDate(d.getDate() + i);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

// The next DAYS days' notices for lat / lon. `prefs`: { brief: 'HH:MM' |
// null, rain: boolean }.
export function buildNotices({ lat, lon, prefs, now = Date.now() }) {
  const items = [];
  if (lat == null || lon == null) return items;
  const where = { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 };
  for (let i = 0; i < DAYS + 1; i++) {
    if (prefs.brief && /^\d{2}:\d{2}$/.test(prefs.brief)) {
      const t = at(now, i, prefs.brief);
      if (t > now && items.filter(x => x.kind === 'brief').length < DAYS) items.push({ at: t, kind: 'brief', title: '今天天氣', tag: 'weather-brief', url: APP_URL, check: { weather: { ...where, kind: 'brief' } } });
    }
    if (prefs.rain) {
      const from = at(now, i, '07:00');
      const until = at(now, i, '21:00');
      if (until > now && items.filter(x => x.kind === 'rain').length < DAYS) items.push({ at: Math.max(from, now + 60_000), until, kind: 'rain', title: '快下雨了', tag: 'weather-rain', url: APP_URL, check: { weather: { ...where, kind: 'rain' } } });
    }
  }
  return items.sort((a, b) => a.at - b.at);
}

// Whether the list should be sent again: on, and a new place or old.
export function needsResend(state, cell, now) {
  const p = state.notify;
  if (!p || (!p.brief && !p.rain)) return false;
  return state.sentCell !== cell || now - (state.sentAt || 0) > RESEND_MS;
}

export const pushSupported = (win = globalThis) => !!(win.navigator?.serviceWorker && win.PushManager && win.Notification);
// iOS shows push only to a home-screen app.
export const needsHomeScreen = (win = globalThis) => /iPhone|iPad|iPod/.test(win.navigator?.userAgent || '') && !win.navigator?.standalone && !win.matchMedia?.('(display-mode: standalone)').matches;

const b64uBytes = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)), c => c.charCodeAt(0));

// Asks (on a tap), subscribes, and tells the proxy. Throws on refusal.
export async function subscribe(state, { fetchFn = fetch, base = PROXY } = {}) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw Object.assign(new Error('denied'), { code: 'denied' });
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await (await fetchFn(`${base}/push/key`)).json();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(key) });
  }
  const res = await fetchFn(`${base}/push/subscribe?dev=${deviceId(state)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON(), lang: 'zh' }) });
  if (!res.ok) throw new Error(`subscribe ${res.status}`);
}

export async function sendNotices(state, items, { fetchFn = fetch, base = PROXY } = {}) {
  const res = await fetchFn(`${base}/push/schedule?dev=${deviceId(state)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
  if (!res.ok) throw new Error(`schedule ${res.status}`);
  return res.json();
}
