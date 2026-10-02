// The forecast from the proxy, and where it's for.
//
// Opening fast (docs/WEATHER-PLAN.md E3), and never stuck on location
// permission:
//   1. the last forecast on this device, at once;
//   2. where: a place picked by hand; else the device's position when
//      location is already allowed (or was asked for with the button) — a
//      coarse one, Wi-Fi / cell in about a second; else where the network
//      (IP) says, which needs no permission at all;
//   3. the same ~1 km cell as the stored forecast and under 15 minutes old:
//      no fetch.

export const PROXY = 'https://orbit-workers-proxy.pengzjay.workers.dev';
export const FRESH_MS = 15 * 60_000;
const STORE = 'orbit-weather:v1';

// The proxy caches by 0.01° (about 1 km).
export const cellOf = (lat, lon) => `${(Math.round(lat * 100) / 100).toFixed(2)},${(Math.round(lon * 100) / 100).toFixed(2)}`;

// What the device remembers: { forecast, fetchedAt, cell, how, pick,
// wantGps, places }.
export function loadState(storage) {
  try {
    const s = JSON.parse(storage?.getItem(STORE) || 'null');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}
export function saveState(storage, state) {
  try {
    storage?.setItem(STORE, JSON.stringify(state));
  } catch {}
}

// 'granted' | 'prompt' | 'denied' | 'unknown' (the Permissions API is
// missing or refuses on some browsers).
export async function permissionState(nav) {
  try {
    const p = await nav?.permissions?.query({ name: 'geolocation' });
    return p?.state || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Where to look: 'pick' (chosen by hand), 'gps', or 'ip'.
export function chooseSource({ pick, permission, wantGps }) {
  if (pick) return 'pick';
  if (permission === 'denied') return 'ip';
  if (permission === 'granted' || wantGps) return 'gps';
  return 'ip';
}

// A coarse position: { lat, lon } or { error: 'denied' | 'unavailable' |
// 'timeout' | 'unsupported' }.
export function getPosition(nav, { timeout = 5000, maximumAge = FRESH_MS } = {}) {
  return new Promise(resolve => {
    if (!nav?.geolocation) return resolve({ error: 'unsupported' });
    nav.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      e => resolve({ error: e?.code === 1 ? 'denied' : e?.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: false, timeout, maximumAge }
    );
  });
}

// Does the stored forecast already answer for this cell?
export function isFresh(state, cell, now) {
  return !!(state.forecast && state.cell === cell && now - (state.fetchedAt || 0) < FRESH_MS);
}

export async function fetchForecast(where, fetchFn = fetch, base = PROXY) {
  const q = where.auto ? 'auto=1' : `lat=${where.lat.toFixed(4)}&lon=${where.lon.toFixed(4)}`;
  const res = await fetchFn(`${base}/weather?${q}`);
  if (!res.ok) {
    const err = new Error(`weather ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchPlaces(fetchFn = fetch, base = PROXY) {
  const res = await fetchFn(`${base}/weather/places`);
  if (!res.ok) throw new Error(`places ${res.status}`);
  return res.json();
}

// The place's name for the header.
export function placeName(forecast, state) {
  if (state.pick) return state.pick.town;
  const p = forecast?.place;
  if (p?.town) return p.town;
  return forecast?.located?.city || '目前位置';
}
