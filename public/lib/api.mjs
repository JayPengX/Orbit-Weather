// The forecast and the place, from the proxy (signed in with the Quadra
// Pass session), and where the device is.

export const PROXY = 'https://orbit-workers-proxy.pengzjay.workers.dev';
// How often the forecast is asked again, after what its sources do: Google's
// current conditions change every 15 minutes and its forecast every 30, the
// stations' and the air's readings every hour, CWA's township forecast every
// 6 hours (the proxy keeps a place 15 minutes, its Google forecast 30).
export const FRESH_MS = 15 * 60_000;
// An answer the proxy is still refreshing (an old copy, `refreshing`) is
// asked again this much later, once; nothing is asked twice within RECHECK_MS.
export const RETRY_MS = 20_000;
export const RECHECK_MS = 2 * 60_000;
const STORE = 'orbit-weather.v2';

// The proxy caches by 0.01° (about 1 km).
export const cellOf = (lat, lon) => `${(Math.round(lat * 100) / 100).toFixed(2)},${(Math.round(lon * 100) / 100).toFixed(2)}`;

// What this device keeps (signing out wipes it with everything else):
// { here: { lat, lon, county, town, village, at }, forecasts: { cell: { at,
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
// village needs ~100 m: Wi-Fi or GPS). { lat, lon, acc } or { error }.
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
// The forecast for a point, or where the network says (`auto`).
export const fetchForecast = (where, token, fetchFn = fetch) => get(where.auto ? '/weather?auto=1' : `/weather?lat=${where.lat.toFixed(4)}&lon=${where.lon.toFixed(4)}`, token, fetchFn);
// The place to the village: { county, town, village }.
export const fetchWhere = (lat, lon, token, fetchFn = fetch) => get(`/weather/where?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`, token, fetchFn);
// Taiwan's townships [[county, town, lat, lon]…] for the pin picker.
export async function fetchPlaces(fetchFn = fetch) {
  const res = await fetchFn(`${PROXY}/weather/places`);
  if (!res.ok) throw new Error(`places ${res.status}`);
  return res.json();
}

// 「信義區 西村里」 and 「臺北市」 for the top of a page.
export function placeLines(place) {
  if (!place) return { main: '', sub: '' };
  const main = [place.town, place.village].filter(Boolean).join(' ');
  return { main: main || place.county || '', sub: main ? place.county || '' : '' };
}
