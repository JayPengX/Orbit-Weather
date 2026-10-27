// The forecast and the place, from the proxy (signed in with the Orbit
// Pass session), and where the device is.

import * as kitLang from '#kit/lang.mjs';
// A county or township in the reader's language (the kit's, once every phone has it).
export const placeIn = name => kitLang.place?.(name) ?? name;
import * as kit from '#kit/orbit.mjs';

// (api.<domain> on the family's own domain: the kit's API, kit/domain.mjs.)
export const PROXY = kit.API || 'https://orbit-workers-proxy.pengzjay.workers.dev';
// How often the forecast is asked again, after what its sources do: Google's
// current conditions change every 15 minutes and its forecast every 30, the
// stations' and the air's readings every hour, CWA's township forecast every
// 6 hours (the proxy keeps a place 15 minutes, its Google forecast 30).
export const FRESH_MS = 15 * 60_000;
// Older than this, a saved forecast is shown as old (faded now, 更新中 at
// the top) until the new one comes; older than HIDE_MS it isn't shown at
// all while the new one is asked for (only when that fails, marked old).
export const OLD_MS = 30 * 60_000;
export const HIDE_MS = 6 * 3_600_000;
// Nothing is asked twice within RECHECK_MS (but the asks below).
export const RECHECK_MS = 2 * 60_000;
// An answer that isn't the last word (`more`: the proxy is still getting the
// hours to day 10 and the air forecast; `refreshing`: an old copy, its
// refresh still going): the whole one follows on the same request; when it
// doesn't come, asked again MORE_FIRST_MS later, then every MORE_MS, up to
// MORE_TRIES times.
export const MORE_FIRST_MS = 1200;
export const MORE_MS = 2000;
export const MORE_TRIES = 7;
const STORE = 'orbit-weather.v2';

// The proxy caches by 0.01° (about 1 km).
export const cellOf = (lat, lon) => `${(Math.round(lat * 100) / 100).toFixed(2)},${(Math.round(lon * 100) / 100).toFixed(2)}`;

// What this device keeps (signing out wipes it with everything else):
// { here: { lat, lon, county, town, at }, forecasts: { cell: { at,
// f } }, data (the pass's copy, encoded) }.
export function loadLocal(storage = globalThis.localStorage) {
  try {
    const s = JSON.parse(storage?.getItem(STORE) || 'null');
    return s && typeof s === 'object' ? { forecasts: {}, ...s } : { forecasts: {} };
  } catch {
    return { forecasts: {} };
  }
}
export function saveLocal(local, storage = globalThis.localStorage) {
  // The forecasts of the 6 places seen last, so storage stays small.
  const cells = Object.entries(local.forecasts || {})
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 6);
  const out = { ...local, forecasts: Object.fromEntries(cells) };
  try {
    storage?.setItem(STORE, JSON.stringify(out));
  } catch {
    try {
      storage?.setItem(STORE, JSON.stringify({ ...out, forecasts: Object.fromEntries(cells.slice(0, 2)) }));
    } catch {}
  }
}
export const cachedForecast = (local, cell) => local.forecasts?.[cell] || null;
// How old a copy's numbers are: when the proxy made them (`f.at`), not
// when this device got them (a copy the proxy was still refreshing is old).
export const dataAge = (entry, now = Date.now()) => (entry ? now - Math.min(entry.at, entry.f?.at || entry.at) : Infinity);
export const isFresh = (entry, now = Date.now()) => !!(entry && (dataAge(entry, now) < FRESH_MS || now - entry.at < RECHECK_MS));

// 'granted' | 'prompt' | 'denied' | 'unknown'.
export async function permissionState(nav = globalThis.navigator) {
  try {
    return (await nav?.permissions?.query({ name: 'geolocation' }))?.state || 'unknown';
  } catch {
    return 'unknown';
  }
}

// The device's position, as precise as it gives within the time (to the
// township is enough, but Wi-Fi or GPS tells the cell). { lat, lon, acc } or { error }.
export function getPosition(nav = globalThis.navigator, { timeout = 8000, maximumAge = 5 * 60_000, high = true } = {}) {
  return new Promise(resolve => {
    if (!nav?.geolocation) return resolve({ error: 'unsupported' });
    nav.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      err => resolve({ error: err?.code === 1 ? 'denied' : err?.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: high, timeout, maximumAge }
    );
  });
}

async function get(path, token, fetchFn) {
  const res = await fetchFn(`${PROXY}${path}${path.includes('?') ? '&' : '?'}qt=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const err = new Error(`${path.split('?')[0]} ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
// The forecast for a point, or where the network says (`auto`): → { f, rest }.
// When `f` isn't the last word (`more`, `refreshing`), the proxy sends the
// whole answer on the same request the moment it's in: `rest`, a promise of
// it (null when the request ends without it; then it's asked again).
export async function fetchForecast(where, token, fetchFn = fetch) {
  const path = where.auto ? '/weather?auto=1' : `/weather?lat=${where.lat.toFixed(4)}&lon=${where.lon.toFixed(4)}`;
  const res = await fetchFn(`${PROXY}${path}&lines=1&qt=${encodeURIComponent(token)}`);
  if (!res.ok) throw Object.assign(new Error(`/weather ${res.status}`), { status: res.status });
  const reader = res.body?.getReader?.();
  if (!reader) {
    const [f, rest] = (res.text ? await res.text() : JSON.stringify(await res.json())).trim().split('\n');
    return { f: JSON.parse(f), rest: Promise.resolve(rest ? JSON.parse(rest) : null) };
  }
  const text = new TextDecoder();
  let buf = '';
  const line = async () => {
    for (;;) {
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        const one = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (one.trim()) return JSON.parse(one);
        continue;
      }
      const { done, value } = await reader.read();
      if (done) {
        const last = buf.trim();
        buf = '';
        return last ? JSON.parse(last) : null;
      }
      buf += text.decode(value, { stream: true });
    }
  };
  const f = await line();
  if (!f) throw Object.assign(new Error('/weather empty'), { status: 0 });
  return { f, rest: line().catch(() => null) };
}
// The place: { county, town }.
export const fetchWhere = (lat, lon, token, fetchFn = fetch) => get(`/weather/where?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`, token, fetchFn);
// Taiwan's townships [[county, town, lat, lon]…] for the pin picker.
export async function fetchPlaces(fetchFn = fetch) {
  const res = await fetchFn(`${PROXY}/weather/places`);
  if (!res.ok) throw new Error(`places ${res.status}`);
  return res.json();
}

// 「信義區」 and 「臺北市」 for the top of a page (Xinyi and Taipei in English).
export function placeLines(place) {
  if (!place) return { main: '', sub: '' };
  const main = placeIn(place.town || '');
  return { main: main || placeIn(place.county || ''), sub: main ? placeIn(place.county || '') : '' };
}
