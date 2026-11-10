// "Rain starting soon": the radar's first, then the hourly numbers.
//
// The radar (the proxy's `f.radar`: CWA's echoes tracked as they move,
// Orbit-Core weather-radar.js; read by the kit's rain-now.mjs, as the rain
// notice reads it) says the next two hours at the place, to ~1.5 km: a shower
// coming ({ kind: 'start', radar: true, at, to, peak, until, bars }) or
// already here ('now'), its words by how hard it falls (`rainWord`). Seeing
// nothing coming while the hours say it's wet: the rain is ending ('stop').
// A wet hour within the hour it sees nothing of isn't said (Jay 2026-11-10:
// a pill said rain while the hours said 晴); past that, the hours speak.
//
// The hours: rain is an hour at RAIN_YES (the same line as everywhere,
// format.mjs). { kind: 'start' | 'stop', at, mins, pop }: dry now and an
// hour of rain begins within 2 hours, or raining now and an hour under
// RAIN_MAYBE comes within 2 hours. null: nothing worth saying.

import * as rainKit from '#kit/rain-now.mjs';
import { RAIN_YES, RAIN_MAYBE } from './format.mjs';

const HOUR = 3_600_000;
const FIVE = 300_000;
const SOON_MS = 2 * HOUR;
// A copy older than this isn't "now" (cards.mjs OLD_MS says the same).
const FRESH_FOR = 30 * 60_000;

// (Read with a fallback: a phone may hold a kit from before rain-now.mjs's words.)
export const rainWord = mmh => rainKit.rainWord?.(mmh) || { level: 2, zh: '雨', en: 'Rain', tipZh: '記得帶傘', tipEn: 'take an umbrella' };
const radarOf = (f, now) => (f.radar?.rate ? rainKit.rainNow?.(f.radar, now) || null : null);

export function rainSoon(f, now) {
  if (!f?.hours?.length || (f.at && now - f.at > FRESH_FOR)) return null;
  const hours = f.hours.filter(h => h.t + HOUR > now && h.pop != null);
  const h0 = hours[0];
  // (The first hour must be this one: a gap in the hours is not "dry now".)
  if (!h0 || h0.t > now) return null;
  const radar = radarOf(f, now);
  const wetNow = h0.pop >= RAIN_YES || f.now?.rain1h > 0.5;
  const mins = t => Math.max(5, Math.round((t - now) / FIVE) * 5);
  if (radar && radar.kind !== 'dry') return { kind: radar.kind, radar: true, at: radar.from, mins: mins(radar.from), to: radar.to, peak: radar.peak, until: radar.until, bars: radar.bars };
  if (radar && wetNow) return { kind: 'stop', radar: true, at: now };
  // (The radar sees nothing coming: a wet hour said only past the next hour it watches.)
  const seen = radar ? Math.min(radar.until, now + HOUR) : now;
  const ahead = hours.filter(h => h.t > now && h.t <= now + SOON_MS && h.t >= seen);
  if (h0.pop < RAIN_YES) {
    const wet = ahead.find(h => h.pop >= RAIN_YES);
    return wet ? { kind: 'start', at: wet.t, mins: mins(wet.t), pop: wet.pop } : null;
  }
  const dry = ahead.find(h => h.pop < RAIN_MAYBE);
  return dry ? { kind: 'stop', at: dry.t, mins: mins(dry.t), pop: h0.pop } : null;
}

// The radar's rain by hour (the hour's start → the most it rains in it, mm
// an hour), so the hours say what the radar says (pages.mjs hourTrack).
export function radarHours(f, now) {
  const out = new Map();
  if (!f?.radar?.rate || (f.at && now - f.at > FRESH_FOR)) return out;
  const r = radarOf(f, now);
  if (!r || r.kind === 'dry') return out;
  for (const h of f.hours || []) {
    const inIt = r.bars.filter(b => b.t >= r.from && (r.to == null || b.t < r.to) && b.t + FIVE > h.t && b.t < h.t + HOUR && b.v >= (rainKit.WET_RATE ?? 0.5));
    if (inIt.length) out.set(h.t, Math.max(...inIt.map(b => b.v)));
  }
  return out;
}
