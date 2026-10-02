// 我的行程: the weather where you'll be, hour by hour. The pins say where
// you are when (school on weekdays 07–17…), home (a pin marked so, else the
// device's place) the rest of the time; each hour is taken from that
// place's forecast, and the page is built from the stitched hours: now and
// next, what to bring for the day, one graph, today and tomorrow by place,
// the week.

import { placeAt } from './pins.mjs';
import { clock, hourOf, dateOf, dayLabel, shortDate, weekday, deg, uvColor, rainColor, conditionIcon, escapeHtml as e } from './format.mjs';
import { timeline } from './graph.mjs';
import { skyOf } from './cards.mjs';

const HOUR = 3_600_000;
const TZ = 'Asia/Taipei';

export const placeKey = pin => (pin ? pin.id : 'here');
export const placeName = pin => (pin ? pin.name : '目前位置');
export const placeIcon = pin => (pin?.home ? '🏠' : pin ? '📌' : '📍');

// n hours from `from`: [{ t, key, pin, h }] (h: that place's forecast hour,
// null while it isn't loaded).
export function stitch(pins, forecastFor, from, n) {
  const start = Math.floor(from / HOUR) * HOUR;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = start + i * HOUR;
    const pin = placeAt(pins, t + 30 * 60_000);
    const key = placeKey(pin);
    const h = forecastFor(key)?.hours?.find(x => x.t === t) || null;
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
export function planTips(pins, forecastFor, now) {
  const span = adviceSpan(now);
  const list = stitch(pins, forecastFor, span.from, Math.max(1, Math.ceil((span.to - span.from) / HOUR)));
  const at = x => `${placeName(x.pin)} ${hourOf(x.t, TZ)}時`;
  const tips = [];
  const withH = list.filter(x => x.h);
  if (!withH.length) return { span, tips };
  // Rain anywhere you'll be.
  const wet = withH.reduce((a, x) => ((x.h.pop ?? -1) > (a.h.pop ?? -1) ? x : a), withH[0]);
  tips.push(wet.h.pop >= 50 ? { kind: 'umbrella', icon: '☂️', title: '雨傘', text: `要帶：${at(wet)} ${wet.h.pop}%`, level: 'yes' } : wet.h.pop >= 30 ? { kind: 'umbrella', icon: '☂️', title: '雨傘', text: `摺疊傘：${at(wet)} ${wet.h.pop}%`, level: 'maybe' } : { kind: 'umbrella', icon: '☂️', title: '雨傘', text: '一路都不太會下雨', level: 'none' });
  // Clothes for the coolest and warmest place-hours.
  const fs = withH.filter(x => feel(x.h) != null);
  if (fs.length) {
    const cold = fs.reduce((a, x) => (feel(x.h) < feel(a.h) ? x : a), fs[0]);
    const warm = fs.reduce((a, x) => (feel(x.h) > feel(a.h) ? x : a), fs[0]);
    const lo = feel(cold.h);
    const hi = feel(warm.h);
    const layers = hi - lo >= 7;
    tips.push({ kind: 'wear', icon: '👕', title: '穿著', text: `${wearFor(lo + (hi - lo) / 3)}${layers ? `，帶件外套（${at(cold)} ${Math.round(lo)}°，${at(warm)} ${Math.round(hi)}°）` : `（體感 ${Math.round(lo)}–${Math.round(hi)}°）`}`, level: layers ? 'yes' : 'none' });
  }
  // Sun where you'll be in the day.
  const sunny = withH.filter(x => x.h.uv >= 3);
  if (sunny.length) {
    const top = sunny.reduce((a, x) => (x.h.uv > a.h.uv ? x : a), sunny[0]);
    tips.push({ kind: 'sun', icon: '🧴', title: '防曬', text: `${at(top)} UV ${top.h.uv}`, level: top.h.uv >= 6 ? 'yes' : 'maybe' });
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
    tips.push({ kind: 'move', icon: '🚆', title: `${clock(b.from, TZ)} 移動`, text: `${placeName(a.pin)}→${placeName(b.pin)}${worst >= 30 ? `：雨 ${pa}%→${pb}%` : '：乾爽'}${hb?.temp != null && ha?.temp != null && Math.abs(hb.temp - ha.temp) >= 2 ? `，${hb.temp > ha.temp ? '熱' : '涼'} ${Math.round(Math.abs(hb.temp - ha.temp))}°` : ''}`, level: worst >= 50 ? 'yes' : worst >= 30 ? 'maybe' : 'none' });
  }
  // How different the places are at the same hour (the main stay away from home).
  const away = segs.filter(s => s.pin && !s.pin.home).sort((x, y) => y.to - y.from - (x.to - x.from))[0];
  const homeKey = placeKey(pins.find(p => p.home) || null);
  if (away && away.key !== homeKey) {
    const mid = away.from + Math.floor((away.to - away.from) / 2 / HOUR) * HOUR;
    const there = forecastFor(away.key)?.hours?.find(x => x.t === mid);
    const home = forecastFor(homeKey)?.hours?.find(x => x.t === mid);
    if (there?.temp != null && home?.temp != null && Math.abs(there.temp - home.temp) >= 2) {
      tips.push({ kind: 'diff', icon: '↔️', title: '兩地溫差', text: `${hourOf(mid, TZ)}時 ${away.pin.name}比${placeName(pins.find(p => p.home) || null)}${there.temp > home.temp ? '熱' : '涼'} ${Math.round(Math.abs(there.temp - home.temp))}°`, level: 'none' });
    }
  }
  return { span, tips };
}

// ---- The page ------------------------------------------------------------------------

function nowCard(pins, forecastFor, now) {
  const pin = placeAt(pins, now);
  const f = forecastFor(placeKey(pin));
  const n = f?.now || {};
  // The day the numbers are for: the rest of today, or tomorrow's route after 21時.
  const span = adviceSpan(now);
  const today = stitch(pins, forecastFor, span.from, Math.max(1, Math.ceil((span.to - span.from) / HOUR)));
  const hi = maxBy(today.map(x => x.h), 'temp');
  const lo = minBy(today.map(x => x.h), 'temp');
  const wet = today.filter(x => x.h).reduce((a, x) => ((x.h.pop ?? -1) > (a?.h.pop ?? -1) ? x : a), null);
  // The next move, said once.
  const segs = segments(stitch(pins, forecastFor, now, 36));
  const next = segs[1];
  const nf = next && stayFacts(next);
  const place = pin ? [pin.town, pin.village].filter(Boolean).join(' ') : '依裝置位置';
  return `
  <section class="wx-hero ${f ? skyOf(n) : 'sky-cloud sky-day'}">
    <div class="wx-where">
      <h2 class="wx-place">🗓️ 我的行程</h2>
      <p class="wx-sub">現在在 ${placeIcon(pin)} ${e(placeName(pin))}${place ? ` · ${e(place)}` : ''}</p>
    </div>
    ${
      f
        ? `<div class="wx-now">
      <div class="wx-temp">${deg(n.temp)}</div>
      <div class="wx-cond"><span class="wx-icon">${conditionIcon(n.condition?.code, n.condition?.text, n.day ?? true)}</span><b>${e(n.condition?.text || '')}</b><span>體感 ${deg(n.feels)}</span></div>
    </div>
    <div class="wx-hilo">
      <div><span>${span.word}最高</span><b>${deg(hi?.temp)}</b><small>${hi ? `${e(placeName(today.find(x => x.h === hi)?.pin))} ${hourOf(hi.t, TZ)}時` : ''}</small></div>
      <div><span>${span.word}最低</span><b>${deg(lo?.temp)}</b><small>${lo ? `${e(placeName(today.find(x => x.h === lo)?.pin))} ${hourOf(lo.t, TZ)}時` : ''}</small></div>
      <div><span>${span.word}最大雨</span><b>${wet ? `${wet.h.pop}%` : '–'}</b><small>${wet ? `${e(placeName(wet.pin))} ${hourOf(wet.t, TZ)}時` : ''}</small></div>
    </div>
    ${next ? `<p class="wx-headline">接下來 ${e(dayLabel(dateOf(next.from, TZ), now, TZ) === '今天' ? '' : dayLabel(dateOf(next.from, TZ), now, TZ) + ' ')}${clock(next.from, TZ)} 到${placeIcon(next.pin)}${e(placeName(next.pin))}${nf.loaded ? `：${deg(nf.lo)}–${deg(nf.hi)}，雨 ${nf.wet?.pop ?? 0}%` : ''}</p>` : ''}`
        : '<p class="wx-headline">正在取得天氣…</p>'
    }
  </section>`;
}

function tipsHtml({ span, tips }) {
  if (!tips.length) return '';
  return `
  <section class="wx-section">
    <h3 class="wx-h">${span.word}的行程建議</h3>
    <div class="wx-lifegrid">${tips.map(t => `<div class="wx-life lv-${e(t.level)} k-${e(t.kind)}"><span class="wx-life-icon">${t.icon}</span><div><b>${e(t.title)}</b><p>${e(t.text)}</p></div></div>`).join('')}</div>
  </section>`;
}

// The stitched graph's columns (48 hours): rain as the bar, the
// temperature above every 3 hours, the place's name where it changes.
export function planCols(pins, forecastFor, now) {
  const list = stitch(pins, forecastFor, now, 48);
  return list.map((x, i) => ({
    t: x.t,
    place: placeName(x.pin),
    temp: x.h?.temp ?? null,
    pop: x.h?.pop ?? null,
    mm: x.h?.mm ?? null,
    uv: x.h?.uv ?? null,
    tag: i === 0 || x.key !== list[i - 1].key ? `${placeIcon(x.pin)}${placeName(x.pin)}` : '',
    key: x.key
  }));
}
function planGraph(cols, now) {
  const tl = cols.map((c, i) => ({
    t: c.t,
    v: c.pop,
    color: rainColor(c.pop),
    inner: c.mm >= 0.1 && c.pop > 0 ? Math.min(1, c.mm / 10 / (c.pop / 100)) : 0,
    text: c.temp != null && (i === 0 || c.tag || hourOf(c.t, TZ) % 3 === 0) ? `${Math.round(c.temp)}°` : '',
    under: i === 0 ? '現在' : hourOf(c.t, TZ) % 3 === 0 && hourOf(c.t, TZ) ? `${hourOf(c.t, TZ)}時` : '',
    strong: i === 0,
    tag: c.tag
  }));
  return timeline('plan', tl, { max: 100, tz: TZ, label: '行程中每小時的降雨機率與溫度', nowIndex: 0 });
}

// A day's stays, in a row each.
function stayRows(pins, forecastFor, date, now) {
  const start = date === dateOf(now, TZ) ? now : Date.parse(`${date}T06:00:00+08:00`);
  const end = Date.parse(`${date}T23:00:00+08:00`);
  if (end <= start) return '';
  const segs = segments(stitch(pins, forecastFor, start, Math.ceil((end - start) / HOUR)));
  return segs
    .map(s => {
      const x = stayFacts(s);
      const go = s.pin ? `data-go-key="${e(s.key)}"` : 'data-go-key="here"';
      return `<button class="wx-stay" type="button" ${go}>
        <span class="wx-stay-time">${clock(s.from, TZ)}<small>–${clock(s.to, TZ)}</small></span>
        <span class="wx-stay-place">${placeIcon(s.pin)} ${e(placeName(s.pin))}</span>
        <span class="wx-stay-icon">${x.loaded ? x.icon : '…'}</span>
        <span class="wx-stay-temp">${x.loaded ? `${deg(x.lo)}–${deg(x.hi)}` : ''}</span>
        <span class="wx-stay-rain" style="color:${rainColor(x.wet?.pop ?? 0)}">${x.wet ? `${x.wet.pop}%` : ''}</span>
        <span class="wx-stay-uv" style="--c:${uvColor(x.uv?.uv)}">${x.uv?.uv >= 3 ? x.uv.uv : ''}</span>
      </button>`;
    })
    .join('');
}

export function planHtml(pins, forecastFor, now) {
  const cols = planCols(pins, forecastFor, now);
  const today = dateOf(now, TZ);
  const tomorrow = dateOf(now + 24 * HOUR, TZ);
  const week = Array.from({ length: 6 }, (_, i) => dateOf(now + (i + 2) * 24 * HOUR, TZ));
  return [
    nowCard(pins, forecastFor, now),
    tipsHtml(planTips(pins, forecastFor, now)),
    `<section class="q-card wx-card wx-plan">
      <header class="wx-card-head"><span class="wx-ic">🗺️</span><div class="wx-card-title"><h3>一路的天氣</h3><p>每小時取你在的地方</p></div></header>
      <div class="wx-graphbox"><span class="wx-when" data-when="plan">${e(`${dayLabel(today, now, TZ)} ${shortDate(today)}`)}</span><div class="wx-scroll" data-scroll="plan">${planGraph(cols, now)}</div></div>
      <p class="wx-readout" data-read="plan" aria-live="polite">柱子：降雨機率 · 數字：溫度</p>
    </section>`,
    `<section class="wx-section"><h3 class="wx-h">今天</h3><div class="q-card wx-stays">${stayRows(pins, forecastFor, today, now) || '<p class="wx-foot">今天的行程結束了</p>'}</div></section>`,
    `<section class="wx-section"><h3 class="wx-h">明天 <small>${shortDate(tomorrow)} ${weekday(tomorrow)}</small></h3><div class="q-card wx-stays">${stayRows(pins, forecastFor, tomorrow, now)}</div></section>`,
    `<section class="wx-section"><h3 class="wx-h">這一週</h3>${week
      .map(d => `<div class="q-card wx-stays wx-stays-day"><p class="wx-stays-h">${weekday(d)} <small>${shortDate(d)}</small></p>${stayRows(pins, forecastFor, d, now)}</div>`)
      .join('')}</section>`
  ].join('');
}
