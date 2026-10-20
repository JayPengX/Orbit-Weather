// One place's weather, drawn for the app's three tabs: 今天 (the head, the
// sky, the next hours, the advice), 預報 (the indicators, the days) and
// 地點 (the places, the settings); and the sheets they open (a day, a
// metric's graph, all the advice). One truth: one value for each thing, no
// sources named.

import { clock, hourOf, dateOf, dayLabel, shortDate, weekday, deg, pct, uvLevel, uvColor, aqiColor, windDir, beaufort, moonName, escapeHtml as e, conditionText, aqiLevel, rainLevel, wearFor, outFeel, updatedText, staleText } from './format.mjs';
import { W, en } from '#kit/lang.mjs';
import { adviceEn } from './advice-en.mjs';
import { rainSoon } from './soon.mjs';
// An hour, as each language says it: 15時, 15:00.
const hh = n => W(`${n}時`, `${n}:00`);
import { conditionArt, glyph, placeGlyph, ADVICE_GLYPH } from './icons.mjs';
import { segHtml } from '#kit/ui.mjs';
import * as kitUI from '#kit/ui.mjs';
import { uvGraph, rainGraph, airGraph, dayCharts, spark, UV_STOPS, RAIN_STOPS, AQI_STOPS } from './graph.mjs';
import { sunTimes, goldenHours } from './sun.mjs';
import { placeLines, OLD_MS } from './api.mjs';

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
// The forecast's words are the proxy's Chinese; in English only what's
// already English (the route's own, `f.own`, or a sentence with no Chinese).
const readable = text => !en || !/[\u4e00-\u9fff]/.test(text);

// The sky behind the top: by the weather now, day or night.
export function skyOf(n) {
  const c = String(n?.condition?.code || '').toUpperCase();
  const t = String(n?.condition?.text || '');
  const kind = /THUNDER/.test(c) || /雷/.test(t) ? 'storm' : /RAIN|SHOWER|DRIZZLE/.test(c) || /雨/.test(t) ? 'rain' : /PARTLY|MOSTLY_CLEAR|MOSTLY_SUNNY/.test(c) || /多雲/.test(t) ? 'part' : /CLOUDY|OVERCAST|FOG|HAZE/.test(c) || /陰|霧/.test(t) ? 'cloud' : 'clear';
  return `sky-${kind} ${n?.day === false ? 'sky-night' : 'sky-day'}`;
}

// ---- 今天: the head, the sky, the next hours, the advice ------------------------------

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
export function soonLine(f, now, tz) {
  const r = rainSoon(f, now);
  if (!r) return '';
  const near = r.mins <= 60;
  const at = hh(hourOf(r.at, tz));
  const text = r.kind === 'start' ? (near ? W(`約 ${r.mins} 分鐘後下雨 · ${r.pop}%`, `Rain in ~${r.mins} min · ${r.pop}%`) : W(`${at}起下雨 · ${r.pop}%`, `Rain from ${at} · ${r.pop}%`)) : near ? W(`雨約 ${r.mins} 分鐘後減弱`, `Easing in ~${r.mins} min`) : W(`${at}後雨勢減弱`, `Easing by ${at}`);
  return `<p class="wx-soon wx-soon-${r.kind}">${glyph('umbrella', { size: 15 })}<span>${e(text)}</span></p>`;
}

// What a page is called and what's said under it, one rule for the head's
// title, the hero's eyebrow and the 地點 row.
export function placeName(page) {
  const place = placeLines(page.place);
  const title = page.plan ? W('我的行程', 'My day') : page.pin ? page.pin.name : place.main || W('目前位置', 'Current location');
  // (Here with no township's name yet: the title already says 目前位置, so not again under it.)
  const sub = page.plan
    ? `${W('現在在', 'Now at')} ${page.pin ? page.pin.name : W('目前位置', 'current location')}${place.main ? ` · ${place.main}` : ''}`
    : page.pin
      ? [place.main, place.sub].filter(Boolean).join(' · ')
      : [place.sub, page.note || (place.main ? W('目前位置', 'Current location') : '')].filter(Boolean).join(' · ');
  return { title, sub };
}

// A tab's head: its large title. The place's title
// is a button: it opens 地點.
export function headHtml(title, { place = false } = {}) {
  if (!place) return `<header class="q-page-head wx-head">${kitUI.navTitleHtml(title)}</header>`;
  return `<header class="q-page-head wx-head"><h1><button class="wx-title" type="button" data-act="places" aria-label="${e(title)} · ${W('換地點', 'Change place')}"><span>${e(title)}</span>${glyph('chevD', { size: 20 })}</button></h1></header>`;
}

// The sky: where (the county, or the pin's place), now, the day's high and
// low; the whole card opens today's sheet. No warning banner under it:
// 陸上強風特報 and the like sat there most days and said little; the advice
// rows speak of wind and rain.
export function heroHtml(f, { page, now }) {
  const n = f?.now || {};
  const d = f ? today(f, now) : null;
  const { sub } = placeName(page);
  const sky = f ? skyOf(n) : 'sky-cloud sky-day';
  const date = f ? d?.date || dateOf(now, f.tz) : null;
  const open = f ? ` role="button" tabindex="0" data-day="${e(date)}" data-page="${e(page.key)}" aria-label="${W('今天的詳細預報', "Today's full forecast")}"` : '';
  // An old copy (OLD_MS) says so in the foot and fades its "now" until the
  // new one is in: 更新中 while asked (the panel's .is-loading), 無法更新
  // when the read failed, tap to try again.
  const old = f && f.at && now - f.at > OLD_MS;
  const stale = old
    ? `<button class="wx-stale${page.error ? ' failed' : ''}" type="button" data-act="retry" data-page="${e(page.key)}"><i class="wx-spin" aria-hidden="true"></i><b class="wx-stale-busy">${W('更新中', 'Updating')}</b><b class="wx-stale-failed">${page.error ? W('無法更新', "Couldn't update") : W('等待更新', 'Not updated')}</b><span class="wx-stale-age" data-at="${Number(f.at)}">${e(staleText(f.at, now))}</span></button>`
    : '';
  const locate = page.askable && !page.pin && !page.plan ? `<button class="wx-relocate" type="button" data-locate>${glyph('locate', { size: 13 })}${W('定位', 'Locate')}</button>` : '';
  return `
  <section class="wx-hero ${sky}${old ? ' wx-old' : ''}"${open}>
    ${fxHtml(sky)}
    <p class="wx-eyebrow">${placeGlyph(page, { size: 14 })}<span>${e(sub) || '&nbsp;'}</span>${locate}</p>
    ${
      f
        ? `<div class="wx-now">
      <div class="wx-temp" data-q-live="wx:temp">${deg(n.temp)}</div>
      <span class="wx-icon">${conditionArt(n.condition?.code, n.condition?.text, n.day ?? true, { size: 76 })}</span>
    </div>
    <p class="wx-cond">${e(conditionText(n.condition?.code, n.condition?.text))}</p>
    <div class="wx-pills">
      <span class="wx-pill">${W('最高', 'H')} <b>${deg(d?.hi)}</b></span>
      <span class="wx-pill">${W('最低', 'L')} <b>${deg(d?.lo)}</b></span>
      <span class="wx-pill wx-feel">${W('體感', 'Feels')} <b>${deg(n.feels)}</b></span>
    </div>
    ${old ? '' : soonLine(f, now, f.tz)}
    <div class="wx-hero-foot">${stale || ''}<span class="wx-more">${W('今天', 'Today')}${glyph('chevR', { size: 14 })}</span></div>`
        : page.error
          ? ''
          : '<div class="wx-now wx-skel-hero" aria-hidden="true"><i class="sk sk-temp"></i></div><p class="wx-cond wx-skel-hero" aria-hidden="true"><i class="sk sk-cond"></i></p><div class="wx-pills wx-skel-hero" aria-hidden="true"><i class="sk sk-pill"></i><i class="sk sk-pill"></i><i class="sk sk-pill"></i></div>'
    }
  </section>`;
}

// A section: a 20px head (the kit's q-section-head, 全部 on its right when
// there's more), then its body.
const sec = (cls, title, body, more = '') => `<section class="q-section wx-section ${cls}"><div class="q-section-head q-shd"><h2>${title}</h2>${more}</div>${body}</section>`;

// The next 24 hours, every 3 hours: a rail of small cards under the day's
// sentence. A card opens its day.
export function hourStrip(f, { now, key }) {
  const hours = hoursFrom(f, now);
  const cols = [];
  for (let i = 0; i < 24 && i < hours.length; i += 3) cols.push(hours[i]);
  if (cols.length < 4) return '';
  const say = f.headline && (f.own || readable(f.headline)) ? `<p class="wx-say">${e(f.headline)}</p>` : '';
  const rail = cols
    .map((col, i) => {
      // 現在 is what the hero says (the same reading), not the hour's forecast.
      const h = i === 0 && f.now && f.now.temp != null ? { ...col, temp: f.now.temp, condition: f.now.condition ?? col.condition, day: f.now.day ?? col.day } : col;
      const date = dateOf(h.t, f.tz);
      const hr = hourOf(h.t, f.tz);
      // A new day: its name before it.
      const newDay = i > 0 && dateOf(cols[i - 1].t, f.tz) !== date;
      // (In English the day by its short name: "Tomorrow 2:00" ran into the next card;
      // at midnight the name alone, not "Mon 0".)
      const label = i === 0 ? W('現在', 'Now') : newDay ? W(`${dayLabel(date, now, f.tz)}${hr}時`, hr === 0 ? weekday(date) : `${weekday(date)} ${hr}`) : hh(hr);
      return `<button class="wx-hr q-press${i === 0 ? ' is-now' : ''}${newDay ? ' is-newday' : ''}" type="button" data-day="${e(date)}" data-page="${e(key)}" aria-label="${e(`${dayLabel(date, now, f.tz)} ${hh(hr)} ${deg(h.temp)}`)}">
          <span class="wx-hr-t">${e(label)}</span>
          ${conditionArt(h.condition?.code, h.condition?.text, h.day ?? true, { size: 34 })}
          <b class="wx-hr-v">${deg(h.temp)}</b>
          <span class="wx-hr-p">${h.pop >= 20 ? `${h.pop}%` : ''}</span>
        </button>`;
    })
    .join('');
  return sec('wx-hours', W('接下來 24 小時', 'Next 24 hours'), `${say}<div class="q-rail wx-rail">${rail}</div>`);
}

// ---- The metrics' sheets: a graph each --------------------------------------------------------------
//
// A metric's sheet: its graph fitted to the width (no sideways scrolling);
// tabs pick the range. The app keeps the choice (`ranges`).

// Every sheet's tabs are days, the way a day is thought of: 今天 (now to
// midnight; from 18:00 it's 今晚, on to 07:00: the night and the way out in
// the morning), 明天 (all of it), then the days ahead. UV's are the
// daylight days ahead, named by their day.
export const RANGES = {
  uv: [['d0', ''], ['d1', ''], ['10d', W('10 天', '10 days')]],
  rain: [['d0', ''], ['d1', W('明天', 'Tomorrow')], ['10d', W('10 天', '10 days')]],
  air: [['d0', ''], ['d1', W('明天', 'Tomorrow')], ['days', W('每天', 'Daily')]]
};
export const rangeOf = (kind, ranges) => (RANGES[kind]?.some(([k]) => k === ranges?.[kind]) ? ranges[kind] : RANGES[kind]?.[0][0]);
const evening = (now, tz) => hourOf(now, tz) >= 18;
export const tonightName = (now, tz) => (evening(now, tz) ? W('今晚', 'Tonight') : W('今天', 'Today'));
// The hours of a day tab (`d0`, `d1`) out of a list of hours from now on.
export function dayHours(list, range, tz, now) {
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
      <div class="wx-card-title"><h3>${title}</h3><p>${summary}</p></div>
      ${big}
    </header>
    ${tabs}
    <div class="wx-readout" data-read="${cls}" aria-live="polite">${foot}</div>
    <div class="wx-graphbox" data-box="${cls}">${graph}<i class="ch-xh" hidden></i><i class="ch-dh" hidden></i></div>
  </section>`;
// The kit's segmented control; its thumb slides from the range shown before.
const shownRange = {};
const tabsHtml = (kind, list, on) => {
  const from = shownRange[kind] ?? on;
  shownRange[kind] = on;
  return `<div class="wx-tabs">${segHtml(list, on, { from, attr: k => `data-range="${kind}:${k}"`, esc: e })}</div>`;
};
export const dayText = (date, now, tz) => `${dayLabel(date, now, tz)} ${shortDate(date)}`;

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
  return [...by.entries()].map(([date, hours]) => ({ date, hours }));
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

export function uvCard(f, { now, ranges }) {
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
    return p.uv >= 1 ? W(`最高 ${p.uv} ${uvLevel(p.uv)}${sn.length ? `，${hourOf(sn[0].t, f.tz)}–${hourOf(sn[sn.length - 1].t + HOUR, f.tz)}時防曬` : ''}`, ` peak ${p.uv} ${uvLevel(p.uv)}${sn.length ? `, cover up ${hourOf(sn[0].t, f.tz)}–${hourOf(sn[sn.length - 1].t + HOUR, f.tz)}h` : ''}`) : W('很弱', ' very low');
  };
  const shown = range === '10d' ? null : days[range === 'd1' ? 1 : 0];
  const summary = shown ? `${dayLabel(shown.date, now, f.tz)}${dayPeak(shown.date) || ''}` : W('每天最高', 'Daily peak');
  const tabs = tabsHtml('uv', RANGES.uv.map(([k, name], i) => [k, name || (days[i] ? dayLabel(days[i].date, now, f.tz) : '')]).filter(([, name]) => name), range);
  const cols = colsFor('uv', f, now, range);
  return card({ cls: 'uv', icon: glyph('sun'), title: W('紫外線', 'UV index'), summary: e(summary), big, tabs, graph: uvGraph(cols, { tz: f.tz, now, daily: range === '10d' }), foot: W('按住圖表滑動，看每小時', 'Hold and slide for each hour') });
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
  if (short) return next.t <= now ? W(`正在下 ${next.pop}%`, `Raining ${next.pop}%`) : W(`${day}${hourOf(next.t, tz)}時起 ${next.pop}%`, `${next.pop}% from ${day ? `${day} ` : ''}${hourOf(next.t, tz)}:00`);
  const peak = top !== next && top.pop > next.pop ? W(`，${hourOf(top.t, tz)}時最高 ${top.pop}%`, `, peak ${top.pop}% at ${hourOf(top.t, tz)}`) : '';
  return next.t <= now ? W(`正在下或快下（${next.pop}%${peak}）`, `Raining or about to (${next.pop}%${peak})`) : W(`${dayLabel(dateOf(next.t, tz), now, tz)} ${hourOf(next.t, tz)}時起 ${next.pop}%${peak}`, `${next.pop}% from ${dayLabel(dateOf(next.t, tz), now, tz)} ${hourOf(next.t, tz)}:00${peak}`);
}

export function rainCard(f, { now, ranges }) {
  const hours = hoursFrom(f, now);
  if (!hours.length) return '';
  const pop = hours[0]?.pop;
  const big = `<div class="wx-big wx-rain-big">${pop ?? '–'}<small>%</small></div>`;
  const n = f.now || {};
  const range = rangeOf('rain', ranges);
  const extra = [n.rainToday != null ? W(`今日 ${n.rainToday} mm`, `Today ${n.rainToday} mm`) : '', n.rain1h ? W(`過去 1 小時 ${n.rain1h} mm`, `Last hour ${n.rain1h} mm`) : ''].filter(Boolean).join(' · ');
  const cols = colsFor('rain', f, now, range);
  return card({ cls: 'rain', icon: glyph('umbrella'), title: W('降雨機率', 'Chance of rain'), summary: e(rainSummary(hours, f.tz, now)), big, tabs: tabsHtml('rain', dayTabs('rain', now, f.tz), range), graph: rainGraph(cols, { tz: f.tz, daily: range === '10d', fromNow: range === 'd0' }), foot: [cols.some(c => c.mm >= (range === '10d' ? 0.5 : 0.1)) ? W('深色＝雨量', 'Dark = amount') : '', e(extra)].filter(Boolean).join(' · ') });
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
export const airHours = (f, now) => (f.air?.hourly || []).filter(h => h.t + HOUR > now && h.aqi != null);

export function airCard(f, { now, ranges }) {
  const a = f.air;
  if (!a) return '';
  const hourly = airHours(f, now).length > 0;
  const range = hourly ? rangeOf('air', ranges) : 'days';
  const cols = colsFor('air', f, now, range);
  const big = `<div class="wx-big" style="--c:${aqiColor(a.aqi)}">${a.aqi ?? '–'}<small>${e(aqiLevel(a.level))}</small></div>`;
  // (The days' worst is the graph's tallest bar: not said again here, so the line stays one line.)
  const summary = `PM2.5 ${a.pm25 ?? '–'} · ${e(a.station?.name || '')} ${a.station?.km ?? '–'} km`;
  const daily = range === 'days';
  return card({ cls: 'air', icon: glyph('air'), title: W('空氣品質', 'Air quality'), summary, big, tabs: hourly ? tabsHtml('air', dayTabs('air', now, f.tz), range) : '', graph: airGraph(cols, { tz: f.tz, daily, fromNow: range === 'd0' }), foot: daily ? W('按住圖表滑動，看每天', 'Hold and slide for each day') : W('按住圖表滑動，看每小時', 'Hold and slide for each hour') });
}

// ---- What to do: the advice rows -----------------------------------------------------------

const LIFE = {
  umbrella: W('雨傘', 'Umbrella'), commute: W('通勤', 'Commute'), wear: W('穿著', 'Clothes'), sun: W('防曬', 'Sun'), run: W('跑步', 'Running'), laundry: W('曬衣', 'Laundry'), sleep: W('睡覺', 'Sleep'), window: W('開窗', 'Windows'), mask: W('口罩', 'Mask'), heat: W('炎熱', 'Heat'), carwash: W('洗車', 'Car wash'),
  move: W('移動', 'On the move'), diff: W('兩地溫差', 'Between places'), weekend: W('週末', 'Weekend'), humid: W('除濕', 'Damp'), temp: W('氣溫', 'Temperature'), wind: W('強風', 'Wind'), thunder: W('雷雨', 'Storms'), fog: W('起霧', 'Fog')
};
const ORDER = ['thunder', 'umbrella', 'move', 'commute', 'wear', 'temp', 'sun', 'wind', 'fog', 'diff', 'run', 'laundry', 'weekend', 'sleep', 'humid', 'window', 'mask', 'heat', 'carwash'];
// What needs doing first (a warning), then the usual order.
const URGENT = { yes: 0, bad: 0, hot: 0, maybe: 1, good: 2, none: 3 };
const SHOWN = 4;

// One piece of advice, a row: its glyph on a colour tile, the name, what to
// do, and a tag when the level asks for attention (or says go).
const KIND_COLOR = { umbrella: 'blue', commute: 'indigo', move: 'indigo', wear: 'orange', temp: 'orange', sun: 'orange', run: 'green', laundry: 'teal', sleep: 'indigo', window: 'mint', mask: 'red', heat: 'red', wind: 'teal', thunder: 'purple', fog: 'cyan', diff: 'purple', weekend: 'pink', humid: 'cyan', carwash: 'blue' };
const LEVEL_TAG = { yes: ['orange', W('留意', 'Heads up')], hot: ['orange', W('留意', 'Heads up')], bad: ['orange', W('留意', 'Heads up')], maybe: ['blue', W('可能', 'Maybe')], good: ['green', W('適合', 'Good')] };
export const lifeTile = ({ kind, level, title, text }) => {
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

// The section: the first few rows; 全部 opens the sheet with every one.
export function adviceCards(f, { now, key = '' } = {}) {
  const { list, tomorrow } = adviceList(f, now);
  if (!list.length) return '';
  const more = list.length > SHOWN ? `<button type="button" data-act="advice" data-page="${e(key)}">${W('全部', 'All')}</button>` : '';
  return sec('wx-advice-sec', adviceTitle(tomorrow), `<div class="q-rowcard wx-lifegrid">${adviceRows(list.slice(0, SHOWN))}</div>`, more);
}
// The sheet: every row.
export function adviceSheet(f, { now } = {}) {
  const { list, tomorrow } = adviceList(f, now);
  return `<div class="q-sheet-head"><h2>${adviceTitle(tomorrow)}</h2><button class="q-close" type="button" data-act="close" aria-label="${W('關閉', 'Close')}">×</button></div><div class="q-rowcard wx-lifegrid">${adviceRows(list)}</div>`;
}

// ---- The days ------------------------------------------------------------------------------

export function daysList(f, { now, key }) {
  const days = (f.days || []).filter(d => d.date >= dateOf(now, f.tz));
  if (!days.length) return '';
  const lo = Math.min(...days.map(d => d.lo ?? Infinity));
  const hi = Math.max(...days.map(d => d.hi ?? -Infinity));
  const span = Math.max(1, hi - lo);
  const pop = d => dayPop(f, d, now);
  return sec(
    'wx-days-sec',
    W(`${days.length} 天預報`, `${days.length}-day forecast`),
    `<div class="q-rowcard wx-days">
      ${days
        .map(d => {
          const left = (((d.lo ?? lo) - lo) / span) * 100;
          const right = (((d.hi ?? hi) - lo) / span) * 100;
          const c = d.day?.condition || {};
          return `<button class="wx-day" type="button" data-day="${e(d.date)}" data-page="${e(key)}">
            <span class="wx-dname">${e(en && d.date !== dateOf(now, f.tz) ? weekday(d.date) : dayLabel(d.date, now, f.tz))}<small>${d.places?.length > 1 ? e(d.places.join('·')) : shortDate(d.date)}</small></span>
            <span class="wx-dicon">${conditionArt(c.code, c.text, true, { size: 30 })}</span>
            <span class="wx-dpop" style="--p:${pop(d) ?? 0}%"><b>${pop(d) == null ? '–' : `${pop(d)}%`}</b><i></i></span>
            <span class="wx-dlo">${deg(d.lo)}</span>
            <span class="wx-bar"><i style="left:${left.toFixed(1)}%;width:${Math.max(4, right - left).toFixed(1)}%"></i></span>
            <span class="wx-dhi">${deg(d.hi)}</span>
            <span class="wx-duv" style="--c:${uvColor(d.uvMax)}">${d.uvMax ?? ''}</span>
          </button>`;
        })
        .join('')}
    </div>`
  );
}

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

// The sheet for one day: its numbers, its charts (a finger on them reads
// each hour), and what to do that day.
export function daySheet(f, date, { now, lat, lon }) {
  const d = f.days?.find(x => x.date === date);
  const hours = (f.hours || []).filter(h => dateOf(h.t, f.tz) === date);
  const s = d?.sunrise ? { sunrise: d.sunrise, sunset: d.sunset } : lat != null ? sunTimes(date, lat, lon) : null;
  const fc = f.air?.forecast?.days?.find(x => x.date === date);
  const dates = (f.days || []).map(x => x.date).filter(x => x >= dateOf(now, f.tz));
  const at = dates.indexOf(date);
  const prev = at > 0 ? dates[at - 1] : null;
  const next = at >= 0 && at < dates.length - 1 ? dates[at + 1] : null;
  const c = d?.day?.condition || {};
  const tips = dayTips(f, date, now);
  const places = d?.places?.length ? d.places.join(' → ') : '';
  const sum = `<div class="wx-scrub-time"><b>${W('全天', 'All day')}</b><span>${e(places || conditionText(c.code, c.text) || '')}</span></div>
    <div class="wx-scrub-vals is-sum">
      <div><span>${W('最高 / 最低', 'High / low')}</span><b>${deg(d?.hi)} / ${deg(d?.lo)}</b><small>${W('體感', 'Feels')} ${deg(d?.feelsHi)} / ${deg(d?.feelsLo)}</small></div>
      <div><span>${W('降雨', 'Rain')}</span><b>${pct(d?.pop)}</b><small>${d?.mm ? W(`約 ${d.mm} mm`, `~${d.mm} mm`) : ''}</small></div>
      <div><span>${W('紫外線最高', 'UV high')}</span><b>${d?.uvMax ?? '–'}</b><small>${uvLevel(d?.uvMax) || ''}</small></div>
      <div><span>${W('空氣最高', 'Air high')}</span><b style="color:${fc ? aqiColor(fc.aqi) : 'inherit'}">${fc?.aqi ?? '–'}</b><small>${e(aqiLevel(fc?.level))}</small></div>
    </div>`;
  return `
    <div class="q-sheet-head">
      <button class="wx-nav" type="button" data-dayn="${e(prev || '')}" aria-label="${W('前一天', 'Previous day')}" ${prev ? '' : 'disabled'}>${glyph('chevL', { size: 20 })}</button>
      <h2><span class="wx-day-icon">${conditionArt(c.code, c.text, true, { size: 30 })}</span><span>${dayLabel(date, now, f.tz) === weekday(date) ? '' : `${e(dayLabel(date, now, f.tz))} `}${shortDate(date)} ${weekday(date)}</span></h2>
      <button class="wx-nav" type="button" data-dayn="${e(next || '')}" aria-label="${W('後一天', 'Next day')}" ${next ? '' : 'disabled'}>${glyph('chevR', { size: 20 })}</button>
      <button class="q-close" type="button" data-act="close" aria-label="${W('關閉', 'Close')}">×</button>
    </div>
    <div class="wx-dayg">
      <div class="wx-scrub" aria-live="polite" data-sum="1">${sum}</div>
      ${hours.filter(h => h.temp != null).length >= 4 ? `<div class="wx-dayg-plot">${dayCharts(hours, { tz: f.tz })}</div><p class="wx-foot wx-hint">${W('按住圖表滑動，看每小時', 'Hold and slide for each hour')}</p>` : `<p class="wx-foot">${W('這一天沒有逐時資料。', 'No hourly forecast for this day.')}</p>`}
    </div>
    ${tips.length ? `<h3 class="q-sheet-h">${W('這天的建議', 'For this day')}</h3><div class="q-rowcard wx-lifegrid">${tips.map(t => lifeTile({ kind: t.k, level: t.lv, title: t.title, text: t.text })).join('')}</div>` : ''}
    <div class="wx-grid">
      ${d?.day ? `<div class="wx-half">${conditionArt(d.day.condition?.code, d.day.condition?.text, true, { size: 40 })}<span>${W('白天', 'Day')}</span><b>${e(conditionText(d.day.condition?.code, d.day.condition?.text))}</b><small>${W('降雨', 'Rain')} ${pct(d.day.pop)}</small></div>` : ''}
      ${d?.night ? `<div class="wx-half">${conditionArt(d.night.condition?.code, d.night.condition?.text, false, { size: 40 })}<span>${W('晚上', 'Night')}</span><b>${e(conditionText(d.night.condition?.code, d.night.condition?.text))}</b><small>${W('降雨', 'Rain')} ${pct(d.night.pop)}</small></div>` : ''}
      ${s ? `<div class="wx-half">${glyph('sunrise', { size: 22 })}<span>${W('日出 / 日落', 'Sunrise / sunset')}</span><b>${clock(s.sunrise, f.tz)} / ${clock(s.sunset, f.tz)}</b></div>` : ''}
    </div>`;
}

// ---- Everything else (today's sheet, under the day) ---------------------------------------

export function infoCard(f, { now, lat, lon, page }) {
  const n = f.now || {};
  const w = n.wind || {};
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
    [glyph('station'), W('附近測站', 'Nearest station'), n.station ? `${e(n.station.name)} ${n.station.temp != null ? deg(n.station.temp) : ''}` : '–', n.station ? W(`${n.station.km} 公里 · ${clock(n.station.at, f.tz)} 實測`, `${n.station.km} km · ${clock(n.station.at, f.tz)}`) : '', 'mint'],
    [glyph('pin'), W('位置', 'Location'), where.main ? e(where.main) : '–', where.sub ? e(where.sub) : '', 'red']
  ];
  const rows = items.map(([icon, k, v, sub, color]) => `<div class="q-ritem wx-info-row"><span class="q-tile sm" style="--t:var(--q-${color})">${icon}</span><span class="q-ritem-text"><span class="q-ritem-title">${k}</span>${sub ? `<small>${sub}</small>` : ''}</span><span class="q-ritem-value">${v}</span></div>`).join('');
  return `<h3 class="q-sheet-h">${W('更多資訊', 'More details')}</h3><div class="q-rowcard wx-info">${rows}</div><p class="wx-foot">${f.partial ? W('部分資料稍舊 · ', 'Some data a little old · ') : ''}${e(updatedText(f.at, now))}</p>`;
}

// ---- 預報: the indicators, a rail of stat cards; the big graph in a sheet ----------------

// A level's word on a stat: a tag in the level's colour, kept readable on light and dark.
const levelTag = (text, color) => (text ? `<span class="q-tag tint wx-lv" style="--t:color-mix(in srgb, ${color} 62%, var(--q-label))">${e(text)}</span>` : '');
// A stat, as plain data: its colour tile and level, its name, a big number (and its unit), one
// line, a sparkline (`art`). With a graph to open (`key`) it is a button. The rail draws it as
// statCard (HTML), 今日數據 as the kit's panelGrid (statPanel); `key` is the graph's page.
const TILE_COLOR = { rain: 'blue', uv: 'orange', air: 'green', humidity: 'cyan', wind: 'teal', sun: 'orange', feels: 'red', vis: 'indigo' };
const GLYPH_OF = { rain: 'umbrella', uv: 'sun', air: 'air', humidity: 'drop', wind: 'wind', sun: 'sunrise', feels: 'thermo', vis: 'eye' };
const statCard = ({ kind, key = '', title, big, unit = '', sub = '', art = '', level = '', levelColor = '', levelHtml = '' }) => {
  const tag = key ? 'button' : 'div';
  const open = key ? ` type="button" data-metric="${kind}" data-page="${e(key)}"` : '';
  return `<${tag} class="q-rail-card wx-stat k-${kind}${key ? ' q-press' : ''}"${open}>
    <span class="wx-stat-head"><span class="q-tile sm" style="--t:var(--q-${TILE_COLOR[kind]})">${glyph(GLYPH_OF[kind], { size: 18 })}</span>${levelHtml || levelTag(level, levelColor)}</span>
    <small>${title}</small>
    <strong class="wx-stat-val">${e(big)}${unit ? `<small>${e(unit)}</small>` : ''}</strong>
    <span class="wx-stat-sub">${e(sub)}</span>
    ${art}
  </${tag}>`;
};
// The same stat as one of the kit's panels (unit, level, sparkline and tap-to-graph all in the panel).
const statPanel = ({ kind, key = '', title, big, unit = '', sub = '', art = '', level = '', levelColor = '' }) => ({
  label: title,
  big: String(big),
  unit,
  sub,
  icon: glyph(GLYPH_OF[kind], { size: 18 }),
  tint: levelColor && level ? `color-mix(in srgb, ${levelColor} 62%, var(--q-label))` : `var(--q-${TILE_COLOR[kind]})`,
  level,
  art,
  ...(key ? { open: kind, data: { metric: kind, page: key } } : {})
});

export function rainStat(f, { now, key }) {
  const hours = hoursFrom(f, now);
  if (!hours.length) return null;
  const next = hours.slice(0, 24);
  return { kind: 'rain', key, title: W('降雨', 'Rain'), big: `${hours[0].pop ?? '–'}`, unit: '%', sub: rainSummary(hours, f.tz, now, { short: true }), art: spark(next.map(h => h.pop), { max: 100, stops: RAIN_STOPS }) };
}
export function uvStat(f, { now, key }) {
  const hours = hoursFrom(f, now);
  if (!hours.some(h => h.uv != null)) return null;
  const day = uvDays(f, now)[0];
  const list = (day?.hours || []).filter(h => h.uv != null);
  const peak = list.reduce((a, h) => (h.uv > (a?.uv ?? -1) ? h : a), null);
  const nowUv = f.now?.uv ?? hours[0]?.uv;
  const sub = peak ? W(`${day.date === dateOf(now, f.tz) ? '' : dayLabel(day.date, now, f.tz)}最高 ${peak.uv}・${hourOf(peak.t, f.tz)}時`, day.date === dateOf(now, f.tz) ? `Peak ${peak.uv} at ${hourOf(peak.t, f.tz)}` : `${weekday(day.date)} peak ${peak.uv}`) : '';
  return { kind: 'uv', key, title: W('紫外線', 'UV'), big: `${nowUv ?? '–'}`, level: uvLevel(nowUv), levelColor: uvColor(nowUv), sub, art: spark(list.map(h => h.uv), { max: 11, stops: UV_STOPS }) };
}
export function airStat(f, { now, key }) {
  const a = f.air;
  if (!a) return null;
  const cols = airCols(f, now);
  return { kind: 'air', key, title: W('空氣', 'Air'), big: `${a.aqi ?? '–'}`, level: aqiLevel(a.level), levelColor: aqiColor(a.aqi), sub: `PM2.5 ${a.pm25 ?? '–'}`, art: spark(cols.map(c => c.aqi), { max: 150, stops: AQI_STOPS, bars: true }) };
}
export function metricStats(f, opts) {
  const n = f.now || {};
  const w = n.wind || {};
  const hum = n.humidity ?? hoursFrom(f, opts.now)[0]?.humidity;
  const dew = n.dew ?? hoursFrom(f, opts.now)[0]?.dew;
  return [
    rainStat(f, opts),
    uvStat(f, opts),
    airStat(f, opts),
    hum != null ? { kind: 'humidity', title: W('濕度', 'Humidity'), big: `${Math.round(hum)}`, unit: '%', sub: dew != null ? `${W('露點', 'Dew point')} ${deg(dew)}` : '' } : null,
    w.speed != null
      ? {
          kind: 'wind',
          title: W('風', 'Wind'),
          big: `${Math.round(w.speed)}`,
          unit: 'km/h',
          level: windDir(w.dir),
          levelColor: 'var(--q-teal)',
          levelHtml: `<span class="q-tag tint wx-lv" style="--t:var(--q-teal)"><span class="wx-compass" style="--d:${w.dir ?? 0}deg">${glyph('locate', { size: 12 })}</span>${e(windDir(w.dir))}</span>`,
          sub: `${W(`${beaufort(w.speed)} 級`, `Force ${beaufort(w.speed)}`)}${w.gust ? ` · ${W(`陣風 ${Math.round(w.gust)}`, `gusts ${Math.round(w.gust)}`)}` : ''}`
        }
      : null
  ].filter(Boolean);
}
export const metricCards = (f, opts) => metricStats(f, opts).map(statCard);
export function metricTiles(f, opts) {
  const cards = metricCards(f, opts);
  if (!cards.length) return '';
  return sec('wx-metrics-sec', W('指標', 'Conditions'), `<div class="q-rail wx-stats">${cards.join('')}</div>`);
}
// 今天's panel grid (Apple Weather's): the indicators and what else the forecast says, two to a row.
// The kit's panelGrid.
export function panelGrid(f, opts) {
  const n = f.now || {};
  const d = today(f, opts.now);
  const stats = metricStats(f, opts);
  if (d?.sunrise && d?.sunset) stats.push({ kind: 'sun', title: W('日出', 'Sunrise'), big: clock(d.sunrise, f.tz), sub: `${W('日落', 'Sunset')} ${clock(d.sunset, f.tz)}` });
  if (n.feels != null) stats.push({ kind: 'feels', title: W('體感', 'Feels like'), big: deg(n.feels), sub: n.temp != null ? (n.feels > n.temp + 1 ? W('比實際溫度悶熱', 'Warmer than the air') : n.feels < n.temp - 1 ? W('比實際溫度涼', 'Cooler than the air') : W('與實際溫度相近', 'About the air')) : '' });
  if (n.vis != null) stats.push({ kind: 'vis', title: W('能見度', 'Visibility'), big: `${n.vis}`, unit: W('公里', 'km'), sub: `${W('雲量', 'Cloud')} ${pct(n.cloud)}` });
  if (stats.length < 2) return '';
  return sec('wx-panels-sec', W('今日數據', "Today's details"), kitUI.panelGridHtml(stats.map(statPanel)));
}
// 今天's places shelf: each place a card (its picture, name, temperature now); a tap goes there.
export function placesShelf(rows) {
  if (!rows || rows.length < 2) return '';
  const card = r => `<button class="q-rail-card wx-place-card q-press${r.on ? ' is-on' : ''}" type="button" data-go-key="${e(r.key)}"><span class="q-tile" style="--t:var(--q-${r.color})">${r.glyph}</span><b class="wx-pc-temp">${r.temp != null ? deg(r.temp) : '–'}</b><span class="wx-pc-art">${r.art || ''}</span><small>${e(r.title)}</small></button>`;
  return sec('wx-places-sec', W('我的地點', 'My places'), `<div class="q-rail wx-pcards">${rows.map(card).join('')}</div>`, `<button class="q-sh-more" type="button" data-act="places">${W('全部', 'All')}</button>`);
}
// The sheet a metric opens: its big graph, tabs and read-out.
export const METRIC_TITLES = { rain: W('降雨機率', 'Chance of rain'), uv: W('紫外線', 'UV index'), air: W('空氣品質', 'Air quality') };
export function metricSheet(kind, f, opts) {
  const body = { rain: rainCard, uv: uvCard, air: airCard }[kind]?.(f, opts) || '';
  return `<div class="q-sheet-head"><h2><span class="q-tile sm" style="--t:var(--q-${TILE_COLOR[kind]})">${glyph({ rain: 'umbrella', uv: 'sun', air: 'air' }[kind], { size: 18 })}</span>${METRIC_TITLES[kind]}</h2><button class="q-close" type="button" data-act="close" aria-label="${W('關閉', 'Close')}">×</button></div>${body}`;
}

// ---- The tabs ------------------------------------------------------------------------------

// Before the forecast: each tab's own shape, shimmering (the numbers take
// their places as they come, nothing moves); a failure says so.
const skelRail = (n, cls) => `<div class="q-rail ${cls}" aria-hidden="true">${Array.from({ length: n }, () => '<span class="wx-skel-card"><i class="sk sk-ic"></i><i class="sk sk-h"></i><i class="sk sk-line short"></i></span>').join('')}</div>`;
const failed = page => kitUI.emptyHtml({ icon: 'cloud', title: page.error, action: { label: W('再試一次', 'Try again'), data: { act: 'retry', page: page.key } } });
const waiting = (cls, n) => `<section class="q-section wx-section wx-skel ${cls}" aria-label="${W('正在取得天氣', 'Getting the weather')}"><div class="q-section-head"><i class="sk sk-head"></i></div>${skelRail(n, cls === 'wx-hours' ? 'wx-rail' : 'wx-stats')}</section>`;

// Which of the owner's cards go where: 建議 on 今天, 指標 and the days on
// 預報 (in the kept order), 更多資訊 in today's sheet. 我的行程: what
// matters on the move (no 更多資訊), all shown.
export const shownCards = (page, cards = DEFAULT_CARDS, hidden = []) => (page.plan ? ['metrics', 'advice', 'days'] : cards.filter(k => !hidden.includes(k)));
const DEFAULT_CARDS = ['metrics', 'advice', 'days', 'info'];

// 今天: the head (the place), the sky, the next hours, the advice.
export function nowHtml(f, page, { now, cards, hidden, places } = {}) {
  const head = headHtml(placeName(page).title, { place: true });
  const hero = heroHtml(f, { page, now });
  if (!f) return head + hero + (page.error ? failed(page) : waiting('wx-hours', 8));
  const show = shownCards(page, cards, hidden);
  return head + hero + hourStrip(f, { now, key: page.key }) + (show.includes('days') ? daysList(f, { now, key: page.key }) : '') + panelGrid(f, { now, key: page.key, page }) + (show.includes('advice') ? adviceCards(f, { now, key: page.key }) : '') + placesShelf(places);
}

// 預報: the indicators and the days, in the owner's order.
const WEEK = { metrics: metricTiles, days: daysList };
export function weekHtml(f, page, { now, cards, hidden } = {}) {
  const head = headHtml(placeName(page).title);
  if (!f) return head + (page.error ? failed(page) : waiting('wx-metrics-sec', 3));
  const opts = { now, key: page.key, page };
  return head + shownCards(page, cards, hidden).filter(k => WEEK[k]).map(k => WEEK[k](f, opts)).join('');
}

// 地點: each place a row (its picture, its name, where or when, its
// temperature now; the one shown ticked), 新增地點, then the settings. 編輯
// turns the pins' rows into their sheets' doors (as iOS's lists).
// rows: [{ key, title, sub, temp, art, on, pin, glyph, color }].
export function placesHtml(rows, { brief, editing = false, canAdd = true } = {}) {
  const row = r => {
    const tile = `<span class="q-tile" style="--t:var(--q-${r.color})">${r.glyph}</span>`;
    const text = `<span class="q-ritem-text"><span class="q-ritem-title">${e(r.title)}${r.on && !editing ? glyph('check', { size: 16, cls: 'wx-on' }) : ''}</span>${r.sub ? `<small>${e(r.sub)}</small>` : ''}</span>`;
    if (editing && r.pin) return `<button class="q-ritem chevron wx-place-row" type="button" data-act="edit-pin" data-pin="${e(r.pin)}" aria-label="${W(`編輯「${e(r.title)}」`, `Edit “${e(r.title)}”`)}">${tile}${text}</button>`;
    const now = r.temp != null && !editing ? `<span class="wx-place-now">${r.art || ''}<b>${deg(r.temp)}</b></span>` : '';
    return `<div class="q-ritem wx-place-row${r.on ? ' is-on' : ''}${editing ? ' is-still' : ''}"${editing ? '' : ` role="button" tabindex="0" data-go-key="${e(r.key)}"`} aria-current="${r.on ? 'true' : 'false'}">${tile}${text}${now}</div>`;
  };
  const list = rows.map(row).join('');
  const pins = rows.some(r => r.pin);
  const add = canAdd ? `<button class="q-ritem chevron wx-add" type="button" data-act="add-pin"><span class="q-tile" style="--t:var(--q-green)">${glyph('plus')}</span><span class="q-ritem-text"><span class="q-ritem-title">${W('新增地點', 'Add a place')}</span></span></button>` : '';
  const settings = `<div class="q-rowcard">
      <label class="q-ritem wx-brief"><span class="q-tile" style="--t:var(--q-orange)">${glyph('bell')}</span><span class="q-ritem-text"><span class="q-ritem-title">${W('早晨天氣', 'Morning weather')}</span></span><input id="brief-time" class="wx-time" type="time" value="${e(brief)}"></label>
      <button class="q-ritem chevron" type="button" data-act="layout"><span class="q-tile" style="--t:var(--q-indigo)">${glyph('layout')}</span><span class="q-ritem-text"><span class="q-ritem-title">${W('版面', 'Layout')}</span></span></button>
    </div>`;
  const head = `<header class="q-page-head wx-head wx-head-row">${kitUI.navTitleHtml(W('地點', 'Places'))}${pins ? `<button class="wx-head-btn" type="button" data-act="edit-places" aria-pressed="${editing}">${editing ? W('完成', 'Done') : W('編輯', 'Edit')}</button>` : ''}</header>`;
  return head + `<div class="q-rowcard wx-places">${list}${add}</div>` + sec('wx-settings', W('設定', 'Settings'), settings);
}
