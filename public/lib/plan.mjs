// 我的行程: a city page like any other, but each hour is the one of the
// city you're in then. The pins say where you are when (school on weekdays
// 07–17…), home (a pin marked so, else the device's place) the rest of the
// time; `routeForecast` stitches the places' forecasts into one, in the
// same shape, so the same cards draw it.

import { placeAt } from './pins.mjs';
import { clock, hourOf, dateOf, dayLabel, conditionIcon } from './format.mjs';

const HOUR = 3_600_000;
const TZ = 'Asia/Taipei';

export const placeKey = pin => (pin ? pin.id : 'here');
// Where you are at `t`: the pins' plan, except while the device says you're
// somewhere else (`live.until`: the hours it's taken as true), then here.
// A plan says where you usually are; the phone says where you are.
const at = (pins, t, live) => (live?.until && t < live.until ? null : placeAt(pins, t));
export const placeName = pin => (pin ? pin.name : '目前位置');
export const placeIcon = pin => (pin?.home ? '🏠' : pin ? '📌' : '📍');

// n hours from `from`: [{ t, key, pin, h }] (h: that place's forecast hour,
// null while it isn't loaded).
// (Each forecast's hours by time, made once.)
const byTime = new WeakMap();
const hourAt = (f, t) => {
  if (!f?.hours) return null;
  let m = byTime.get(f);
  if (!m) byTime.set(f, (m = new Map(f.hours.map(h => [h.t, h]))));
  return m.get(t) || null;
};
export function stitch(pins, forecastFor, from, n, live = null) {
  const start = Math.floor(from / HOUR) * HOUR;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = start + i * HOUR;
    const pin = at(pins, t + 30 * 60_000, live);
    const key = placeKey(pin);
    const h = hourAt(forecastFor(key), t);
    out.push({ t, key, pin, h });
  }
  return out;
}

// The stitched hours as stays: [{ key, pin, from, to, hours }].
export function segments(list) {
  const out = [];
  for (const x of list) {
    const last = out[out.length - 1];
    if (last && last.key === x.key && last.to === x.t) {
      last.to = x.t + HOUR;
      last.hours.push(x.h);
    } else out.push({ key: x.key, pin: x.pin, from: x.t, to: x.t + HOUR, hours: [x.h] });
  }
  return out;
}

const known = hs => hs.filter(Boolean);
const maxBy = (hs, k) => known(hs).reduce((a, h) => (h[k] != null && (a == null || h[k] > a[k]) ? h : a), null);
const minBy = (hs, k) => known(hs).reduce((a, h) => (h[k] != null && (a == null || h[k] < a[k]) ? h : a), null);
const feel = h => h?.feels ?? h?.temp ?? null;

// A stay in a line: its hours, temperatures, the wettest hour, the UV peak.
export function stayFacts(seg) {
  const hs = known(seg.hours);
  const hi = maxBy(hs, 'temp');
  const lo = minBy(hs, 'temp');
  const wet = maxBy(hs, 'pop');
  const uv = maxBy(hs, 'uv');
  return { hi: hi?.temp ?? null, lo: lo?.temp ?? null, wet, uv, icon: wet?.pop >= 40 ? conditionIcon(wet.condition?.code, wet.condition?.text, wet.day ?? true) : conditionIcon(hs[Math.floor(hs.length / 2)]?.condition?.code, hs[Math.floor(hs.length / 2)]?.condition?.text, hs[Math.floor(hs.length / 2)]?.day ?? true), loaded: hs.length > 0 };
}

const WEAR = [[15, '外套'], [20, '薄外套'], [26, '長袖'], [Infinity, '短袖']];
const wearFor = v => WEAR.find(([max]) => v < max)[1];

// The day the advice is for: what's left of today (to 22時), or tomorrow
// 6–22時 once it's 21時.
export function adviceSpan(now) {
  const h = hourOf(now, TZ);
  const date = dateOf(now, TZ);
  if (h >= 21) {
    const d = dateOf(now + 12 * HOUR, TZ);
    return { from: Date.parse(`${d}T06:00:00+08:00`), to: Date.parse(`${d}T22:00:00+08:00`), word: '明天' };
  }
  return { from: Math.max(now, Date.parse(`${date}T06:00:00+08:00`)), to: Date.parse(`${date}T22:00:00+08:00`), word: '今天' };
}

// What to bring and wear for the whole route: [{ kind, icon, title, text, level }].
export function planTips(pins, forecastFor, now, live = null) {
  const span = adviceSpan(now);
  const list = stitch(pins, forecastFor, span.from, Math.max(1, Math.ceil((span.to - span.from) / HOUR)), live);
  const tips = [];
  const withH = list.filter(x => x.h);
  if (!withH.length) return { span, tips };
  // Rain anywhere you'll be.
  const wet = withH.reduce((a, x) => ((x.h.pop ?? -1) > (a.h.pop ?? -1) ? x : a), withH[0]);
  tips.push(wet.h.pop >= 50 ? { kind: 'umbrella', icon: '☂️', title: '雨傘', text: `要帶，${hourOf(wet.t, TZ)}時 ${wet.h.pop}%`, level: 'yes' } : wet.h.pop >= 30 ? { kind: 'umbrella', icon: '☂️', title: '雨傘', text: `摺疊傘，${hourOf(wet.t, TZ)}時 ${wet.h.pop}%`, level: 'maybe' } : { kind: 'umbrella', icon: '☂️', title: '雨傘', text: '不用帶', level: 'none' });
  // Clothes for the coolest and warmest place-hours.
  const fs = withH.filter(x => feel(x.h) != null);
  if (fs.length) {
    const cold = fs.reduce((a, x) => (feel(x.h) < feel(a.h) ? x : a), fs[0]);
    const warm = fs.reduce((a, x) => (feel(x.h) > feel(a.h) ? x : a), fs[0]);
    const lo = feel(cold.h);
    const hi = feel(warm.h);
    const layers = hi - lo >= 7;
    tips.push({ kind: 'wear', icon: '👕', title: '穿著', text: `${wearFor(lo + (hi - lo) / 3)}${layers ? '，帶件外套' : ` ${Math.round(lo) === Math.round(hi) ? '' : `${Math.round(lo)}–`}${Math.round(hi)}°`}`, level: layers ? 'yes' : 'none' });
  }
  // Sun where you'll be in the day.
  const sunny = withH.filter(x => x.h.uv >= 3);
  if (sunny.length) {
    const top = sunny.reduce((a, x) => (x.h.uv > a.h.uv ? x : a), sunny[0]);
    tips.push({ kind: 'sun', icon: '🧴', title: '防曬', text: `${hourOf(top.t, TZ)}時 UV ${top.h.uv}`, level: top.h.uv >= 6 ? 'yes' : 'maybe' });
  }
  // The moves between places: rain at either end.
  const segs = segments(list);
  for (let i = 1; i < segs.length && i <= 3; i++) {
    const a = segs[i - 1];
    const b = segs[i];
    const ha = a.hours[a.hours.length - 1];
    const hb = b.hours[0];
    if (!ha && !hb) continue;
    const pa = ha?.pop ?? 0;
    const pb = hb?.pop ?? 0;
    const worst = Math.max(pa, pb);
    tips.push({ kind: 'move', icon: '🚆', title: '移動', text: `${clock(b.from, TZ)} 到${placeName(b.pin)}，${worst >= 30 ? `雨 ${worst}%` : '乾爽'}`, level: worst >= 50 ? 'yes' : worst >= 30 ? 'maybe' : 'none' });
  }
  // How different the places are at the same hour (the main stay away from home).
  const away = segs.filter(s => s.pin && !s.pin.home).sort((x, y) => y.to - y.from - (x.to - x.from))[0];
  const homeKey = placeKey(pins.find(p => p.home) || null);
  if (away && away.key !== homeKey) {
    const mid = away.from + Math.floor((away.to - away.from) / 2 / HOUR) * HOUR;
    const there = hourAt(forecastFor(away.key), mid);
    const home = hourAt(forecastFor(homeKey), mid);
    if (there?.temp != null && home?.temp != null && Math.abs(there.temp - home.temp) >= 2) {
      tips.push({ kind: 'diff', icon: '↔️', title: '兩地溫差', text: `${hourOf(mid, TZ)}時${away.pin.name}${there.temp > home.temp ? '熱' : '涼'} ${Math.round(Math.abs(there.temp - home.temp))}°`, level: 'none' });
    }
  }
  return { span, tips };
}

// ---- One forecast for the route ---------------------------------------------------

const WEEK_SHORT = { 外套: '外套', 薄外套: '薄外套', 長袖: '長袖', 短袖: '短袖' };
const md = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const wd = date => '週' + '日一二三四五六'[new Date(date + 'T12:00:00Z').getUTCDay()];

// The places' forecasts made one: { tz, now, hours (each with its place),
// days, air, alerts, advice, headline, at, partial, places } — or null until
// the place you're in now has loaded.
export function routeForecast(pins, forecastFor, now, live = null) {
  const cur = at(pins, now, live);
  const fNow = forecastFor(placeKey(cur));
  if (!fNow) return null;
  const tz = fNow.tz || TZ;
  // Every hour any place has, from this one on, each from where you'll be.
  const ends = [...new Set([...pins.map(p => p.id), 'here'])].map(k => forecastFor(k)?.hours?.at(-1)?.t || 0);
  const last = Math.max(...ends);
  const span = Math.max(1, Math.floor((last - Math.floor(now / HOUR) * HOUR) / HOUR) + 1);
  const list = stitch(pins, forecastFor, now, Math.min(span, 240), live);
  const hours = list.filter(x => x.h).map(x => ({ ...x.h, place: placeName(x.pin) }));
  // The days: the hours where you are make a day's high and low; its rain
  // chance is the highest of the places you're in 7–22時; its words and sun
  // the place you're in at noon.
  const dates = [...new Set((fNow.days || []).map(d => d.date))];
  const days = dates.map(date => {
    const noonT = Date.parse(`${date}T12:00:00+08:00`);
    const main = forecastFor(placeKey(at(pins, noonT, live)))?.days?.find(d => d.date === date) || fNow.days.find(d => d.date === date);
    const dayList = stitch(pins, forecastFor, Date.parse(`${date}T00:00:00+08:00`), 24, live);
    const hs = dayList.map(x => x.h).filter(Boolean);
    const awake = dayList.filter(x => hourOf(x.t, tz) >= 7 && hourOf(x.t, tz) < 22);
    const keys = [...new Set(awake.map(x => x.key))];
    const pops = keys.map(k => forecastFor(k)?.days?.find(d => d.date === date)?.pop).filter(v => v != null);
    const val = (k, fn) => (hs.some(h => h[k] != null) ? fn(...hs.map(h => h[k]).filter(v => v != null)) : null);
    const names = [...new Set(awake.map(x => placeName(x.pin)))];
    return {
      ...main,
      hi: hs.length >= 12 ? val('temp', Math.max) : main?.hi ?? null,
      lo: hs.length >= 12 ? val('temp', Math.min) : main?.lo ?? null,
      feelsHi: hs.length >= 12 ? val('feels', Math.max) : main?.feelsHi ?? null,
      feelsLo: hs.length >= 12 ? val('feels', Math.min) : main?.feelsLo ?? null,
      uvMax: hs.length >= 12 ? val('uv', Math.max) : main?.uvMax ?? null,
      pop: pops.length ? Math.max(...pops) : main?.pop ?? null,
      places: names
    };
  });
  // Advice: the route's own (rain, clothes, sun, the moves, the places'
  // difference), then the place's for the rest (outdoors, mask, heat where
  // you are by day; laundry, the window at night, sleep, the car at home).
  const { span: aSpan, tips } = planTips(pins, forecastFor, now, live);
  const dayKey = placeKey(at(pins, aSpan.from + Math.floor((aSpan.to - aSpan.from) / 2 / HOUR) * HOUR, live));
  const take = (k, kinds) => (forecastFor(k)?.advice || []).filter(a => kinds.includes(a.kind));
  const advice = [
    ...tips.map(t => ({ kind: t.kind, level: t.level, text: `${t.title}：${t.text}` })),
    // (On the move: what changes the day out there; home things stay on home's page.)
    ...take(dayKey, ['run', 'thunder', 'wind', 'fog', 'temp', 'mask', 'heat'])
  ];
  // The week's table, from the route's days.
  const week = days.filter(d => d.date >= dateOf(aSpan.from, tz)).slice(0, 7);
  const row = (kind, f) => {
    const a = advice.find(x => x.kind === kind);
    if (a && week.length) a.week = { text: '', days: week.map(d => ({ date: d.date, ...f(d) })) };
  };
  row('umbrella', d => ({ mark: d.pop >= 50 ? 'yes' : d.pop >= 30 ? 'maybe' : null, v: d.pop != null ? `${d.pop}%` : '' }));
  row('sun', d => ({ mark: d.uvMax >= 8 ? 'bad' : d.uvMax >= 6 ? 'yes' : d.uvMax >= 3 ? 'maybe' : null, v: d.uvMax != null ? String(d.uvMax) : '' }));
  row('wear', d => {
    const lo = d.feelsLo ?? d.lo;
    const hi = d.feelsHi ?? d.hi;
    if (lo == null || hi == null) return { mark: null, v: '' };
    const w = wearFor(lo + (hi - lo) / 3);
    return { mark: { 外套: 'coat', 薄外套: 'jacket', 長袖: 'sleeves', 短袖: 'light' }[w], v: WEEK_SHORT[w] };
  });
  if (week.length >= 3) {
    const score = d => (d.pop ?? 0) + (d.uvMax ?? 0) * 3 + Math.abs((d.hi ?? 25) - 25) * 2;
    const sorted = [...week].sort((a, b) => score(a) - score(b));
    advice.push({ kind: 'week', level: 'info', text: `本週最佳：${md(sorted[0].date)}（${wd(sorted[0].date)}）`, why: { best: sorted[0].date, worst: sorted[sorted.length - 1].date, laundry: null } });
  }
  // One sentence: where you are, and the next move.
  const segs = segments(stitch(pins, forecastFor, now, 36, live));
  const next = segs[1];
  const nf = next && stayFacts(next);
  const when = next ? `${dayLabel(dateOf(next.from, tz), now, tz) === '今天' ? '' : dayLabel(dateOf(next.from, tz), now, tz)} ${clock(next.from, tz)}`.trim() : '';
  const headline = next ? `現在在${placeName(cur)}；${when} 到${placeName(next.pin)}${nf.loaded ? `，${Math.round(nf.lo) === Math.round(nf.hi) ? '' : `${Math.round(nf.lo)}–`}${Math.round(nf.hi)}°、雨 ${nf.wet?.pop ?? 0}%` : ''}。` : `今天都在${placeName(cur)}。`;
  const alerts = [];
  for (const k of new Set(list.slice(0, 24).map(x => x.key))) for (const a of forecastFor(k)?.alerts || []) if (!alerts.some(b => b.title === a.title)) alerts.push(a);
  return { tz, at: fNow.at, partial: fNow.partial, now: fNow.now, hours, days, air: fNow.air, alerts, advice, headline, place: fNow.place, places: [...new Set(list.map(x => placeName(x.pin)))] };
}
