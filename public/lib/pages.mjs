// Weather's two tabs in Orbit's own look (Jay 2026-11-03: a whole UX
// redesign with every feature kept, today's dark page, nothing drawn after
// another app; RULEBOOK §3). Its mark is the track: time, a scale or a day
// drawn as one thin line, where you are now a lit dot on it.
//
// 天氣: your day first. The sky stays in its card: where you are, now, and
// under it the day's track, the stops you'll make (我的行程: each place, when
// you're there, its weather) or the day's turns (rain coming, the high,
// sunset). Then the hours as one track whose dots rise and fall with the
// temperature (the places you'll be in under it), the ten days side by side on
// one scale, the readings each on its own track, the advice: the owner's cards
// (版面) in their order. A swipe goes to the place beside; the title opens 地點.
// 地點: each place with its next twelve hours of rain as a track.

import { W, en } from '#kit/lang.mjs';
import { escHtml as e } from '#kit/ui.mjs';
import * as kitUI from '#kit/ui.mjs';
import { clock, hourOf, dateOf, dayLabel, shortDate, weekday, deg, uvLevel, aqiLevel, windDir, beaufort, conditionText, staleText, RAIN_YES, RAIN_MAYBE } from './format.mjs';
import { conditionArt, glyph, placeGlyph, sunArt, ADVICE_GLYPH } from './icons.mjs';
import { placeName, skyOf, fxHtml, soonLine, radarSay, dayOffSec, hoursFrom, dayPop, rainSummary, uvDays, adviceList, LIFE, KIND_COLOR, LEVEL_TAG, todayOf } from './cards.mjs';
import { rainSoon, radarHours, rainWord } from './soon.mjs';
import { OLD_MS } from './api.mjs';

const HOUR = 3_600_000;
const hh = n => W(`${n}時`, `${n}:00`);
const r1 = n => Math.round(n * 10) / 10;
// A part of 天氣: its name on the page in the kit's section head (a plain word,
// no glyph), the card under it; `end` sits at the head's right (全部, a key).
const part = (cls, title, body, end = '') => `<section class="ot-part ${cls}"><div class="q-section-head q-shd ot-head"><h2>${title}</h2>${end}</div><div class="ot-card">${body}</div></section>`;

// The sky's classes for a forecast (a cloudy day while there's none yet).
export const skyClass = f => (f?.now ? skyOf(f.now) : 'sky-cloud sky-day');

// ---- The head: the place's name, which opens 地點 -----------------------------------------------

function head(page) {
  const { title } = placeName(page);
  return `<header class="q-page-head wx-head"><h1><button class="wx-title" type="button" data-act="places" aria-label="${e(title)} · ${W('換地點', 'Change place')}"><span>${e(title)}</span>${glyph('chevD', { size: 20 })}</button></h1></header>`;
}

// ---- The day's track: where you'll be, or the day's turns --------------------------------------

// A stop: { t, label, v (its number), name, wet (a rain chance worth saying), now }.
// 我的行程: each new place in the next day, its first hour's temperature and
// the wettest hour of the stay. Elsewhere (or a day in one place): rain
// coming or easing, the high still to come or the night's low, the sun.
function stopsOf(f, page, now) {
  const tz = f.tz;
  const list = hoursFrom(f, now).slice(0, 25);
  if (!list.length) return [];
  const n = f.now || {};
  const sameDay = t => dateOf(t, tz) === dateOf(now, tz);
  const when = t => (sameDay(t) ? clock(t, tz) : `${dayLabel(dateOf(t, tz), now, tz)} ${clock(t, tz)}`);
  const out = [{ t: now, now: true, label: W('現在', 'Now'), v: deg(n.temp ?? list[0].temp), name: page.plan ? list[0].place || '' : conditionText(n.condition?.code, n.condition?.text) }];
  if (page.plan) {
    let cur = list[0].place;
    for (let i = 1; i < list.length && out.length < 4; i++) {
      if (!list[i].place || list[i].place === cur) continue;
      cur = list[i].place;
      const stay = [];
      for (let j = i; j < list.length && list[j].place === cur; j++) stay.push(list[j]);
      const wet = Math.max(...stay.map(x => x.pop ?? 0));
      out.push({ t: list[i].t, label: when(list[i].t), v: deg(list[i].temp), name: cur, wet: wet >= RAIN_MAYBE ? wet : null, place: true, sky: list[i] });
    }
  }
  if (out.length >= 3) return out;
  // The day's turns, in time order, after any places.
  const turns = [];
  const pops = list.filter(h => h.pop != null);
  const wetNow = (pops[0]?.pop ?? 0) >= RAIN_YES;
  const change = pops.slice(1, 13).find(h => (wetNow ? h.pop < RAIN_MAYBE : h.pop >= RAIN_YES));
  if (change) turns.push({ t: change.t, label: when(change.t), v: wetNow ? W('雨停', 'Dry') : `${change.pop}%`, name: wetNow ? '' : W('下雨', 'Rain'), wet: wetNow ? null : change.pop, icon: 'umbrella' });
  const day = list.filter(h => sameDay(h.t) && hourOf(h.t, tz) <= 17 && h.temp != null);
  const peak = day.slice(1).reduce((a, h) => (h.temp > (a?.temp ?? -99) ? h : a), null);
  const nowT = n.temp ?? list[0].temp;
  if (peak && peak.temp > (nowT ?? -99) + 0.5) turns.push({ t: peak.t, label: when(peak.t), v: deg(peak.temp), name: W('最高', 'High'), sky: peak });
  else {
    const night = list.slice(1, 16).filter(h => h.temp != null);
    const low = night.reduce((a, h) => (h.temp < (a?.temp ?? 99) ? h : a), null);
    if (low && low.temp < (nowT ?? 99) - 0.5) turns.push({ t: low.t, label: when(low.t), v: deg(low.temp), name: W('最低', 'Low'), sky: low });
  }
  for (const d of f.days || [])
    for (const [kind, t] of [['sunrise', d.sunrise], ['sunset', d.sunset]])
      if (t && t > now && t < now + 20 * HOUR && !turns.some(x => x.sun)) turns.push({ t, label: when(t), v: clock(t, tz), name: kind === 'sunset' ? W('日落', 'Sunset') : W('日出', 'Sunrise'), icon: kind, sun: true });
  const placesEnd = out[out.length - 1].t;
  return [...out, ...turns.filter(x => x.t > placesEnd).sort((a, b) => a.t - b.t)].slice(0, 4);
}

function dayTrack(f, page, now) {
  const stops = stopsOf(f, page, now);
  if (stops.length < 2) return '';
  const say = stops.map(s => [s.label, s.name, s.v, s.wet ? W(`雨 ${s.wet}%`, `rain ${s.wet}%`) : ''].filter(Boolean).join(' ')).join(W('，', ', '));
  return `<ol class="ot-day" style="--n:${stops.length}" aria-label="${e(say)}">${stops
    .map(
      s => `<li class="ot-stop${s.now ? ' is-now' : ''}${s.wet ? ' is-wet' : ''}"><i class="ot-dot" aria-hidden="true"></i><small>${e(s.label)}</small><b>${s.sky ? conditionArt(s.sky.condition?.code, s.sky.condition?.text, s.sky.day ?? true, { size: 22 }) : s.icon && !s.wet ? (s.sun ? sunArt(s.icon, { size: 22 }) : glyph(s.icon, { size: 17 })) : ''}${e(s.v)}</b>${
        // A place with rain coming: its name, then the chance on a line of its own (Jay 2026-11-10: 「☂30% · 學校」 cut in a quarter of a phone's card).
        s.place && s.wet
          ? `<span>${e(s.name)}</span><span class="ot-wet">${glyph('umbrella', { size: 13 })}${e(`${s.wet}%`)}</span>`
          : `<span>${s.wet ? `${glyph('umbrella', { size: 13 })}${e(`${s.wet}%`)}` : ''}${!s.wet ? e(s.name) : ''}</span>`
      }</li>`
    )
    .join('')}</ol>`;
}

// ---- Now: the place's sky, in its card ----------------------------------------------------------

function hero(f, page, { now, visit = 0 }) {
  const n = f?.now || {};
  const d = f ? todayOf(f, now) : null;
  const { sub } = placeName(page);
  const sky = f ? skyOf(n) : '';
  const date = f ? d?.date || dateOf(now, f.tz) : null;
  const open = f ? ` role="button" tabindex="0" data-day="${e(date)}" data-page="${e(page.key)}" aria-label="${W('今天的詳細預報', "Today's full forecast")}"` : '';
  // An old copy (OLD_MS) says so at the card's foot and fades its "now" until
  // the new one is in: 更新中 while asked, 無法更新 when the read failed, a tap tries again.
  const old = f && f.at && now - f.at > OLD_MS;
  const stale = old
    ? `<button class="wx-stale${page.error ? ' failed' : ''}" type="button" data-act="retry" data-page="${e(page.key)}"><i class="wx-spin" aria-hidden="true"></i><b class="wx-stale-busy">${W('更新中', 'Updating')}</b><b class="wx-stale-failed">${page.error ? W('無法更新', "Couldn't update") : W('等待更新', 'Not updated')}</b><span class="wx-stale-age" data-at="${Number(f.at)}">${e(staleText(f.at, now))}</span></button>`
    : '';
  const locate = page.askable && !page.pin && !page.plan ? `<button class="wx-relocate" type="button" data-locate>${glyph('locate', { size: 14 })}${W('定位', 'Locate')}</button>` : '';
  const eyebrow = `<p class="ot-eyebrow">${placeGlyph(page, { size: 15 })}<span>${e(sub) || '&nbsp;'}</span>${locate}</p>`;
  // Before the forecast: the card in the page's own graphite (no sky yet, so none guessed), its shapes shimmering.
  if (!f) return `<section class="ot-hero is-wait">${eyebrow}${page.error ? '' : '<div class="ot-now" aria-hidden="true"><i class="q-skel ot-sk-temp"></i></div><div class="ot-day-wait" aria-hidden="true"><i class="q-skel"></i></div>'}</section>`;
  // (A rain heads-up within two hours stays a line of its own; the track then says the rest.)
  const soon = old ? '' : soonLine(f, now, f.tz);
  return `<section class="ot-hero ${sky}${old ? ' wx-old' : ''}"${open}>
    ${fxHtml(sky)}
    ${eyebrow}
    <div class="ot-now">
      <div class="ot-temp" data-q-live="wx:temp:${e(page.key)}:${visit}">${n.temp == null ? '–' : Math.round(n.temp)}<i>°</i></div>
      <div class="ot-sky">
        <span class="ot-icon">${conditionArt(n.condition?.code, n.condition?.text, n.day ?? true, { size: 56 })}</span>
        <p class="ot-cond">${e(conditionText(n.condition?.code, n.condition?.text))}</p>
        <p class="ot-hilo"><span>${W('最高', 'H')} ${deg(d?.hi)}</span><span>${W('最低', 'L')} ${deg(d?.lo)}</span></p>
        <p class="ot-feel">${W('體感', 'Feels')} ${deg(n.feels)}</p>
      </div>
    </div>
    ${soon}
    ${old ? '' : dayTrack(f, page, now)}
    ${stale ? `<div class="ot-foot">${stale}</div>` : ''}
  </section>`;
}

// ---- The hours: one track, its dots as high as each hour is warm -------------------------------

// Sunrise and sunset in the hours shown: a narrow column of their own, after their hour.
function sunEvents(f, from, to) {
  const out = [];
  for (const d of f.days || []) for (const [kind, t] of [['sunrise', d.sunrise], ['sunset', d.sunset]]) if (t && t > from && t < to) out.push({ kind, t });
  return out.sort((a, b) => a.t - b.t);
}
// A smooth line through the points (Catmull-Rom as cubic Béziers).
function smooth(pts) {
  if (pts.length < 2) return '';
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] || pts[i], pts[i], pts[i + 1], pts[i + 2] || pts[i + 1]];
    d += ` C${r1(p1[0] + (p2[0] - p0[0]) / 6)},${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)},${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])},${r1(p2[1])}`;
  }
  return d;
}
const COL = 56;
const SUN_COL = 50;
const Y0 = 92;
const YH = 32;
function hourTrack(f, { now, key, page }) {
  const list = hoursFrom(f, now).slice(0, 25);
  if (list.length < 6) return '';
  const hs = list.map((h, i) => (i === 0 && f.now?.temp != null ? { ...h, temp: f.now.temp, condition: f.now.condition ?? h.condition, day: f.now.day ?? h.day } : h));
  const temps = hs.map(h => h.temp).filter(v => v != null);
  const hi = Math.max(...temps);
  const lo = Math.min(...temps);
  // (At least 4° of height, so a flat day reads flat.)
  const span = Math.max(4, hi - lo);
  const top = (hi + lo) / 2 + span / 2;
  const yOf = t => Y0 + ((top - t) / span) * YH;
  const sun = sunEvents(f, hs[0].t, hs[hs.length - 1].t + HOUR);
  // (The hours the radar sees a shower in say it: its picture and its word, Jay 2026-11-10.)
  const radar = radarHours(f, now);
  const cols = [];
  const pts = [];
  let x = 0;
  hs.forEach((h, i) => {
    const y = h.temp == null ? null : yOf(h.temp);
    if (y != null) pts.push([x + COL / 2, y]);
    cols.push({ h, i, x, y });
    x += COL;
    for (const s of sun.filter(s => s.t >= h.t && s.t < h.t + HOUR)) {
      cols.push({ s, x });
      x += SUN_COL;
    }
  });
  const width = x;
  const plan = page.plan && hs.some(h => h.place);
  const height = plan ? 166 : 138;
  const cells = cols
    .map(c => {
      if (c.s)
        return `<span class="ot-hr is-sun" style="width:${SUN_COL}px"><span class="ot-ht">${clock(c.s.t, f.tz)}</span><span class="ot-hi">${sunArt(c.s.kind, { size: 28 })}</span><span class="ot-hp">${c.s.kind === 'sunrise' ? W('日出', 'Rise') : W('日落', 'Set')}</span></span>`;
      const { h, i } = c;
      const date = dateOf(h.t, f.tz);
      const hr = hourOf(h.t, f.tz);
      const label = i === 0 ? W('現在', 'Now') : hr === 0 ? (en ? weekday(date) : dayLabel(date, now, f.tz)) : hh(hr);
      const rr = radar.get(h.t);
      const word = rr == null ? null : rainWord(rr);
      const pop = word ? W(word.zh, word.short || word.en) : h.pop >= 20 ? `${h.pop}%` : '';
      const art = word ? conditionArt(word.level >= 2 ? 'SHOWERS' : 'DRIZZLE', '', h.day ?? true, { size: 28 }) : conditionArt(h.condition?.code, h.condition?.text, h.day ?? true, { size: 28 });
      return `<button class="ot-hr q-press${i === 0 ? ' is-now' : ''}${word ? ' is-radar' : ''}" type="button" style="width:${COL}px" data-day="${e(date)}" data-page="${e(key)}" aria-label="${e(`${dayLabel(date, now, f.tz)} ${hh(hr)} ${deg(h.temp)}${pop ? ` ${W('降雨', 'rain')} ${pop}` : ''}`)}">
        <span class="ot-ht">${e(label)}</span>
        <span class="ot-hi">${art}</span>
        <span class="ot-hp">${e(pop)}</span>
        ${c.y == null ? '' : `<b class="ot-hv" style="top:${r1(c.y - (i === 0 ? 28 : 23))}px">${deg(h.temp)}</b>`}
      </button>`;
    })
    .join('');
  // 我的行程: under the hours, one rail of where you'll be. A stretch a place,
  // end to end with no gap (a sunrise or sunset column belongs to the hour it
  // falls in); a move is a ring on the rail where the new place's first hour
  // starts, its name just after; each name stays at the left edge while its
  // stretch is in view, so the place you scrolled into is always named.
  let band = '';
  if (plan) {
    const segs = [];
    for (const c of cols) {
      const last = segs[segs.length - 1];
      const w = c.h ? COL : SUN_COL;
      if (!c.h || (last && last.place === c.h.place)) {
        if (last) last.to = c.x + w;
        continue;
      }
      segs.push({ place: c.h.place || '', from: c.x, to: c.x + w });
    }
    band = segs
      .map((s, i) => `<span class="ot-where${i ? ' is-move' : ' is-first'}${i % 2 ? ' is-alt' : ''}${i === segs.length - 1 ? ' is-last' : ''}" style="left:${s.from}px;width:${s.to - s.from}px"><i></i><small>${e(s.place)}</small></span>`)
      .join('');
  }
  const nowDot = cols[0].y == null ? '' : `<i class="ot-now-dot" style="left:${COL / 2}px;top:${r1(cols[0].y)}px" aria-hidden="true"></i>`;
  const dots = pts.slice(1).map(([px, py]) => `<circle cx="${r1(px)}" cy="${r1(py)}" r="2.8"/>`).join('');
  return part(
    'ot-hours',
    W('每小時', 'Hourly'),
    `<div class="ot-hrs"><div class="ot-hrs-in" style="width:${width}px;height:${height}px">
      <svg class="ot-curve" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${smooth(pts)}"/>${dots}</svg>
      ${nowDot}${cells}${band}
    </div></div>`
  );
}

// ---- The ten days: side by side, the highs and the lows as two lines on one scale --------------

// Each day a column (its name, sky and rain chance), then the ten highs as one
// warm line and the ten lows as one cool line, the days' range shaded
// between: the week's warming and cooling reads at a glance, each number at
// its dot, the head naming the two lines in their own colours.
const SPAN = 60; // the scale's height (px), top high to bottom low
const LIFT = 22; // room for a high's number above its dot, a low's below
function skyline(f, { now, key, page, home = '' }) {
  const list = (f.days || []).filter(d => d.date >= dateOf(now, f.tz)).slice(0, 10);
  if (!list.length) return '';
  const lo = Math.min(...list.map(d => d.lo ?? Infinity));
  const hi = Math.max(...list.map(d => d.hi ?? -Infinity));
  // (At least 6° of height, so a steady week reads steady.)
  const span = Math.max(6, hi - lo);
  const top = (hi + lo) / 2 + span / 2;
  const yOf = t => LIFT + ((top - t) / span) * SPAN;
  const today = dateOf(now, f.tz);
  const n = list.length;
  const his = [];
  const los = [];
  const days = [];
  const cols = list
    .map((d, i) => {
      const isToday = d.date === today;
      const yh = d.hi == null ? null : yOf(d.hi);
      const yl = d.lo == null ? null : yOf(d.lo);
      if (yh != null) his.push([i * 100 + 50, yh]);
      if (yl != null) los.push([i * 100 + 50, yl]);
      const c = d.day?.condition || {};
      const pop = dayPop(f, d, now);
      const name = isToday ? W('今天', 'Today') : en ? weekday(d.date) : dayLabel(d.date, now, f.tz);
      // (我的行程: where you'll be that day, away from home first; all of them in its label.)
      const where = page.plan && d.places?.length > 1 ? d.places : [];
      const here = W('目前位置', 'Current location');
      // (The phone's own place, short as a day's column: 這裡.)
      if (page.plan) days.push(where.find(p => p !== home && p !== here) || d.places?.find(p => p !== here) || (d.places?.length ? W('這裡', 'Here') : ''));
      return `<button class="ot-sk q-press${isToday ? ' is-today' : ''}" type="button" data-day="${e(d.date)}" data-page="${e(key)}" aria-label="${e(`${name} ${shortDate(d.date)} ${deg(d.lo)}–${deg(d.hi)}${pop >= 20 ? ` ${W('降雨', 'rain')} ${pop}%` : ''}${where.length ? ` · ${where.join('·')}` : ''}`)}">
        <span class="ot-sk-d">${e(name)}<small>${e(shortDate(d.date))}</small></span>
        <span class="ot-sk-i">${conditionArt(c.code, c.text, true, { size: 28 })}</span>
        <span class="ot-sk-p">${pop >= 20 ? `${pop}%` : ''}</span>
        <span class="ot-sk-bar" style="height:${SPAN + 2 * LIFT}px">
          ${yh == null ? '' : `<b class="ot-sk-hi" style="top:${r1(yh - 21)}px">${deg(d.hi)}</b><i class="ot-sk-dot" style="top:${r1(yh)}px"></i>`}
          ${yl == null ? '' : `<i class="ot-sk-dot is-lo" style="top:${r1(yl)}px"></i><b class="ot-sk-lo" style="top:${r1(yl + 5)}px">${deg(d.lo)}</b>`}
        </span>
      </button>`;
    })
    .join('');
  // The lines, stretched to the columns (each column 100 units wide; the
  // strokes keep their width), the range shaded between them.
  const H = SPAN + 2 * LIFT;
  const back = los.slice().reverse();
  const band = his.length > 1 && los.length > 1 ? `<path class="ot-sk-band" d="${smooth(his)} L${smooth(back).slice(1)} Z"/>` : '';
  const lines = `<svg class="ot-sk-lines" viewBox="0 0 ${n * 100} ${H}" preserveAspectRatio="none" style="height:${H}px" aria-hidden="true">${band}<path class="ot-sk-hiline" d="${smooth(his)}"/><path class="ot-sk-loline" d="${smooth(los)}"/></svg>`;
  // 我的行程: the days' places as the hours' rail, a stretch a place, a ring
  // where it changes, every stretch named (a weekend at home too).
  const segs = [];
  days.forEach((p, i) => {
    const last = segs[segs.length - 1];
    if (last && last.place === p) last.to = i + 1;
    else segs.push({ place: p, from: i, to: i + 1 });
  });
  const rail = segs.length && segs.some(s => s.place)
    ? segs.map((s, i) => `<span class="ot-where is-days${i ? ' is-move' : ' is-first'}${i % 2 ? ' is-alt' : ''}${i === segs.length - 1 ? ' is-last' : ''}" style="grid-column:${s.from + 1} / ${s.to + 1}"><i></i><small>${e(s.place)}</small></span>`).join('')
    : '';
  const key2 = `<span class="ot-sk-key" aria-hidden="true"><i class="is-hi"></i>${W('最高', 'High')}<i class="is-lo"></i>${W('最低', 'Low')}</span>`;
  return part('ot-days', W(`${n} 天`, `${n} days`), `<div class="ot-sks"><div class="ot-sks-in" style="--n:${n}">${lines}${cols}${rail}</div></div>`, key2);
}

// ---- The readings: each on its own track, its dot where it is now -----------------------------

// A track filled to p (0–100) in one colour, the dot at its end.
const fill = (p, c, { from = 0 } = {}) => `<span class="ot-gt" style="--a:${r1(from)}%;--p:${r1(Math.min(100, Math.max(0, p)))}%;--c:${c}" aria-hidden="true"><i></i><b></b></span>`;
// The next day's rain: an hour each, as dark as its chance, the dot at now.
const rainTrack = list =>
  `<span class="ot-gr" aria-hidden="true">${list
    .slice(0, 24)
    .map(h => `<i style="--k:${h.pop == null || h.pop < 20 ? 0 : r1(0.2 + ((h.pop - 20) / 80) * 0.8)}"></i>`)
    .join('')}<b></b></span>`;
const UV_C = uv => (uv >= 11 ? 'var(--q-purple)' : uv >= 8 ? 'var(--q-red)' : uv >= 6 ? 'var(--q-orange)' : uv >= 3 ? 'var(--q-yellow)' : 'var(--q-green)');
const AQI_C = a => (a > 200 ? 'var(--q-purple)' : a > 150 ? 'var(--q-red)' : a > 100 ? 'var(--q-orange)' : a > 50 ? 'var(--q-yellow)' : 'var(--q-green)');
const gauge = ({ kind, metric = '', key = '', icon, name, sub = '', v, unit = '', track = '' }) => {
  const tag = metric ? 'button' : 'div';
  const k = `${track ? '' : ' no-track'}${sub ? '' : ' no-sub'}`;
  const open = metric ? ` type="button" data-metric="${metric}" data-page="${e(key)}"` : '';
  return `<${tag} class="ot-g k-${kind}${metric ? ' q-press' : ''}${k}"${open}>
    <span class="ot-g-ic">${glyph(icon, { size: 20 })}</span>
    <span class="ot-g-name">${name}</span>
    <b class="ot-g-v">${e(v)}${unit ? `<small>${e(unit)}</small>` : ''}</b>
    ${sub ? `<small class="ot-g-sub">${sub}</small>` : ''}
    ${track}
  </${tag}>`;
};
// A dry day's rain row: when rain comes next, from the second day's hours,
// then the day after; else that it stays dry that long. Never further: past
// three days a forecast's rain is a guess (Jay 2026-11-03), and the ten days
// below still show each day's chance.
const RAIN_DAYS = 3;
function nextRain(f, list, now) {
  const tz = f.tz;
  const h = list.slice(24, 48).find(x => (x.pop ?? 0) >= RAIN_MAYBE);
  if (h) return { v: W(`${dayLabel(dateOf(h.t, tz), now, tz)} ${hourOf(h.t, tz)}時起`, `${dayLabel(dateOf(h.t, tz), now, tz)} from ${hourOf(h.t, tz)}:00`), unit: `${h.pop}%` };
  const after = dateOf(list[Math.min(list.length, 48) - 1].t, tz);
  const days = (f.days || []).filter(d => d.date >= dateOf(now, tz)).slice(0, RAIN_DAYS);
  const wet = days.find(d => d.date > after && (d.pop ?? 0) >= RAIN_MAYBE);
  if (wet) return { v: W(`${dayLabel(wet.date, now, tz)}可能下雨`, `Rain likely ${dayLabel(wet.date, now, tz)}`), unit: `${wet.pop}%` };
  return { v: days.length >= RAIN_DAYS ? W('三天內不太會下雨', 'Dry for 3 days') : W('兩天內不太會下雨', 'Dry for 2 days') };
}
function readings(f, { now, key }) {
  const n = f.now || {};
  const list = hoursFrom(f, now);
  const out = [];
  // The radar's shower coming or here: the reading says it as the sky card does (cards.mjs radarSay).
  const soon = rainSoon(f, now);
  if (list.length && soon?.radar && soon.kind !== 'stop') {
    const s = radarSay(soon, now, f.tz);
    const wetDay = list.slice(0, 24).some(h => (h.pop ?? 0) >= RAIN_MAYBE);
    out.push(gauge({ kind: 'rain', metric: 'rain', key, icon: 'umbrella', name: W('降雨', 'Rain'), sub: e(`${W('雷達', 'Radar')} · ${s.lasts}`), v: soon.kind === 'now' ? W('正在下', 'Now') : W(`${clock(soon.at, f.tz)} 起`, clock(soon.at, f.tz)), unit: W(s.word.zh, ` ${s.word.en.toLowerCase()}`), track: wetDay ? rainTrack(list) : '' }));
  } else if (list.length) {
    // Rain in the track's day: its hours lit. A dry day (most days) is one line
    // saying when rain comes next, never an empty track (Jay 2026-11-03).
    if (list.slice(0, 24).some(h => (h.pop ?? 0) >= RAIN_MAYBE)) out.push(gauge({ kind: 'rain', metric: 'rain', key, icon: 'umbrella', name: W('降雨', 'Rain'), sub: e(rainSummary(list, f.tz, now, { short: true })), v: `${list[0].pop ?? '–'}`, unit: '%', track: rainTrack(list) }));
    else out.push(gauge({ kind: 'rain is-dry', metric: 'rain', key, icon: 'umbrella', name: W('降雨', 'Rain'), ...nextRain(f, list, now) }));
  }
  // UV: the strongest sun still to come today, after dark tomorrow's (never a 0 on an empty track).
  const uvDay = uvDays(f, now)
    .map(d => ({ date: d.date, peak: d.hours.filter(h => h.uv != null).reduce((a, h) => (h.uv > (a?.uv ?? -1) ? h : a), null) }))
    .find(d => d.peak?.uv >= 1);
  if (uvDay) {
    const { peak } = uvDay;
    const day = uvDay.date === dateOf(now, f.tz) ? '' : dayLabel(uvDay.date, now, f.tz);
    out.push(gauge({ kind: 'uv', metric: 'uv', key, icon: 'sun', name: W('紫外線', 'UV'), sub: e(W(`${day ? `${day} ` : ''}${hourOf(peak.t, f.tz)}時最高`, `${day ? `${day}, ` : ''}peak ${hourOf(peak.t, f.tz)}:00`)), v: `${peak.uv}`, unit: uvLevel(peak.uv) || '', track: fill((peak.uv / 11) * 100, UV_C(peak.uv)) }));
  }
  if (f.air) out.push(gauge({ kind: 'air', metric: 'air', key, icon: 'air', name: W('空氣', 'Air'), sub: e([aqiLevel(f.air.level), `PM2.5 ${f.air.pm25 ?? '–'}`].filter(Boolean).join(' · ')), v: `${f.air.aqi ?? '–'}`, track: fill(((f.air.aqi ?? 0) / 200) * 100, AQI_C(f.air.aqi ?? 0)) }));
  const hum = n.humidity ?? list[0]?.humidity;
  if (hum != null) {
    const dew = n.dew ?? list[0]?.dew;
    out.push(gauge({ kind: 'humidity', icon: 'drop', name: W('濕度', 'Humidity'), sub: dew != null ? e(`${W('露點', 'Dew point')} ${deg(dew)}`) : '', v: `${Math.round(hum)}`, unit: '%', track: fill(hum, 'var(--q-cyan)') }));
  }
  const w = n.wind || {};
  if (w.speed != null) {
    const bf = beaufort(w.speed);
    out.push(gauge({ kind: 'wind', icon: 'wind', name: W('風', 'Wind'), sub: e(`${windDir(w.dir)} ${Math.round(w.speed)} km/h${w.gust ? ` · ${W(`陣風 ${Math.round(w.gust)}`, `gusts ${Math.round(w.gust)}`)}` : ''}`), v: `${bf}`, unit: W('級', 'Bft'), track: fill((bf / 12) * 100, 'var(--q-teal)') }));
  }
  // The sun: the day's light from sunrise to sunset, the dot where it is now.
  const d = todayOf(f, now);
  if (d?.sunrise && d?.sunset) {
    const before = now < d.sunrise;
    const up = !before && now < d.sunset;
    const tomorrow = (f.days || []).find(x => x.date > d.date);
    const next = before ? ['sunrise', d.sunrise] : up ? ['sunset', d.sunset] : ['sunrise', tomorrow?.sunrise];
    const other = up ? `${W('日出', 'Sunrise')} ${clock(d.sunrise, f.tz)}` : `${W('日落', 'Sunset')} ${clock(d.sunset, f.tz)}`;
    const p = ((now - d.sunrise) / (d.sunset - d.sunrise)) * 100;
    if (next[1]) out.push(gauge({ kind: `sun${up ? '' : ' is-night'}`, icon: next[0], name: next[0] === 'sunrise' ? W('日出', 'Sunrise') : W('日落', 'Sunset'), sub: e(other), v: clock(next[1], f.tz), track: fill(up ? p : before ? 0 : 100, 'var(--q-yellow)') }));
  }
  if (n.feels != null) out.push(gauge({ kind: 'feels', icon: 'thermo', name: W('體感', 'Feels like'), sub: n.temp != null ? e(`${W('氣溫', 'Actual')} ${deg(n.temp)}`) : '', v: deg(n.feels) }));
  if (n.vis != null) out.push(gauge({ kind: 'vis', icon: 'eye', name: W('能見度', 'Visibility'), sub: n.cloud != null ? e(`${W('雲量', 'Cloud')} ${Math.round(n.cloud)}%`) : '', v: `${n.vis}`, unit: W('公里', 'km'), track: fill((Math.min(n.vis, 20) / 20) * 100, 'var(--q-gray)') }));
  return out.length ? part('ot-reads', W('今日數據', 'Today'), out.join('')) : '';
}

// ---- What to do -------------------------------------------------------------------------------

const SHOWN = 4;
function advice(f, { now, key }) {
  const { list, tomorrow } = adviceList(f, now);
  if (!list.length) return '';
  const rows = list
    .slice(0, SHOWN)
    .map(a => {
      const tag = LEVEL_TAG[a.level];
      return `<div class="ot-tip k-${e(a.kind)} lv-${e(a.level)}"><span class="ot-tip-ic" style="--t:var(--q-${KIND_COLOR[a.kind] || 'indigo'})">${glyph(ADVICE_GLYPH[a.kind] || 'bulb', { size: 19 })}</span><span class="ot-tip-text"><b>${e(LIFE[a.kind])}</b><small>${e(a.text)}</small></span>${tag ? `<span class="ot-flag">${tag[1]}</span>` : ''}</div>`;
    })
    .join('');
  const more = list.length > SHOWN ? `<button class="ot-more" type="button" data-act="advice" data-page="${e(key)}">${W('全部', 'All')}${glyph('chevR', { size: 14 })}</button>` : '';
  // (Framed by the Orbit AI mark, as every smart thing is (Jay 11-11).)
  const title = tomorrow ? W('明天的建議', 'Tomorrow') : W('今天的建議', 'Today');
  return part('ot-advice', kitUI.aiMarkHtml ? `<span class="q-h-ai">${kitUI.aiMarkHtml()}<span>${title}</span></span>` : title, rows, more);
}

// ---- 天氣: the whole page --------------------------------------------------------------------

// The owner's cards (版面) on 天氣, in their order: the readings, the advice,
// the ten days (更多資訊 is in today's sheet). 我的行程: what matters on the
// move, all shown.
// The cards to come, as graphite cards of their size: the hours' line, then the readings' rows.
const WAIT_ROW = '<i class="q-skel ot-wait-row"></i>';
const WAIT_PART = body => `<div class="ot-part" aria-hidden="true"><i class="q-skel ot-wait-cap"></i><div class="ot-card ot-wait">${body}</div></div>`;
const WAIT_CARDS = WAIT_PART('<i class="q-skel ot-wait-line"></i>') + WAIT_PART(WAIT_ROW.repeat(5));
const CARD = { metrics: readings, advice, days: skyline };
const shownCards = (page, cards = ['metrics', 'advice', 'days', 'info'], hidden = []) => (page.plan ? ['metrics', 'advice', 'days'] : cards.filter(k => !hidden.includes(k)));
// (`bare`: no head, for a place looked up, whose name is its sheet's title.)
export function nowHtml(f, page, { now, cards, hidden, home = '', visit = 0, bare = false } = {}) {
  const top = bare ? '' : head(page);
  // Before the forecast: the cards' shapes, shimmering; a failure says so, with 再試一次.
  if (!f)
    return `<div class="ot">${top}${hero(null, page, { now })}${page.error ? kitUI.emptyHtml({ icon: 'cloud', title: page.error, action: { label: W('再試一次', 'Try again'), data: { act: 'retry', page: page.key } } }) : `<div class="ot-waiting" role="status" aria-label="${W('正在取得天氣', 'Getting the weather')}">${WAIT_CARDS}</div>`}</div>`;
  const opts = { now, key: page.key, page, home, visit };
  const off = dayOffSec(f, now);
  // (The cards in columns on a wide screen, read in the phone's order: kit flowColumns.)
  const parts = [hero(f, page, opts), off ? `<div class="ot-card ot-off">${off}</div>` : '', hourTrack(f, opts), ...shownCards(page, cards, hidden).filter(k => CARD[k]).map(k => CARD[k](f, opts))].filter(Boolean);
  return `<div class="ot">${top}<div class="q-flow ot-flow">${parts.join('')}</div></div>`;
}

// ---- 地點: each place, its next twelve hours of rain on a track ---------------------------------

// rows: placeRows' plus { page, f } (the place's page and forecast).
export function placesHtml(rows, { brief, editing = false, now = Date.now() } = {}) {
  const row = r => {
    const f = r.f;
    const d = f ? todayOf(f, now) : null;
    const list = f ? hoursFrom(f, now).slice(0, 12) : [];
    // (Its rain track only where rain comes in the twelve hours: a dry place is no empty track.)
    const track = list.length >= 6 && list.some(h => (h.pop ?? 0) >= RAIN_MAYBE) ? `<span class="ot-pr" aria-hidden="true">${rainTrack(list)}<small>${e(W('現在', 'Now'))}</small><small>${e(hh(hourOf(list[list.length - 1].t, f.tz)))}</small></span>` : '';
    const tile = `<span class="q-tile" style="--t:var(--q-${r.color})">${r.glyph}</span>`;
    const text = `<span class="q-ritem-text"><span class="q-ritem-title">${e(r.title)}${r.on && !editing ? glyph('check', { size: 16, cls: 'wx-on' }) : ''}</span>${r.sub ? `<small>${e(r.sub)}</small>` : ''}${editing ? '' : track}</span>`;
    if (editing && r.pin) return `<button class="q-ritem chevron wx-place-row" type="button" data-act="edit-pin" data-pin="${e(r.pin)}" aria-label="${W(`編輯「${e(r.title)}」`, `Edit “${e(r.title)}”`)}">${tile}${text}</button>`;
    const nowCell = r.temp != null && !editing ? `<span class="ot-place-now">${r.art || ''}<b>${deg(r.temp)}</b>${d?.hi != null ? `<small>${deg(d.lo)} / ${deg(d.hi)}</small>` : ''}</span>` : '';
    return `<div class="q-ritem wx-place-row${r.on ? ' is-on' : ''}${editing ? ' is-still' : ''}"${editing ? '' : ` role="button" tabindex="0" data-go-key="${e(r.key)}"`} aria-current="${r.on ? 'true' : 'false'}">${tile}${text}${nowCell}</div>`;
  };
  const pins = rows.some(r => r.pin);
  // A place looked up (Jay 2026-11-06: tomorrow somewhere, one look, nothing saved):
  // the search field opens 搜尋地點; a result shows its weather, 加入 keeps it.
  const find = `<button class="q-search wx-find" type="button" data-act="find"><span>${W('搜尋地點', 'Search a place')}</span></button>`;
  const settings = `<div class="q-rowcard">
      <label class="q-ritem wx-brief"><span class="wx-quiet-tile q-tile">${glyph('bell')}</span><span class="q-ritem-text"><span class="q-ritem-title">${W('早晨天氣', 'Morning weather')}</span></span><input id="brief-time" class="wx-time" type="time" value="${e(brief)}"></label>
      <button class="q-ritem chevron" type="button" data-act="layout"><span class="wx-quiet-tile q-tile">${glyph('layout')}</span><span class="q-ritem-text"><span class="q-ritem-title">${W('版面', 'Layout')}</span></span></button>
    </div>`;
  const headRow = `<header class="q-page-head wx-head wx-head-row">${kitUI.navTitleHtml(W('地點', 'Places'))}${pins ? `<button class="wx-head-btn" type="button" data-act="edit-places" aria-pressed="${editing}">${editing ? W('完成', 'Done') : W('編輯', 'Edit')}</button>` : ''}</header>`;
  return `${headRow}<div class="q-cols wx-cols"><div class="wx-col">${find}<div class="q-rowcard wx-places">${rows.map(row).join('')}</div></div><div class="wx-col"><section class="q-section wx-section wx-settings"><div class="q-section-head q-shd"><h2>${W('設定', 'Settings')}</h2></div>${settings}</section></div></div>`;
}
