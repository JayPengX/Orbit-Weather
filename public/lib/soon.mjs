// "Rain starting soon": from the hourly numbers, the next 2 hours only.
// Rain is an hour at RAIN_YES (the same line as everywhere, format.mjs).
// Returns null (nothing worth saying), or { kind: 'start' | 'stop', at, mins, pop }:
// `start`: dry now, an hour of rain begins within 2 hours; `stop`: raining
// now, an hour under RAIN_MAYBE comes within 2 hours.

import { RAIN_YES, RAIN_MAYBE } from './format.mjs';

const HOUR = 3_600_000;
const FIVE = 300_000;
const SOON_MS = 2 * HOUR;
// A copy older than this isn't "now" (cards.mjs OLD_MS says the same).
const FRESH_FOR = 30 * 60_000;

export function rainSoon(f, now) {
  if (!f?.hours?.length || (f.at && now - f.at > FRESH_FOR)) return null;
  const hours = f.hours.filter(h => h.t + HOUR > now && h.pop != null);
  const h0 = hours[0];
  // (The first hour must be this one: a gap in the hours is not "dry now".)
  if (!h0 || h0.t > now) return null;
  const ahead = hours.filter(h => h.t > now && h.t <= now + SOON_MS);
  const mins = h => Math.max(5, Math.round((h.t - now) / FIVE) * 5);
  if (h0.pop < RAIN_YES) {
    const wet = ahead.find(h => h.pop >= RAIN_YES);
    return wet ? { kind: 'start', at: wet.t, mins: mins(wet), pop: wet.pop } : null;
  }
  const dry = ahead.find(h => h.pop < RAIN_MAYBE);
  return dry ? { kind: 'stop', at: dry.t, mins: mins(dry), pop: h0.pop } : null;
}
