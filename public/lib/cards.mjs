// One place's weather: the sheets 天氣 opens (a day, a metric's graph, all
// the advice, 更多資訊), the typhoon's day off, and the rules the pages share
// (the sky, a place's name, a day's chance of rain, the advice in order);
// lib/pages.mjs draws 天氣 and 地點. One truth: one value for each thing, no
// sources named.

import { clock, hourOf, dateOf, dayLabel, shortDate, weekday, deg, pct, uvLevel, uvColor, aqiColor, moonName, conditionText, aqiLevel, rainLevel, wearFor, outFeel, updatedText } from './format.mjs';
import { W, en } from '#kit/lang.mjs';
import { adviceEn } from './advice-en.mjs';
import { rainSoon, rainWord } from './soon.mjs';
// An hour, as each language says it: 15時, 15:00.
const hh = n => W(`${n}時`, `${n}:00`);
import { conditionArt, glyph, sunArt, ADVICE_GLYPH } from './icons.mjs';
import { segHtml, escHtml as e } from '#kit/ui.mjs';
import { uvGraph, rainGraph, airGraph, dayCharts, mmKey } from './graph.mjs';
import { sunTimes, goldenHours } from './sun.mjs';
import { placeLines, placeIn } from './api.mjs';

const HOUR = 3_600_000;

// UV's hours: daylight only (6–18時).
export const uvCols = (hours, tz) => hours.filter(h => hourOf(h.t, tz) >= 6 && hourOf(h.t, tz) <= 18);

// The hours from this one on (the graphs start now).
export const hoursFrom = (f, now) => (f?.hours || []).filter(h => h.t + HOUR > now);
const today = (f, now) => f.days?.find(d => d.date === dateOf(now, f.tz)) || f.days?.[0] || null;
// A day's chance of rain, as every place shows it: today's is the highest of
// the hours still ahead (where you'll be then: the hourly graph's), not the
// forecast's whole day with its gone hours; the line, the graphs and the 10
// days say the same (TRUTH §14).
export function dayPop(f, d, now) {
  if (!d || d.date !== dateOf(now, f.tz)) return d?.pop ?? null;
  const ahead = hoursFrom(f, now).filter(h => dateOf(h.t, f.tz) === d.date && h.pop != null);
  return ahead.length ? Math.max(...ahead.map(h => h.pop)) : d.pop ?? null;
}

// The sky behind the top: by the weather now, day or night.
function skyOf(n) {
  const c = String(n?.condition?.code || '').toUpperCase();
  const t = String(n?.condition?.text || '');
  const kind = /THUNDER/.test(c) || /雷/.test(t) ? 'storm' : /RAIN|SHOWER|DRIZZLE/.test(c) || /雨/.test(t) ? 'rain' : /PARTLY|MOSTLY_CLEAR|MOSTLY_SUNNY/.test(c) || /多雲/.test(t) ? 'part' : /CLOUDY|OVERCAST|FOG|HAZE/.test(c) || /陰|霧/.test(t) ? 'cloud' : 'clear';
  return `sky-${kind} ${n?.day === false ? 'sky-night' : 'sky-day'}`;
}

// ---- The sky, and what's said at the top (lib/pages.mjs draws the page) ---------------------

// The sky's moving layer (rain, stars, drifting cloud), behind the words.
const FX = { clear: 3, part: 3, cloud: 3, rain: 14, storm: 14 };
const fxHtml = sky => {
  const kind = /sky-(\w+)/.exec(sky)?.[1] || 'cloud';
  const n = /sky-night/.test(sky) && (kind === 'clear' || kind === 'part') ? 12 : FX[kind] || 3;
  // Scattered the same way every time (no flicker on a redraw).
  const i = k => `<i style="--x:${(k * 37 + 11) % 100};--y:${(k * 53 + 7) % 64};--d:${-((k * 0.37) % 1).toFixed(2)};--s:${(0.6 + ((k * 29) % 10) / 20).toFixed(2)}"></i>`;
  return `<div class="wx-fx" aria-hidden="true">${Array.from({ length: n }, (_, k) => i(k)).join('')}</div>`;
};

// The heads-up under the numbers: rain starting (or easing) within 2 hours.
// The radar's shower is its own panel (Jay 2026-11-10: a small pill was easy
// to miss, and "3 毫米" told him nothing): what's coming in plain words and
// when, from when to when with what to do, every 5 minutes as bars, and what
// it rests on; the hours' heads-up stays one line.
export function soonLine(f, now, tz) {
  const r = rainSoon(f, now);
  if (!r) return '';
  if (r.radar && r.kind !== 'stop') return radarPanel(r, now, tz);
  if (r.radar) return `<p class="wx-soon wx-soon-stop">${glyph('umbrella', { size: 15 })}<span>${e(W('雨快停了 · 雷達看附近已沒有雨雲', 'Rain ending · no rain clouds near on the radar'))}</span></p>`;
  const near = r.mins <= 60;
  const at = hh(hourOf(r.at, tz));
  const text = r.kind === 'start' ? (near ? W(`約 ${r.mins} 分鐘後下雨 · ${r.pop}%`, `Rain in ~${r.mins} min · ${r.pop}%`) : W(`${at}起下雨 · ${r.pop}%`, `Rain from ${at} · ${r.pop}%`)) : near ? W(`雨約 ${r.mins} 分鐘後減弱`, `Easing in ~${r.mins} min`) : W(`${at}後雨勢減弱`, `Easing by ${at}`);
  return `<p class="wx-soon wx-soon-${r.kind}">${glyph('umbrella', { size: 15 })}<span>${e(text)}</span></p>`;
}

// What the radar's shower is called and said under it: one rule for the
// panel, the 降雨 reading and the hours (and the rain notice says the same,
// Orbit-Core weather.js radarNotice).
export function radarSay(r, now, tz) {
  const word = rainWord(r.peak);
  const w = W(word.zh, word.en.toLowerCase());
  const tip = W(word.tipZh, word.tipEn);
  const from = clock(r.at, tz);
  const head = r.kind === 'now' ? W(`正在下${word.zh}`, `${word.en} now`) : r.mins <= 60 ? W(`約 ${r.mins} 分鐘後下${word.zh}`, `${word.en} in ~${r.mins} min`) : W(`${from} 起下${word.zh}`, `${word.en} from ${from}`);
  const mins = r.to ? Math.max(5, Math.round((r.to - r.at) / 300_000) * 5) : null;
  const span = r.kind === 'now'
    ? r.to ? W(`約 ${clock(r.to, tz)} 停`, `stops ~${clock(r.to, tz)}`) : W(`${clock(r.until, tz)} 前不會停`, `on past ${clock(r.until, tz)}`)
    : r.to ? `${from}–${clock(r.to, tz)}` : W(`${from} 起，${clock(r.until, tz)} 前不會停`, `from ${from}, on past ${clock(r.until, tz)}`);
  const lasts = r.kind === 'now' ? span : mins ? W(`下約 ${mins} 分鐘`, `about ${mins} min`) : W(`${clock(r.until, tz)} 前不會停`, `on past ${clock(r.until, tz)}`);
  return { word, w, tip, head, span, lasts };
}

// Bars a step each (5 minutes) from now, as tall as the rain is hard, in its level's colour.
const barH = v => (v < 0.5 ? 0 : Math.round((0.28 + 0.72 * Math.min(1, Math.log1p(v) / Math.log1p(40))) * 100) / 100);
function radarPanel(r, now, tz) {
  const s = radarSay(r, now, tz);
  const n = r.bars.length;
  const bars = r.bars.map(b => `<i${b.v >= 0.5 ? ` class="lv-${rainWord(b.v).level}" style="--h:${barH(b.v)}"` : ''}></i>`).join('');
  // (Now at the left; the clock every half hour from now where it fits.)
  const ticks = [`<span style="left:0">${W('現在', 'Now')}</span>`];
  for (const k of [6, 12, 18]) if (k < n - 2) ticks.push(`<span style="left:${Math.round((k / n) * 1000) / 10}%">${clock(r.bars[k].t, tz)}</span>`);
  const said = [s.head, s.span, s.tip].join(W('，', ', '));
  return `<div class="wx-rain wx-rain-${r.kind} lv-${s.word.level}" role="note" aria-label="${e(said)}">
    <p class="wx-rain-head">${glyph('umbrella', { size: 18 })}<b>${e(s.head)}</b></p>
    <p class="wx-rain-sub">${e(`${s.span} · ${s.tip}`)}</p>
    <div class="wx-rain-bars" style="--n:${n}" aria-hidden="true">${bars}</div>
    <p class="wx-rain-axis" aria-hidden="true">${ticks.join('')}</p>
    <p class="wx-rain-note">${e(W('雷達追蹤雨雲 · 約 1.5 公里內 · 時間為估計', 'Radar-tracked · within ~1.5 km · times are estimates'))}</p>
  </div>`;
}

// A station by its township's English name in English (信義 → Xinyi), else left out:
// CWA names its stations only in Chinese.
const stationName = name => {
  if (!en) return e(name);
  const base = String(name).replace(/\(.*\)$/, '');
  for (const suffix of ['區', '鄉', '鎮', '市']) if (placeIn(base + suffix) !== base + suffix) return e(placeIn(base + suffix));
  return '';
};

// What a page is called and what's said under it, one rule for the head's
// title, the hero's eyebrow and the 地點 row.
export function placeName(page) {
  const place = placeLines(page.place);
  const title = page.plan ? W('我的行程', 'My day') : page.pin ? page.pin.name : place.main || W('目前位置', 'Current location');
  // (Here with no township's name yet: the title already says 目前位置, so not again under it.)
  // (A place looked up: its town is the title, its county under it. A pin
  // named after its town doesn't say the town twice.)
  const sub = page.plan
    ? `${W('現在在', 'Now at')} ${page.pin ? page.pin.name : W('目前位置', 'current location')}${place.main ? ` · ${place.main}` : ''}`
    : page.look
      ? place.sub
    : page.pin
      ? [place.main, place.sub].filter(x => x && x !== title).join(' · ')
      : [place.sub, page.note || (place.main ? W('目前位置', 'Current location') : '')].filter(Boolean).join(' · ');
  return { title, sub };
}

// ---- 颱風: the day off -------------------------------------------------------------------
//
// Only while CWA has a typhoon warning out (the proxy's `dayOff`): the
// county's own word once 人事行政總處 lists it, else the chance for the day
// in question (today until 10:00, then tomorrow) with what it rests on.
const OFF_TAG = { all: ['red', W('停班停課', 'Closed')], class: ['red', W('停課', 'No school')], work: ['red', W('停班', 'No work')], wait: ['', W('未公布', 'Pending')] };
const CLOSED = new Set(['all', 'class', 'work']);
const chanceColor = p => (p >= 60 ? 'red' : p >= 30 ? 'orange' : 'green');
// A notice's place, short (尖石鄉玉峰國民小學 → 尖石鄉 玉峰國小; '' for the
// whole county), and its day and hour (今天下午04:00起 → 今天 16:00 起).
const shortPlace = p =>
  p
    .replace(/國民小學/g, '國小')
    .replace(/國民中學/g, '國中')
    .replace(/高級中等學校|高級中學/g, '高中')
    .replace(/^(.{1,3}?[鄉鎮市區])(?=.)/, '$1 ')
    .trim();
export function offNote(l) {
  const m = /^([^\d\s:：][^\d:：]{0,40})[:：]\s*([\s\S]*)$/.exec(l.text);
  const place = m ? shortPlace(m[1]) : '';
  const rest = m ? m[2] : l.text;
  const w = /^(今天|今日|明天|明日)?\s*(上午|中午|下午|晚上)?\s*(\d{1,2})?[:：時]?(\d{2})?\s*(起)?/.exec(rest) || [];
  const day = /明/.test(w[1] || '') ? W('明天', 'Tomorrow') : w[1] ? W('今天', 'Today') : '';
  let hour = '';
  if (w[3] != null) {
    let h = Number(w[3]);
    if (/下午|晚上/.test(w[2] || '') && h < 12) h += 12;
    hour = `${String(h).padStart(2, '0')}:${w[4] || '00'}`;
  }
  const when = hour ? `${day ? `${day} ` : ''}${W(`${hour} 起`, `from ${hour}`)}` : W(`${day}${w[2] || ''}`, [day, { 上午: 'morning', 中午: 'noon', 下午: 'afternoon', 晚上: 'evening' }[w[2]]].filter(Boolean).join(' '));
  return { place, when, off: l.off, at: l.at ?? null, hour, day: /明/.test(w[1] || '') ? 'tomorrow' : w[1] ? 'today' : '' };
}
// Notices grouped by place (first seen first), each group's tag its most closed notice.
const OFF_RANK = { all: 4, class: 3, work: 3, open: 1, wait: 0 };
export function offGroups(lines) {
  const by = new Map();
  for (const l of lines || []) {
    const n = offNote(l);
    const g = by.get(n.place) || { place: n.place, notes: [], off: n.off };
    g.notes.push(n);
    if ((OFF_RANK[n.off] ?? 1) > (OFF_RANK[g.off] ?? 1)) g.off = n.off;
    by.set(n.place, g);
  }
  return [...by.values()];
}
export function dayOffSec(f, now) {
  const d = f?.dayOff;
  // (An old copy's, or a day gone by: not shown.)
  if (!d || !f.at || now - f.at > 3 * HOUR || d.date < dateOf(now, f.tz)) return '';
  const storm = en ? `Typhoon ${d.nameEn ? d.nameEn[0] + d.nameEn.slice(1).toLowerCase() : ''}`.trim() : `颱風${d.name ? ` ${d.name}` : ''}`;
  const tile = color => `<span class="q-tile wx-life-icon" style="--t:var(--q-${color})">${glyph('typhoon', { size: 22 })}</span>`;
  // One row a place (its notices together): the place, short, as the title;
  // each notice's day and hour, and when it was announced, under it.
  const announced = t => {
    const day = dateOf(t, f.tz);
    const pre = day === dateOf(now, f.tz) ? '' : day === dateOf(now - 86_400_000, f.tz) ? W('昨天 ', 'yesterday ') : `${shortDate(day)} `;
    return W(`${pre}${clock(t, f.tz)} 公布`, `${pre}${clock(t, f.tz)}`);
  };
  const said = (o, n = 3) => {
    // (The whole county decided: that row alone; its towns are part of it.)
    const all = offGroups(o.lines);
    const county = all.find(g => !g.place && g.off !== 'wait');
    return (county ? [county] : all)
      .slice(0, n)
      .map(g => {
        const tag = OFF_TAG[g.off] || ['green', W('照常', 'Open')];
        const mixed = new Set(g.notes.map(x => x.off)).size > 1;
        // (Today from an hour, then tomorrow, alike: one stretch, 16:00 起至明天.)
        const run = !mixed && g.notes.length === 2 && g.notes[0].hour && g.notes[0].day === 'today' && g.notes[1].day === 'tomorrow' && !g.notes[1].hour;
        const when = run ? [W(`${g.notes[0].hour} 至明天`, `${g.notes[0].hour} to tomorrow`)] : g.notes.map(x => [x.when, mixed ? (OFF_TAG[x.off] || ['', W('照常', 'Open')])[1] : ''].filter(Boolean).join(' ')).filter(Boolean);
        // (When the decision first showed on 人事行政總處's page, its day said when not today; unknown: left out.)
        const t0 = Math.min(...g.notes.map(x => x.at).filter(Boolean));
        const said = Number.isFinite(t0) ? announced(t0) : '';
        const sub = [when.join(W('、', ', ')), said].filter(Boolean).join(' · ');
        const title = placeIn(g.place || f.place?.county || '') || W('全縣市', 'Whole county');
        return `<div class="q-ritem wx-life wx-dayoff wx-dayoff-note">${tile(CLOSED.has(g.off) ? 'red' : g.off === 'wait' ? 'gray' : 'green')}<span class="q-ritem-text"><span class="q-ritem-title">${e(title)}</span><small class="q-fit">${e(sub)}</small></span><span class="q-tag ${tag[0]}">${tag[1]}</span></div>`;
      });
  };
  let rows;
  if (d.official) rows = said(d.official);
  else {
    const w = d.why || {};
    const gustFirst = (w.gust ?? 0) / 10 >= (w.wind ?? 0) / 7;
    // (The two that weigh most: neighbours' word, the warning, then wind and rain.)
    const parts = [
      w.nearClosed ? W(`鄰近 ${w.nearClosed} 縣市停班`, `${w.nearClosed} nearby closed`) : '',
      w.land ? W('陸上警報', 'Land alert') : w.reach ? W('暴風圈接近', 'Storm near') : '',
      gustFirst ? (w.gust != null ? W(`陣風 ${w.gust} 級`, `Gusts ${w.gust}`) : '') : W(`${w.wind} 級風`, `Force ${w.wind}`),
      w.mm >= 50 ? `${w.mm} mm` : ''
    ]
      .filter(Boolean)
      .slice(0, 2);
    // (The storm gone by then, the chance next to nothing: no row for it.)
    rows = d.chance < 5 ? [] : [`<div class="q-ritem wx-life wx-dayoff">${tile(chanceColor(d.chance))}<span class="q-ritem-text"><span class="q-ritem-title">${W(`${dayLabel(d.date, now, f.tz)}停班停課機率`, `${dayLabel(d.date, now, f.tz)}'s day off`)}</span><small class="q-fit">${e(parts.join(' · '))}</small></span><b class="wx-dayoff-p" style="--c:var(--q-${chanceColor(d.chance)})">${d.chance}<small>%</small></b></div>`];
  }
  // (Towns already decided, under the county's chance.)
  if (!d.official && d.local) rows.push(...said(d.local, 2));
  if (!rows.length) return '';
  return sec('wx-dayoff-sec', e(storm), `<div class="q-rowcard wx-lifegrid">${rows.join('')}</div>`);
}

// A section: a 20px head (the kit's q-section-head, 全部 on its right when
// there's more), then its body.
const sec = (cls, title, body, more = '') => `<section class="q-section wx-section ${cls}"><div class="q-section-head q-shd"><h2>${title}</h2>${more}</div>${body}</section>`;

// ---- The metrics' sheets: a graph each --------------------------------------------------------------
//
// A metric's sheet: its graph fitted to the width (no sideways scrolling);
// tabs pick the range. The app keeps the choice (`ranges`).

// Every sheet's tabs are days, the way a day is thought of: 今天 (now to
// midnight; from 18:00 it's 今晚, on to 07:00: the night and the way out in
// the morning), 明天 (all of it), then the days ahead. UV's are the
// daylight days ahead, named by their day.
const RANGES = {
  uv: [['d0', ''], ['d1', ''], ['10d', W('10 天', '10 days')]],
  rain: [['d0', ''], ['d1', W('明天', 'Tomorrow')], ['10d', W('10 天', '10 days')]],
  air: [['d0', ''], ['d1', W('明天', 'Tomorrow')], ['days', W('每天', 'Daily')]]
};
export const rangeOf = (kind, ranges) => (RANGES[kind]?.some(([k]) => k === ranges?.[kind]) ? ranges[kind] : RANGES[kind]?.[0][0]);
const evening = (now, tz) => hourOf(now, tz) >= 18;
const tonightName = (now, tz) => (evening(now, tz) ? W('今晚', 'Tonight') : W('今天', 'Today'));
// The hours of a day tab (`d0`, `d1`) out of a list of hours from now on.
function dayHours(list, range, tz, now) {
  const today = dateOf(now, tz);
  const tomorrow = dateOf(now + 86_400_000, tz);
  if (range === 'd1') return list.filter(h => dateOf(h.t, tz) === tomorrow);
  return list.filter(h => h.t + HOUR > now && (dateOf(h.t, tz) === today || (evening(now, tz) && dateOf(h.t, tz) === tomorrow && hourOf(h.t, tz) < 7)));
}
const dayTabs = (kind, now, tz) => RANGES[kind].map(([k, name]) => [k, name || tonightName(now, tz)]);

const card = ({ cls, icon, title, summary, big, graph, foot = '', tabs = '' }) => `
  <section class="wx-card wx-${cls}">
    <header class="wx-card-head">
      <span class="wx-ic">${icon}</span>
      <div class="wx-card-title"><h3>${title}</h3><p data-read="${cls}" aria-live="polite">${summary}</p></div>
      ${big}
    </header>
    ${tabs}
    <div class="wx-graphbox" data-box="${cls}" data-no-sheet-swipe>${graph}<i class="ch-xh" hidden></i><i class="ch-dh" hidden></i></div>
    ${foot ? `<p class="wx-key">${foot}</p>` : ''}
  </section>`;
// The kit's segmented control; its thumb slides from the range shown before.
const shownRange = {};
const tabsHtml = (kind, list, on) => {
  const from = shownRange[kind] ?? on;
  shownRange[kind] = on;
  return `<div class="wx-tabs">${segHtml(list, on, { from, attr: k => `data-range="${kind}:${k}"`, esc: e })}</div>`;
};

// The 10 days, a column each (for the bars).
export function daysCols(f, now) {
  // (Today's chance of rain: dayPop's, as the 10-day row says it.)
  const today = dateOf(now, f.tz);
  return (f.days || [])
    .filter(d => d.date >= today)
    .slice(0, 10)
    .map(d => ({ date: d.date, label: en ? dayLabel(d.date, now, f.tz).slice(0, 3) : dayLabel(d.date, now, f.tz).replace(/^週/, ''), pop: dayPop(f, d, now), mm: d.mm, uvMax: d.uvMax, daily: true }));
}
// The daylight days ahead: [{ date, hours (6–18時, from now on) }].
export function uvDays(f, now) {
  const by = new Map();
  for (const h of uvCols(hoursFrom(f, now), f.tz)) {
    const d = dateOf(h.t, f.tz);
    if (!by.has(d)) by.set(d, []);
    by.get(d).push(h);
  }
  // (A day whose sun is down already, its last hour at 0: not a tab of its own.)
  return [...by.entries()].filter(([, hours]) => hours.length > 2 || hours.some(h => h.uv > 0)).map(([date, hours]) => ({ date, hours }));
}
// A card's columns for its range (the graph's, and the read-out's).
export function colsFor(kind, f, now, range) {
  if (!f) return [];
  if (kind === 'air') return range === 'days' || !airHours(f, now).length ? airCols(f, now) : dayHours(airHours(f, now), range, f.tz, now);
  if (range === '10d') return daysCols(f, now);
  if (kind === 'rain') return dayHours(hoursFrom(f, now), range, f.tz, now);
  if (kind === 'uv') return uvDays(f, now)[range === 'd1' ? 1 : 0]?.hours || [];
  return [];
}

function uvCard(f, { now, ranges }) {
  const hours = hoursFrom(f, now);
  if (!hours.some(h => h.uv != null)) return '';
  const nowUv = f.now?.uv ?? hours[0]?.uv;
  const big = `<div class="wx-big" style="--c:${uvColor(nowUv)}">${nowUv ?? '–'}<small>${uvLevel(nowUv) || ''}</small></div>`;
  const days = uvDays(f, now);
  const range = rangeOf('uv', ranges);
  // A day's peak and the hours to cover up.
  const dayPeak = d => {
    const list = (days.find(x => x.date === d)?.hours || []).filter(h => h.uv != null);
    if (!list.length) return null;
    const p = list.reduce((a, h) => (h.uv > a.uv ? h : a), list[0]);
    const sn = list.filter(h => h.uv >= 3);
    return p.uv >= 1 ? W(`最高 ${p.uv}${sn.length ? `・${hourOf(sn[0].t, f.tz)}–${hourOf(sn[sn.length - 1].t + HOUR, f.tz)}時防曬` : ''}`, `Peak ${p.uv}${sn.length ? `, cover up ${hourOf(sn[0].t, f.tz)}–${hourOf(sn[sn.length - 1].t + HOUR, f.tz)}h` : ''}`) : W('很弱', 'Very low');
  };
  const shown = range === '10d' ? null : days[range === 'd1' ? 1 : 0];
  // (The tab names the day.)
  const summary = shown ? dayPeak(shown.date) || '' : W('每天最高', 'Daily peak');
  const tabs = tabsHtml('uv', RANGES.uv.map(([k, name], i) => [k, name || (days[i] ? dayLabel(days[i].date, now, f.tz) : '')]).filter(([, name]) => name), range);
  const cols = colsFor('uv', f, now, range);
  return card({ cls: 'uv', icon: glyph('sun'), title: W('紫外線', 'UV index'), summary: e(summary), big, tabs, graph: uvGraph(cols, { tz: f.tz, now, daily: range === '10d' }) });
}

// The next rain, said once.
// When it starts and how high it gets, from the hours the graph shows
// (`hours`), so the line and the graph's peak are the same number.
// `short`: for a small tile (one line): when it starts, today without saying so.
export function rainSummary(hours, tz, now, { short = false } = {}) {
  const list = hours.slice(0, 48).filter(h => h.pop != null);
  const peakFrom = from => list.filter(h => h.t >= from.t && dateOf(h.t, tz) === dateOf(from.t, tz)).reduce((a, h) => (h.pop > a.pop ? h : a), from);
  const next = list.find(h => h.pop >= 50);
  if (!next) {
    const top = list.reduce((a, h) => (h.pop > (a?.pop ?? -1) ? h : a), null);
    if (short) return top && top.pop >= 30 ? W(`${hourOf(top.t, tz)}時最高 ${top.pop}%`, `Peak ${top.pop}% at ${hourOf(top.t, tz)}`) : W('兩天內不太會下雨', 'Dry for 2 days');
    return top && top.pop >= 30 ? W(`${dayLabel(dateOf(top.t, tz), now, tz)} ${hourOf(top.t, tz)}時最高 ${top.pop}%`, `Peak ${top.pop}% ${dayLabel(dateOf(top.t, tz), now, tz)} at ${hourOf(top.t, tz)}`) : W('兩天內不太會下雨', 'Little chance of rain for 2 days');
  }
  const top = peakFrom(next);
  const day = dateOf(next.t, tz) === dateOf(now, tz) ? '' : dayLabel(dateOf(next.t, tz), now, tz);
  // (In English a tile's day by its short name: "50% from Tomorrow 4:00" was cut at 320.)
  const dayShort = day ? weekday(dateOf(next.t, tz)) : '';
  if (short) return next.t <= now ? W(`正在下 ${next.pop}%`, `Raining ${next.pop}%`) : W(`${day}${hourOf(next.t, tz)}時起 ${next.pop}%`, `${next.pop}% from ${dayShort ? `${dayShort} ` : ''}${hourOf(next.t, tz)}:00`);
  const peak = top !== next && top.pop > next.pop ? W(`・最高 ${top.pop}%`, `, peak ${top.pop}%`) : '';
  return next.t <= now ? W(`正在下 ${next.pop}%${peak}`, `Raining ${next.pop}%${peak}`) : W(`${day ? `${day} ` : ''}${hourOf(next.t, tz)}時起 ${next.pop}%${peak}`, `${next.pop}% from ${day ? `${day} ` : ''}${hourOf(next.t, tz)}:00${peak}`);
}

export function rainCard(f, { now, ranges }) {
  const hours = hoursFrom(f, now);
  if (!hours.length) return '';
  const pop = hours[0]?.pop;
  const big = `<div class="wx-big wx-rain-big">${pop ?? '–'}<small>%</small></div>`;
  const n = f.now || {};
  const range = rangeOf('rain', ranges);
  const extra = n.rainToday ? W(`今日已下 ${n.rainToday} mm`, `${n.rainToday} mm so far`) : '';
  const cols = colsFor('rain', f, now, range);
  return card({ cls: 'rain', icon: glyph('umbrella'), title: W('降雨機率', 'Chance of rain'), summary: e(rainSummary(hours, f.tz, now)), big, tabs: tabsHtml('rain', dayTabs('rain', now, f.tz), range), graph: rainGraph(cols, { tz: f.tz, daily: range === '10d', fromNow: range === 'd0' }), foot: [cols.some(c => c.mm >= (range === '10d' ? 0.5 : 0.1)) ? mmKey : '', extra ? `<span>${e(extra)}</span>` : ''].join('') });
}

// The air's columns: now (the station), then the forecast days.
export function airCols(f, now) {
  const a = f.air;
  if (!a) return [];
  const date = dateOf(now, f.tz);
  const days = (a.forecast?.days || []).filter(d => d.date >= date && d.aqi != null);
  return [...(a.aqi != null ? [{ label: W('現在', 'Now'), aqi: a.aqi, pm25: a.pm25, now: true }] : []), ...days.map(d => ({ date: d.date, label: dayLabel(d.date, now, f.tz), aqi: d.aqi, main: d.main, daily: true }))];
}

// The air's hours: its hourly forecast from now on (none where it has none).
const airHours = (f, now) => (f.air?.hourly || []).filter(h => h.t + HOUR > now && h.aqi != null);

export function airCard(f, { now, ranges }) {
  const a = f.air;
  if (!a) return '';
  const hourly = airHours(f, now).length > 0;
  const range = hourly ? rangeOf('air', ranges) : 'days';
  const cols = colsFor('air', f, now, range);
  const big = `<div class="wx-big" style="--c:${aqiColor(a.aqi)}">${a.aqi ?? '–'}<small>${e(aqiLevel(a.level))}</small></div>`;
  // (The days' worst is the graph's tallest bar: not said again here, so the line stays one line.)
  const summary = `PM2.5 ${a.pm25 ?? '–'}`;
  const daily = range === 'days';
  return card({ cls: 'air', icon: glyph('air'), title: W('空氣品質', 'Air quality'), summary, big, tabs: hourly ? tabsHtml('air', dayTabs('air', now, f.tz), range) : '', graph: airGraph(cols, { tz: f.tz, daily, fromNow: range === 'd0' }) });
}

// ---- What to do: the advice rows -----------------------------------------------------------

const LIFE = {
  umbrella: W('雨傘', 'Umbrella'), commute: W('通勤', 'Commute'), wear: W('穿著', 'Clothes'), sun: W('防曬', 'Sun'), run: W('跑步', 'Running'), laundry: W('曬衣', 'Laundry'), sleep: W('睡覺', 'Sleep'), window: W('開窗', 'Windows'), mask: W('口罩', 'Mask'), heat: W('炎熱', 'Heat'), carwash: W('洗車', 'Car wash'),
  move: W('移動', 'On the move'), pe: W('體育課', 'PE'), diff: W('兩地溫差', 'Between places'), weekend: W('週末', 'Weekend'), humid: W('除濕', 'Damp'), temp: W('氣溫', 'Temperature'), wind: W('強風', 'Wind'), thunder: W('雷雨', 'Storms'), fog: W('起霧', 'Fog')
};
const ORDER = ['thunder', 'umbrella', 'pe', 'move', 'commute', 'wear', 'temp', 'sun', 'wind', 'fog', 'diff', 'run', 'laundry', 'weekend', 'sleep', 'humid', 'window', 'mask', 'heat', 'carwash'];
// What needs doing first (a warning), then the usual order.
const URGENT = { yes: 0, bad: 0, hot: 0, maybe: 1, good: 2, none: 3 };

// One piece of advice, a row: its glyph on a colour tile, the name, what to
// do, and a tag when the level asks for attention (or says go).
const KIND_COLOR = { umbrella: 'blue', commute: 'indigo', move: 'indigo', pe: 'green', wear: 'orange', temp: 'orange', sun: 'orange', run: 'green', laundry: 'teal', sleep: 'indigo', window: 'mint', mask: 'red', heat: 'red', wind: 'teal', thunder: 'purple', fog: 'cyan', diff: 'purple', weekend: 'pink', humid: 'cyan', carwash: 'blue' };
const LEVEL_TAG = { yes: ['orange', W('留意', 'Heads up')], hot: ['orange', W('留意', 'Heads up')], bad: ['orange', W('留意', 'Heads up')] };
const lifeTile = ({ kind, level, title, text }) => {
  const tag = LEVEL_TAG[level];
  return `<div class="q-ritem wx-life lv-${e(level)} k-${e(kind)}"><span class="q-tile wx-life-icon" style="--t:var(--q-${KIND_COLOR[kind] || 'indigo'})">${glyph(ADVICE_GLYPH[kind] || 'bulb', { size: 22 })}</span><span class="q-ritem-text"><span class="q-ritem-title">${e(title)}</span><small>${e(text)}</small></span>${tag ? `<span class="q-tag ${tag[0]}">${tag[1]}</span>` : ''}</div>`;
};
// The advice, most pressing first ({ list, tomorrow }): the proxy's words
// (in English, what adviceEn can read), and whose day they are: today, or
// tomorrow once today's outing hours are over.
function adviceList(f, now) {
  const list = (f.advice || [])
    .map(a => ({ ...a, text: a.text.replace(/^[^：]+：/, '') }))
    // (The route's own advice, `own`, is in the reader's language already.)
    .map(a => (en && !a.own ? { ...a, text: adviceEn(a.text) } : a))
    .filter(a => LIFE[a.kind] && a.text)
    .sort((a, b) => (URGENT[a.level] ?? 3) - (URGENT[b.level] ?? 3) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const first = list.find(a => a.week?.days?.length)?.week.days[0].date;
  return { list, tomorrow: Boolean(first && now != null && first !== dateOf(now, f.tz)) };
}
const adviceTitle = tomorrow => (tomorrow ? W('明天的建議', 'Tomorrow') : W('今天的建議', 'Today'));
const adviceRows = list => list.map(a => lifeTile({ kind: a.kind, level: a.level, title: LIFE[a.kind], text: a.text })).join('');

// The sheet: every row.
export function adviceSheet(f, { now } = {}) {
  const { list, tomorrow } = adviceList(f, now);
  return `<div class="q-sheet-head"><h2>${adviceTitle(tomorrow)}</h2><button class="q-close" type="button" data-act="close" aria-label="${W('關閉', 'Close')}">×</button></div><div class="q-rowcard wx-lifegrid">${adviceRows(list)}</div>`;
}

// ---- The days ------------------------------------------------------------------------------

// A day's recommendations, from its own hours (today's: the hours still
// ahead, never a rain or a sun already gone): what to bring and wear, when
// to run, whether to wash and hang laundry, sun, heat, air, storms, wind.
export function dayTips(f, date, now) {
  const tz = f.tz;
  const d = f.days?.find(x => x.date === date);
  const hours = (f.hours || []).filter(h => dateOf(h.t, tz) === date && (date !== dateOf(now, tz) || h.t + HOUR > now));
  const awake = hours.filter(h => hourOf(h.t, tz) >= 6 && hourOf(h.t, tz) < 22);
  const tips = [];
  const at = h => hh(hourOf(h.t, tz));
  // Rain.
  const wet = awake.reduce((a, h) => ((h.pop ?? -1) > (a?.pop ?? -1) ? h : a), null);
  const pop = wet?.pop ?? dayPop(f, d, now);
  const rain = rainLevel(pop);
  if (pop != null) tips.push({ k: 'umbrella', title: LIFE.umbrella, lv: rain, text: rain === 'none' ? W('不用帶', 'Not needed') : en ? (wet ? `${wet.pop}% at ${at(wet)}` : rain === 'yes' ? 'Take one' : 'Maybe') : `${rain === 'yes' ? '要帶' : '摺疊傘'}${wet ? `，${at(wet)} ${wet.pop}%` : ''}` });
  // Clothes: a third of the way from the day's coolest to warmest feel.
  const fl = awake.map(h => h.feels ?? h.temp).filter(v => v != null);
  const lo = fl.length ? Math.min(...fl) : d?.feelsLo ?? d?.lo;
  const hi = fl.length ? Math.max(...fl) : d?.feelsHi ?? d?.hi;
  if (lo != null && hi != null) tips.push({ k: 'wear', title: LIFE.wear, text: `${wearFor(outFeel(lo, hi)).text}${hi - lo >= 7 ? W('，早晚加件', ', layer up') : ` ${Math.round(lo) === Math.round(hi) ? '' : `${Math.round(lo)}–`}${Math.round(hi)}°`}`, lv: hi - lo >= 7 ? 'maybe' : 'none' });
  // Running: the best 2 hours, 6–20時.
  const cost = h => {
    const v = h.feels ?? h.temp;
    return (h.pop ?? 0) * 1.2 + Math.max(0, v - 24) * 6 + Math.max(0, 16 - v) * 4 + Math.max(0, (h.uv ?? 0) - 5) * 8 + ((h.thunder ?? 0) >= 40 ? 30 : 0);
  };
  const runH = hours.filter(h => hourOf(h.t, tz) >= 6 && hourOf(h.t, tz) <= 20 && (h.feels ?? h.temp) != null);
  let best = null;
  for (let i = 0; i + 1 < runH.length; i++) {
    if (runH[i + 1].t - runH[i].t !== HOUR) continue;
    const c = (cost(runH[i]) + cost(runH[i + 1])) / 2;
    if (!best || c < best.c) best = { c, h: runH[i] };
  }
  if (best) tips.push({ k: 'run', title: LIFE.run, text: `${hourOf(best.h.t, tz)}–${hourOf(best.h.t, tz) + 2}${W('時', 'h')} ${Math.round(best.h.feels ?? best.h.temp)}°`, lv: best.c < 45 ? 'good' : 'none' });
  // Laundry: dry and not overcast.
  if (d) {
    const p = dayPop(f, d, now);
    const dry = p != null && p < 20 && !/^CLOUDY|RAIN|SHOWER|THUNDER|DRIZZLE/.test(d.day?.condition?.code || '');
    tips.push({ k: 'laundry', title: LIFE.laundry, text: dry ? W('適合', 'Good day for it') : p != null && p < 40 ? W('乾得慢', 'Slow to dry') : W('用烘乾', 'Use the dryer'), lv: dry ? 'good' : p >= 40 ? 'bad' : 'none' });
  }
  // Sun.
  const sunny = hours.filter(h => h.uv >= 3);
  if (sunny.length) {
    const top = Math.max(...sunny.map(h => h.uv));
    tips.push({ k: 'sun', title: LIFE.sun, text: `${hourOf(sunny[0].t, tz)}–${hourOf(sunny[sunny.length - 1].t, tz) + 1}${W('時', 'h')} UV ${top}`, lv: top >= 6 ? 'yes' : 'none' });
  }
  // Heat, air, storms, wind (only when they matter).
  if (hi >= 34) tips.push({ k: 'heat', title: LIFE.heat, text: W(`體感 ${Math.round(hi)}°，多喝水`, `Feels ${Math.round(hi)}°, drink water`), lv: 'yes' });
  const air = f.air?.forecast?.days?.find(x => x.date === date);
  if (air?.aqi > 100) tips.push({ k: 'mask', title: LIFE.mask, text: W(`空氣${air.aqi > 150 ? '很差' : '不佳'}，AQI ${air.aqi}`, `${air.aqi > 150 ? 'Very poor' : 'Poor'} air, AQI ${air.aqi}`), lv: 'yes' });
  const storm = hours.filter(h => h.thunder >= 40);
  if (storm.length) tips.push({ k: 'thunder', title: LIFE.thunder, text: W(`${hourOf(storm[0].t, tz)}–${hourOf(storm[storm.length - 1].t, tz) + 1}時可能打雷`, `Thunder likely ${hourOf(storm[0].t, tz)}–${hourOf(storm[storm.length - 1].t, tz) + 1}h`), lv: 'yes' });
  const gust = hours.reduce((a, h) => ((h.wind?.gust ?? 0) > (a?.wind?.gust ?? 0) ? h : a), null);
  if (gust?.wind?.gust >= 50) tips.push({ k: 'wind', title: LIFE.wind, text: W(`${hourOf(gust.t, tz)}時陣風 ${Math.round(gust.wind.gust)} km/h`, `Gusts ${Math.round(gust.wind.gust)} km/h at ${hourOf(gust.t, tz)}:00`), lv: 'yes' });
  return tips;
}

// The hours a day's sheet draws. Today's are its earlier hours too (`past`:
// kept by the proxy and by the device from the last copies; the forecast
// itself starts at the hour now), so the graph late in the evening is still
// the whole day; a today with fewer than LATE_MIN hours left and nothing
// kept runs on into tomorrow morning (to MORNING_TO時): never no graph.
const LATE_MIN = 6;
const MORNING_TO = 6;
export function sheetHours(f, date, now) {
  const tz = f.tz;
  const all = f.hours || [];
  const own = all.filter(h => dateOf(h.t, tz) === date);
  const first = own[0]?.t ?? Infinity;
  const past = (f.past || []).filter(h => h.t < first && dateOf(h.t, tz) === date);
  const hours = [...past, ...own];
  if (date !== dateOf(now, tz) || hours.filter(h => h.temp != null).length >= LATE_MIN) return hours;
  const end = hours.length ? hours[hours.length - 1].t : now;
  return [...hours, ...all.filter(h => h.t > end && h.t - end < 12 * HOUR && dateOf(h.t, tz) !== date && hourOf(h.t, tz) <= MORNING_TO)];
}
// A new copy keeps today's earlier hours from the one it replaces (its own
// `past`, then its hours before the new copy's first), so the day sheet can
// draw them.
export function keepPast(old, f, now) {
  if (!f?.hours?.length || !old) return f;
  const tz = f.tz;
  const day = dateOf(now, tz);
  const first = f.hours[0].t;
  const byT = new Map();
  for (const h of [...(old.past || []), ...(old.hours || []), ...(f.past || [])]) if (h.t < first && dateOf(h.t, tz) === day) byT.set(h.t, h);
  return byT.size ? { ...f, past: [...byT.values()].sort((a, b) => a.t - b.t) } : f;
}

// The sheet for one day: its numbers, its charts (a finger on them reads
// each hour), and what to do that day (the days around it: the app's strip).
export function daySheet(f, date, { now, lat, lon }) {
  const d = f.days?.find(x => x.date === date);
  const hours = sheetHours(f, date, now);
  const s = d?.sunrise ? { sunrise: d.sunrise, sunset: d.sunset } : lat != null ? sunTimes(date, lat, lon) : null;
  const fc = f.air?.forecast?.days?.find(x => x.date === date);
  const c = d?.day?.condition || {};
  const tips = dayTips(f, date, now);
  const places = d?.places?.length ? d.places.join(' → ') : '';
  const sum = `<div class="wx-scrub-time"><b>${W('全天', 'All day')}</b><span>${e(places || conditionText(c.code, c.text) || '')}</span></div>
    <div class="wx-scrub-vals is-sum">
      <div><span>${W('最高 / 最低', 'High / low')}</span><b>${deg(d?.hi)} / ${deg(d?.lo)}</b><small>${W('體感', 'Feels')} ${deg(d?.feelsHi)} / ${deg(d?.feelsLo)}</small></div>
      <div><span>${W('降雨', 'Rain')}</span><b>${pct(d?.pop)}</b><small>${d?.mm ? `${d.mm} mm` : '&nbsp;'}</small></div>
      <div><span>${W('紫外線最高', 'UV high')}</span><b>${d?.uvMax ?? '–'}</b><small>${e(uvLevel(d?.uvMax) || '') || '&nbsp;'}</small></div>
      <div><span>${W('空氣最高', 'Air high')}</span><b>${fc?.aqi ?? '–'}</b><small>${fc ? `<i class="wx-lv" style="--c:${aqiColor(fc.aqi)}" aria-hidden="true"></i>${e(aqiLevel(fc.level))}` : '&nbsp;'}</small></div>
    </div>`;
  return `
    <div class="q-sheet-head">
      <span></span>
      <h2><span class="wx-day-icon">${conditionArt(c.code, c.text, true, { size: 30 })}</span><span>${dayLabel(date, now, f.tz) === weekday(date) ? '' : `${e(dayLabel(date, now, f.tz))} `}${shortDate(date)} ${weekday(date)}</span></h2>
      <button class="q-close" type="button" data-act="close" aria-label="${W('關閉', 'Close')}">×</button>
    </div>
    <div class="wx-dayg">
      <div class="wx-scrub" aria-live="polite" data-sum="1">${sum}</div>
      ${hours.filter(h => h.temp != null).length >= 4 ? `<div class="wx-dayg-plot" data-noswipe data-no-sheet-swipe>${dayCharts(hours, { tz: f.tz, now, date })}</div>` : `<p class="wx-foot">${W('沒有逐時預報', 'No hourly forecast')}</p>`}
    </div>
    ${tips.length ? `<h3 class="q-sheet-h">${W('這天的建議', 'For this day')}</h3><div class="q-rowcard wx-lifegrid">${tips.map(t => lifeTile({ kind: t.k, level: t.lv, title: t.title, text: t.text })).join('')}</div>` : ''}
    <div class="wx-grid q-even">
      ${d?.day ? `<div class="wx-half">${conditionArt(d.day.condition?.code, d.day.condition?.text, true, { size: 40 })}<span>${W('白天', 'Day')}</span><b>${e(conditionText(d.day.condition?.code, d.day.condition?.text))}</b><small>${W('降雨', 'Rain')} ${pct(d.day.pop)}</small></div>` : ''}
      ${d?.night ? `<div class="wx-half">${conditionArt(d.night.condition?.code, d.night.condition?.text, false, { size: 40 })}<span>${W('晚上', 'Night')}</span><b>${e(conditionText(d.night.condition?.code, d.night.condition?.text))}</b><small>${W('降雨', 'Rain')} ${pct(d.night.pop)}</small></div>` : ''}
      ${s ? `<div class="wx-half">${sunArt('sunrise', { size: 40 })}<span>${W('日出 / 日落', 'Sunrise / sunset')}</span><b>${clock(s.sunrise, f.tz)} / ${clock(s.sunset, f.tz)}</b></div>` : ''}
    </div>`;
}

// ---- Everything else (today's sheet, under the day) ---------------------------------------

export function infoCard(f, { now, lat, lon, page }) {
  const n = f.now || {};
  // (The hour now and three on, as the top reads them: an old copy's first hours are gone.)
  const [h0, , , h3] = hoursFrom(f, now);
  const date = dateOf(now, f.tz);
  const d = today(f, now);
  const s = d?.sunrise ? { sunrise: d.sunrise, sunset: d.sunset } : lat != null ? sunTimes(date, lat, lon) : null;
  const g = s && goldenHours(s);
  const len = s ? s.sunset - s.sunrise : 0;
  const moon = moonName(d?.moon?.phase);
  const trend = n.pressure != null && h3?.pressure != null ? (h3.pressure - n.pressure > 0.5 ? ' ↑' : h3.pressure - n.pressure < -0.5 ? ' ↓' : ' →') : '';
  // (The place the header shows: one rule, placeLines.)
  const where = placeLines(page.place);
  const items = [
    [glyph('gauge'), W('氣壓', 'Pressure'), n.pressure != null ? `${Math.round(n.pressure)} hPa${trend}` : '–', trend ? W('未來 3 小時', 'Next 3 hours') : '', 'indigo'],
    [glyph('eye'), W('能見度', 'Visibility'), n.vis != null ? W(`${n.vis} 公里`, `${n.vis} km`) : '–', `${W('雲量', 'Cloud')} ${pct(n.cloud ?? h0?.cloud)}`, 'teal'],
    [glyph('rain'), W('今日雨量', 'Rain today'), n.rainToday != null ? `${n.rainToday} mm` : '–', n.rain1h != null ? W(`過去 1 小時 ${n.rain1h} mm`, `Last hour ${n.rain1h} mm`) : '', 'blue'],
    [glyph('bolt'), W('雷雨機率', 'Thunderstorms'), pct(h0?.thunder), '', 'purple'],
    [glyph('sunrise'), W('日出', 'Sunrise'), s ? clock(s.sunrise, f.tz) : '–', g ? `${W('黃金時刻', 'Golden')} ${clock(g.morning[0], f.tz)}–${clock(g.morning[1], f.tz)}` : '', 'orange'],
    [glyph('sunset'), W('日落', 'Sunset'), s ? clock(s.sunset, f.tz) : '–', g ? `${W('黃金時刻', 'Golden')} ${clock(g.evening[0], f.tz)}–${clock(g.evening[1], f.tz)}` : '', 'pink'],
    [glyph('clock'), W('日照長度', 'Daylight'), s ? W(`${Math.floor(len / HOUR)} 小時 ${Math.round((len % HOUR) / 60_000)} 分`, `${Math.floor(len / HOUR)} h ${Math.round((len % HOUR) / 60_000)} min`) : '–', '', 'yellow'],
    [glyph('moon'), W('月相', 'Moon'), moon ? e(moon) : '–', d?.moon?.rise ? `${W('月出', 'Rise')} ${clock(d.moon.rise, f.tz)}${d.moon.set ? ` · ${W('月落', 'set')} ${clock(d.moon.set, f.tz)}` : ''}` : '', 'indigo'],
    [glyph('air'), W('PM10 / 臭氧', 'PM10 / ozone'), `${f.air?.pm10 ?? '–'} / ${f.air?.o3 ?? '–'}`, 'μg/m³ / ppb', 'green'],
    [glyph('station'), W('附近測站', 'Nearest station'), n.station ? [stationName(n.station.name), n.station.temp != null ? deg(n.station.temp) : ''].filter(Boolean).join(' ') : '–', n.station ? W(`${n.station.km} 公里 · ${clock(n.station.at, f.tz)} 實測`, `${n.station.km} km · ${clock(n.station.at, f.tz)}`) : '', 'mint'],
    [glyph('pin'), W('位置', 'Location'), where.main ? e(where.main) : '–', where.sub ? e(where.sub) : '', 'red']
  ];
  const rows = items.map(([icon, k, v, sub, color]) => `<div class="q-ritem wx-info-row"><span class="q-tile sm" style="--t:var(--q-${color})">${icon}</span><span class="q-ritem-text"><span class="q-ritem-title">${k}</span>${sub ? `<small>${sub}</small>` : ''}</span><span class="q-ritem-value">${v}</span></div>`).join('');
  return `<h3 class="q-sheet-h">${W('更多資訊', 'More details')}</h3><div class="q-rowcard wx-info">${rows}</div><p class="wx-foot">${f.partial ? W('部分資料稍舊 · ', 'Some data a little old · ') : ''}${e(updatedText(f.at, now))}</p>`;
}

// ---- A metric's sheet: its big graph -------------------------------------------------------

// The sheet a metric opens: its big graph, tabs and read-out.
const METRIC_TITLES = { rain: W('降雨機率', 'Chance of rain'), uv: W('紫外線', 'UV index'), air: W('空氣品質', 'Air quality') };
export function metricSheet(kind, f, opts) {
  const body = { rain: rainCard, uv: uvCard, air: airCard }[kind]?.(f, opts) || '';
  return `<div class="q-sheet-head"><h2><span class="wx-quiet-tile q-tile sm">${glyph({ rain: 'umbrella', uv: 'sun', air: 'air' }[kind], { size: 18 })}</span>${METRIC_TITLES[kind]}</h2><button class="q-close" type="button" data-act="close" aria-label="${W('關閉', 'Close')}">×</button></div>${body}`;
}

// (天氣's and 地點's pages read these too: lib/pages.mjs.)
export { skyOf, fxHtml, adviceList, LIFE, KIND_COLOR, LEVEL_TAG, today as todayOf };
