// One place's page, top to bottom: where and now; then the cards in the
// owner's order (default: UV, rain and air, each with its graph; what to do,
// today and this week; the days; everything else). One truth: one value for each thing, no sources named.

import { clock, hourOf, dateOf, dayLabel, shortDate, weekday, deg, pct, uvLevel, uvColor, aqiColor, windDir, beaufort, conditionIcon, moonPhase, escapeHtml as e, ago } from './format.mjs';
import { uvGraph, rainGraph, airGraph, dayCharts, scrubHtml, spark, UV_STOPS, RAIN_STOPS, AQI_STOPS } from './graph.mjs';
import { sunTimes, goldenHours } from './sun.mjs';
import { placeLines } from './api.mjs';
import { scheduleText } from './pins.mjs';

const HOUR = 3_600_000;

// UV's hours: daylight only (6–18時).
export const uvCols = (hours, tz) => hours.filter(h => hourOf(h.t, tz) >= 6 && hourOf(h.t, tz) <= 18);

// The hours from this one on (the graphs start now).
export const hoursFrom = (f, now) => (f?.hours || []).filter(h => h.t + HOUR > now);
const today = (f, now) => f.days?.find(d => d.date === dateOf(now, f.tz)) || f.days?.[0] || null;

// The sky behind the top: by the weather now, day or night.
export function skyOf(n) {
  const c = String(n?.condition?.code || '').toUpperCase();
  const t = String(n?.condition?.text || '');
  const kind = /THUNDER/.test(c) || /雷/.test(t) ? 'storm' : /RAIN|SHOWER|DRIZZLE/.test(c) || /雨/.test(t) ? 'rain' : /PARTLY|MOSTLY_CLEAR|MOSTLY_SUNNY/.test(c) || /多雲/.test(t) ? 'part' : /CLOUDY|OVERCAST|FOG|HAZE/.test(c) || /陰|霧/.test(t) ? 'cloud' : 'clear';
  return `sky-${kind} ${n?.day === false ? 'sky-night' : 'sky-day'}`;
}

// ---- Top: where, and now -----------------------------------------------------------

export function topArea(f, { page, now }) {
  const n = f?.now || {};
  const d = f ? today(f, now) : null;
  const place = placeLines(page.place);
  // 我的行程: the route's title, where you are now under it.
  const title = page.plan ? '我的行程' : page.pin ? page.pin.name : place.main || '目前位置';
  const sub = page.plan ? `現在在 ${page.pin ? page.pin.name : '目前位置'}${place.main ? ` · ${place.main}` : ''}` : page.pin ? [place.main, place.sub].filter(Boolean).join(' · ') : [place.sub, page.note || '目前位置'].filter(Boolean).join(' · ');
  const alerts = (f?.alerts || []).map(a => `<div class="wx-alert">⚠️ ${e(a.title)}${a.to ? `<span>至 ${e(clock(a.to, f.tz))}</span>` : ''}</div>`).join('');
  const h0 = f ? hoursFrom(f, now)[0] : null;
  return `
  <section class="wx-hero ${f ? skyOf(n) : 'sky-cloud sky-day'}">
    <div class="wx-where">
      <h2 class="wx-place">${page.plan ? '🗓️' : page.pin?.home ? '🏠' : page.pin ? '📌' : '📍'} ${e(title)}</h2>
      <p class="wx-sub">${e(sub)}${page.pin && !page.plan ? ` <span class="wx-sched">${e(scheduleText(page.pin))}</span>` : ''}</p>
    </div>
    ${
      f
        ? `<div class="wx-now">
      <div class="wx-temp">${deg(n.temp)}</div>
      <div class="wx-cond"><span class="wx-icon">${conditionIcon(n.condition?.code, n.condition?.text, n.day ?? true)}</span><b>${e(n.condition?.text || '')}</b><span>體感 ${deg(n.feels)}</span></div>
    </div>
    <div class="wx-hilo">
      <div><span>最高</span><b>${deg(d?.hi)}</b><small>體感 ${deg(d?.feelsHi)}</small></div>
      <div><span>最低</span><b>${deg(d?.lo)}</b><small>體感 ${deg(d?.feelsLo)}</small></div>
      <div><span>降雨</span><b>${pct(h0?.pop)}</b><small>濕度 ${pct(n.humidity)}</small></div>
    </div>
    ${f.headline ? `<p class="wx-headline">${e(f.headline)}</p>` : ''}`
        : ''
    }
  </section>${alerts}`;
}

// ---- The cards with graphs --------------------------------------------------------------
//
// Each graph fits the card (no sideways scrolling inside a page that swipes
// sideways); tabs pick the range. The app keeps the choice (`ranges`).

export const RANGES = {
  uv: [['d0', ''], ['d1', ''], ['10d', '10 天']],
  rain: [['24', '24 小時'], ['48', '48 小時'], ['10d', '10 天']]
};
export const rangeOf = (kind, ranges) => (RANGES[kind]?.some(([k]) => k === ranges?.[kind]) ? ranges[kind] : RANGES[kind]?.[0][0]);

const card = ({ cls, icon, title, summary, big, graph, foot = '', tabs = '' }) => `
  <section class="q-card wx-card wx-${cls}">
    <header class="wx-card-head">
      <span class="wx-ic">${icon}</span>
      <div class="wx-card-title"><h3>${title}</h3><p>${summary}</p></div>
      ${big}
    </header>
    ${tabs}
    <div class="wx-readout" data-read="${cls}" aria-live="polite">${foot}</div>
    <div class="wx-graphbox" data-box="${cls}">${graph}<i class="ch-xh" hidden></i><i class="ch-dh" hidden></i></div>
  </section>`;
const tabsHtml = (kind, list, on) => `<div class="wx-tabs" role="tablist">${list.map(([k, name]) => `<button class="wx-tab" type="button" role="tab" data-range="${kind}:${k}" aria-pressed="${k === on}">${e(name)}</button>`).join('')}</div>`;
export const dayText = (date, now, tz) => `${dayLabel(date, now, tz)} ${shortDate(date)}`;

// The 10 days, a column each (for the bars).
export function daysCols(f, now) {
  return (f.days || [])
    .filter(d => d.date >= dateOf(now, f.tz))
    .slice(0, 10)
    .map(d => ({ date: d.date, label: dayLabel(d.date, now, f.tz).replace(/^週/, ''), pop: d.pop, mm: d.mm, uvMax: d.uvMax, daily: true }));
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
  if (kind === 'air') return airCols(f, now);
  if (range === '10d') return daysCols(f, now);
  if (kind === 'rain') return hoursFrom(f, now).slice(0, range === '48' ? 48 : 24);
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
    return p.uv >= 1 ? `最高 ${p.uv} ${uvLevel(p.uv)}${sn.length ? `，${hourOf(sn[0].t, f.tz)}–${hourOf(sn[sn.length - 1].t + HOUR, f.tz)}時防曬` : ''}` : '很弱';
  };
  const shown = range === '10d' ? null : days[range === 'd1' ? 1 : 0];
  const summary = shown ? `${dayLabel(shown.date, now, f.tz)}${dayPeak(shown.date) || ''}` : '每天最高';
  const tabs = tabsHtml('uv', RANGES.uv.map(([k, name], i) => [k, name || (days[i] ? dayLabel(days[i].date, now, f.tz) : '')]).filter(([, name]) => name), range);
  const cols = colsFor('uv', f, now, range);
  return card({ cls: 'uv', icon: '☀️', title: '紫外線', summary: e(summary), big, tabs, graph: uvGraph(cols, { tz: f.tz, now, daily: range === '10d' }), foot: '在圖上點或拖曳看數字' });
}

// The next rain, said once.
export function rainSummary(hours, tz, now) {
  const next = hours.find(h => h.pop >= 50);
  if (!next) {
    const top = hours.slice(0, 48).reduce((a, h) => (h.pop > (a?.pop ?? -1) ? h : a), null);
    return top && top.pop >= 30 ? `${dayLabel(dateOf(top.t, tz), now, tz)} ${hourOf(top.t, tz)}時 ${top.pop}%` : '兩天內不太會下雨';
  }
  return next.t <= now ? `正在下或快下（${next.pop}%）` : `${dayLabel(dateOf(next.t, tz), now, tz)} ${hourOf(next.t, tz)}時起 ${next.pop}%`;
}

export function rainCard(f, { now, ranges }) {
  const hours = hoursFrom(f, now);
  if (!hours.length) return '';
  const pop = hours[0]?.pop;
  const big = `<div class="wx-big wx-rain-big">${pop ?? '–'}<small>%</small></div>`;
  const n = f.now || {};
  const range = rangeOf('rain', ranges);
  const extra = [n.rainToday != null ? `今日 ${n.rainToday} mm` : '', n.rain1h ? `過去 1 小時 ${n.rain1h} mm` : ''].filter(Boolean).join(' · ');
  const cols = colsFor('rain', f, now, range);
  return card({ cls: 'rain', icon: '☔', title: '降雨機率', summary: e(rainSummary(hours, f.tz, now)), big, tabs: tabsHtml('rain', RANGES.rain, range), graph: rainGraph(cols, { tz: f.tz, daily: range === '10d' }), foot: `深色＝雨量${extra ? ` · ${e(extra)}` : ''}` });
}

// The air's columns: now (the station), then the forecast days.
export function airCols(f, now) {
  const a = f.air;
  if (!a) return [];
  const date = dateOf(now, f.tz);
  const days = (a.forecast?.days || []).filter(d => d.date >= date && d.aqi != null);
  return [...(a.aqi != null ? [{ label: '現在', aqi: a.aqi, pm25: a.pm25, now: true }] : []), ...days.map(d => ({ date: d.date, label: dayLabel(d.date, now, f.tz), aqi: d.aqi, main: d.main, daily: true }))];
}

export function airCard(f, { now }) {
  const a = f.air;
  if (!a) return '';
  const cols = airCols(f, now);
  const big = `<div class="wx-big" style="--c:${aqiColor(a.aqi)}">${a.aqi ?? '–'}<small>${e(a.level || '')}</small></div>`;
  const ahead = cols.filter(c => c.daily && c.date > dateOf(now, f.tz));
  const worst = ahead.reduce((x, d) => (d.aqi > (x?.aqi ?? -1) ? d : x), null);
  const summary = `PM2.5 ${a.pm25 ?? '–'} · ${e(a.station?.name || '')} ${a.station?.km ?? '–'} km${worst ? ` · 最差 ${e(worst.label)} ${worst.aqi}` : ''}`;
  return card({ cls: 'air', icon: '🌫️', title: '空氣品質', summary, big, graph: airGraph(cols, { tz: f.tz }), foot: `${ahead.length + 1} 天預報 · 點柱子看等級` });
}

// ---- What to do: today, and the week -------------------------------------------------------

const LIFE = {
  umbrella: ['☂️', '雨傘'], commute: ['🚇', '通勤'], wear: ['👕', '穿著'], sun: ['🧴', '防曬'], run: ['🏃', '跑步'], laundry: ['🧺', '曬衣'],
  sleep: ['🛏️', '睡覺'], window: ['🪟', '開窗'], mask: ['😷', '口罩'], heat: ['🥵', '炎熱'], carwash: ['🚗', '洗車'],
  move: ['🚆', '移動'], diff: ['↔️', '兩地溫差'], weekend: ['🏕️', '週末'], humid: ['💧', '除濕'], temp: ['🌡️', '氣溫'], wind: ['💨', '強風'], thunder: ['⛈️', '雷雨'], fog: ['🌫️', '起霧']
};
const ORDER = ['thunder', 'umbrella', 'move', 'commute', 'wear', 'temp', 'sun', 'wind', 'fog', 'diff', 'run', 'laundry', 'weekend', 'sleep', 'humid', 'window', 'mask', 'heat', 'carwash'];
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function adviceCards(f, { now } = {}) {
  const list = (f.advice || []).filter(a => LIFE[a.kind]).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const plan = (f.advice || []).find(a => a.kind === 'week');
  if (!list.length && !plan) return '';
  // Whose day: today, or tomorrow once today's outing hours are over.
  const first = list.find(a => a.week?.days?.length)?.week.days[0].date;
  const whose = first && now != null && first !== dateOf(now, f.tz) ? '明天' : '今天';
  const tiles = list
    .map(a => {
      const [icon, title] = LIFE[a.kind];
      const text = a.text.replace(/^[^：]+：/, '');
      return `<div class="wx-life lv-${e(a.level)} k-${e(a.kind)}"><span class="wx-life-icon">${icon}</span><div><b>${title}</b><p>${e(text)}</p></div></div>`;
    })
    .join('');
  return `
  <section class="wx-section">
    <h3 class="wx-h">${whose}的建議</h3>
    <div class="wx-lifegrid">${tiles}</div>
    <p class="wx-foot">其他天的建議：點 10 天預報的任一天。</p>
  </section>`;
}
const wdOf = date => (date ? `${weekday(date)} ${shortDate(date)}` : '');

// ---- The days ------------------------------------------------------------------------------

export function daysList(f, { now, key }) {
  const days = (f.days || []).filter(d => d.date >= dateOf(now, f.tz));
  if (!days.length) return '';
  const lo = Math.min(...days.map(d => d.lo ?? Infinity));
  const hi = Math.max(...days.map(d => d.hi ?? -Infinity));
  const span = Math.max(1, hi - lo);
  return `
  <section class="wx-section">
    <h3 class="wx-h">${days.length} 天預報</h3>
    <div class="q-card wx-days">
      ${days
        .map(d => {
          const left = (((d.lo ?? lo) - lo) / span) * 100;
          const right = (((d.hi ?? hi) - lo) / span) * 100;
          const c = d.day?.condition || {};
          return `<button class="wx-day" type="button" data-day="${e(d.date)}" data-page="${e(key)}">
            <span class="wx-dname">${e(dayLabel(d.date, now, f.tz))}<small>${d.places?.length > 1 ? e(d.places.join('·')) : shortDate(d.date)}</small></span>
            <span class="wx-dicon">${conditionIcon(c.code, c.text, true)}</span>
            <span class="wx-dpop" style="--p:${d.pop ?? 0}%"><b>${d.pop == null ? '–' : `${d.pop}%`}</b><i></i></span>
            <span class="wx-dlo">${deg(d.lo)}</span>
            <span class="wx-bar"><i style="left:${left.toFixed(1)}%;width:${Math.max(4, right - left).toFixed(1)}%"></i></span>
            <span class="wx-dhi">${deg(d.hi)}</span>
            <span class="wx-duv" style="--c:${uvColor(d.uvMax)}">${d.uvMax ?? ''}</span>
          </button>`;
        })
        .join('')}
    </div>
  </section>`;
}

// The sheet for one day: its graph with everything on it, then its numbers.
// A day's recommendations, from its own hours: what to bring and wear, when
// to run, whether to wash and hang laundry, sun, heat, air, storms, wind.
const WEAR = [[15, '外套'], [20, '薄外套'], [26, '長袖'], [Infinity, '短袖']];
export function dayTips(f, date, now) {
  const tz = f.tz;
  const d = f.days?.find(x => x.date === date);
  const hours = (f.hours || []).filter(h => dateOf(h.t, tz) === date);
  const awake = hours.filter(h => hourOf(h.t, tz) >= 6 && hourOf(h.t, tz) < 22);
  const tips = [];
  const at = h => `${hourOf(h.t, tz)}時${h.place ? `（${h.place}）` : ''}`;
  // Rain.
  const wet = awake.reduce((a, h) => ((h.pop ?? -1) > (a?.pop ?? -1) ? h : a), null);
  const pop = wet?.pop ?? d?.pop ?? null;
  if (pop != null) tips.push(pop >= 50 ? { k: 'umbrella', icon: '☂️', title: '雨傘', text: `要帶${wet ? `，${at(wet)} ${wet.pop}%` : ''}`, lv: 'yes' } : pop >= 30 ? { k: 'umbrella', icon: '☂️', title: '雨傘', text: `摺疊傘${wet ? `，${at(wet)} ${wet.pop}%` : ''}`, lv: 'maybe' } : { k: 'umbrella', icon: '☂️', title: '雨傘', text: '不用帶', lv: 'none' });
  // Clothes: a third of the way from the day's coolest to warmest feel.
  const fl = awake.map(h => h.feels ?? h.temp).filter(v => v != null);
  const lo = fl.length ? Math.min(...fl) : d?.feelsLo ?? d?.lo;
  const hi = fl.length ? Math.max(...fl) : d?.feelsHi ?? d?.hi;
  if (lo != null && hi != null) tips.push({ k: 'wear', icon: '👕', title: '穿著', text: `${WEAR.find(([m]) => lo + (hi - lo) / 3 < m)[1]}${hi - lo >= 7 ? '，早晚加件' : ''}（${Math.round(lo)}–${Math.round(hi)}°）`, lv: hi - lo >= 7 ? 'maybe' : 'none' });
  // Running: the best 2 hours, 6–20時.
  const cost = h => {
    const v = h.feels ?? h.temp;
    return (h.pop ?? 0) * 1.2 + Math.max(0, v - 24) * 6 + Math.max(0, 16 - v) * 4 + Math.max(0, (h.uv ?? 0) - 5) * 8 + ((h.thunder ?? 0) >= 40 ? 30 : 0);
  };
  const runH = hours.filter(h => hourOf(h.t, tz) >= 6 && hourOf(h.t, tz) <= 20 && h.t + HOUR > now && (h.feels ?? h.temp) != null);
  let best = null;
  for (let i = 0; i + 1 < runH.length; i++) {
    if (runH[i + 1].t - runH[i].t !== HOUR) continue;
    const c = (cost(runH[i]) + cost(runH[i + 1])) / 2;
    if (!best || c < best.c) best = { c, h: runH[i] };
  }
  if (best) tips.push({ k: 'run', icon: '🏃', title: '跑步', text: `${hourOf(best.h.t, tz)}–${hourOf(best.h.t, tz) + 2}時${best.c < 45 ? '最好' : '還可以'}（${Math.round(best.h.feels ?? best.h.temp)}°）`, lv: best.c < 45 ? 'good' : 'none' });
  // Laundry: dry and not overcast.
  if (d) {
    const dry = d.pop != null && d.pop < 20 && !/^CLOUDY|RAIN|SHOWER|THUNDER|DRIZZLE/.test(d.day?.condition?.code || '');
    tips.push({ k: 'laundry', icon: '🧺', title: '曬衣', text: dry ? '適合' : d.pop != null && d.pop < 40 ? '可以，但乾得慢' : '不適合，用烘乾', lv: dry ? 'good' : d.pop >= 40 ? 'bad' : 'none' });
  }
  // Sun.
  const sunny = hours.filter(h => h.uv >= 3);
  if (sunny.length) {
    const top = Math.max(...sunny.map(h => h.uv));
    tips.push({ k: 'sun', icon: '🧴', title: '防曬', text: `${hourOf(sunny[0].t, tz)}–${hourOf(sunny[sunny.length - 1].t, tz) + 1}時 UV ${top}`, lv: top >= 6 ? 'yes' : 'none' });
  }
  // Heat, air, storms, wind (only when they matter).
  if (hi >= 34) tips.push({ k: 'heat', icon: '🥵', title: '炎熱', text: `體感 ${Math.round(hi)}°，多喝水`, lv: 'yes' });
  const air = f.air?.forecast?.days?.find(x => x.date === date);
  if (air?.aqi > 100) tips.push({ k: 'mask', icon: '😷', title: '口罩', text: `空氣${air.level || '不佳'}（${air.aqi}）`, lv: 'yes' });
  const storm = hours.filter(h => h.thunder >= 40);
  if (storm.length) tips.push({ k: 'thunder', icon: '⛈️', title: '雷雨', text: `${hourOf(storm[0].t, tz)}–${hourOf(storm[storm.length - 1].t, tz) + 1}時可能打雷`, lv: 'yes' });
  const gust = hours.reduce((a, h) => ((h.wind?.gust ?? 0) > (a?.wind?.gust ?? 0) ? h : a), null);
  if (gust?.wind?.gust >= 50) tips.push({ k: 'wind', icon: '💨', title: '強風', text: `${hourOf(gust.t, tz)}時陣風 ${Math.round(gust.wind.gust)} km/h`, lv: 'yes' });
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
  const sum = `<div class="wx-scrub-time"><b>全天</b><span>${e(places || c.text || '')}</span></div>
    <div class="wx-scrub-vals">
      <div><span>最高 / 最低</span><b>${deg(d?.hi)} / ${deg(d?.lo)}</b><small>體感 ${deg(d?.feelsHi)} / ${deg(d?.feelsLo)}</small></div>
      <div><span>降雨</span><b>${pct(d?.pop)}</b><small>${d?.mm ? `約 ${d.mm} mm` : ''}</small></div>
      <div><span>紫外線</span><b>${d?.uvMax ?? '–'}</b><small>${uvLevel(d?.uvMax) || ''}</small></div>
      <div><span>空氣</span><b style="color:${fc ? aqiColor(fc.aqi) : 'inherit'}">${fc?.aqi ?? '–'}</b><small>${e(fc?.level || '')}</small></div>
    </div>`;
  return `
    <div class="q-sheet-head">
      <button class="q-icon-btn wx-mini" type="button" data-dayn="${e(prev || '')}" aria-label="前一天" ${prev ? '' : 'disabled'}>‹</button>
      <h2>${/^週/.test(dayLabel(date, now, f.tz)) ? '' : `${e(dayLabel(date, now, f.tz))} `}${shortDate(date)} ${weekday(date)} <span class="wx-day-icon">${conditionIcon(c.code, c.text, true)}</span></h2>
      <button class="q-icon-btn wx-mini" type="button" data-dayn="${e(next || '')}" aria-label="後一天" ${next ? '' : 'disabled'}>›</button>
      <button class="q-close" type="button" data-act="close" aria-label="關閉">×</button>
    </div>
    <div class="wx-dayg">
      <div class="wx-scrub" aria-live="polite" data-sum="1">${sum}</div>
      ${hours.length >= 4 ? `<div class="wx-dayg-plot">${dayCharts(hours, { tz: f.tz })}</div><p class="wx-foot wx-hint">手指按在圖上滑動，看每小時</p>` : '<p class="wx-foot">這一天沒有逐時資料。</p>'}
    </div>
    ${tips.length ? `<h3 class="q-sheet-h">這天的建議</h3><div class="wx-lifegrid">${tips.map(t => `<div class="wx-life lv-${t.lv} k-${t.k}"><span class="wx-life-icon">${t.icon}</span><div><b>${t.title}</b><p>${e(t.text)}</p></div></div>`).join('')}</div>` : ''}
    <div class="wx-grid">
      ${d?.day ? `<div><span>白天</span><b>${conditionIcon(d.day.condition?.code, d.day.condition?.text, true)} ${e(d.day.condition?.text || '')}</b><small>降雨 ${pct(d.day.pop)}</small></div>` : ''}
      ${d?.night ? `<div><span>晚上</span><b>${conditionIcon(d.night.condition?.code, d.night.condition?.text, false)} ${e(d.night.condition?.text || '')}</b><small>降雨 ${pct(d.night.pop)}</small></div>` : ''}
      ${s ? `<div><span>日出 / 日落</span><b>${clock(s.sunrise, f.tz)} / ${clock(s.sunset, f.tz)}</b></div>` : ''}
    </div>`;
}

// ---- Everything else ------------------------------------------------------------------------

export function infoCard(f, { now, lat, lon, page }) {
  const n = f.now || {};
  const w = n.wind || {};
  const h0 = f.hours?.[0];
  const h3 = f.hours?.[3];
  const date = dateOf(now, f.tz);
  const d = today(f, now);
  const s = d?.sunrise ? { sunrise: d.sunrise, sunset: d.sunset } : lat != null ? sunTimes(date, lat, lon) : null;
  const g = s && goldenHours(s);
  const len = s ? s.sunset - s.sunrise : 0;
  const moon = moonPhase(d?.moon?.phase);
  const trend = n.pressure != null && h3?.pressure != null ? (h3.pressure - n.pressure > 0.5 ? ' ↑' : h3.pressure - n.pressure < -0.5 ? ' ↓' : ' →') : '';
  const items = [
    ['💧', '濕度', pct(n.humidity ?? h0?.humidity), `露點 ${deg(n.dew ?? h0?.dew)}`],
    ['🌬️', '風', w.speed != null ? `<span class="wx-compass" style="--d:${w.dir ?? 0}deg">➤</span> ${e(windDir(w.dir))} ${beaufort(w.speed)} 級` : '–', w.gust ? `陣風 ${beaufort(w.gust)} 級（${Math.round(w.gust)} km/h）` : ''],
    ['🧭', '氣壓', n.pressure != null ? `${Math.round(n.pressure)} hPa${trend}` : '–', trend ? '未來 3 小時' : ''],
    ['👁️', '能見度', n.vis != null ? `${n.vis} 公里` : '–', `雲量 ${pct(n.cloud ?? h0?.cloud)}`],
    ['🌧️', '今日雨量', n.rainToday != null ? `${n.rainToday} mm` : '–', n.rain1h != null ? `過去 1 小時 ${n.rain1h} mm` : ''],
    ['⚡', '雷雨機率', pct(h0?.thunder), ''],
    ['🌅', '日出', s ? clock(s.sunrise, f.tz) : '–', g ? `黃金時刻 ${clock(g.morning[0], f.tz)}–${clock(g.morning[1], f.tz)}` : ''],
    ['🌇', '日落', s ? clock(s.sunset, f.tz) : '–', g ? `黃金時刻 ${clock(g.evening[0], f.tz)}–${clock(g.evening[1], f.tz)}` : ''],
    ['⏱️', '日照長度', s ? `${Math.floor(len / HOUR)} 小時 ${Math.round((len % HOUR) / 60_000)} 分` : '–', ''],
    [moon ? moon[1] : '🌙', '月相', moon ? moon[0] : '–', d?.moon?.rise ? `月出 ${clock(d.moon.rise, f.tz)}${d.moon.set ? ` · 月落 ${clock(d.moon.set, f.tz)}` : ''}` : ''],
    ['🫁', 'PM10 / 臭氧', `${f.air?.pm10 ?? '–'} / ${f.air?.o3 ?? '–'}`, 'μg/m³ / ppb'],
    ['🌡️', '附近測站', n.station ? `${e(n.station.name)} ${n.station.temp != null ? deg(n.station.temp) : ''}` : '–', n.station ? `${n.station.km} 公里 · ${clock(n.station.at, f.tz)} 實測` : ''],
    ['📍', '位置', page.place?.village ? e(page.place.village) : '–', page.place ? e([page.place.county, page.place.town].filter(Boolean).join(' ')) : '']
  ];
  return `
  <section class="wx-section">
    <h3 class="wx-h">更多資訊</h3>
    <div class="q-card wx-info">
      <div class="wx-tiles">${items.map(([icon, k, v, sub]) => `<div class="wx-tile"><span>${icon} ${k}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`).join('')}</div>
      <p class="wx-foot">${f.partial ? '部分資料稍舊 · ' : ''}更新於 ${e(ago(f.at, now))}</p>
    </div>
  </section>`;
}

// ---- The metrics: a small card each, the big graph in a sheet ------------------------------

const tile = ({ kind, key, icon, title, value, color, sub, art }) => `
  <button class="q-card wx-metric k-${kind}" type="button" data-metric="${kind}" data-page="${e(key)}">
    <span class="wx-metric-head">${icon} ${title}</span>
    <b class="wx-metric-val" style="--c:${color}">${value}</b>
    <span class="wx-metric-sub">${sub}</span>
    ${art}
  </button>`;

export function rainTile(f, { now, key }) {
  const hours = hoursFrom(f, now);
  if (!hours.length) return '';
  const next = hours.slice(0, 24);
  return tile({ kind: 'rain', key, icon: '☔', title: '降雨', value: `${hours[0].pop ?? '–'}<small>%</small>`, color: '#60a5fa', sub: e(rainSummary(hours, f.tz, now)), art: spark(next.map(h => h.pop), { max: 100, stops: RAIN_STOPS }) });
}
export function uvTile(f, { now, key }) {
  const hours = hoursFrom(f, now);
  if (!hours.some(h => h.uv != null)) return '';
  const day = uvDays(f, now)[0];
  const list = (day?.hours || []).filter(h => h.uv != null);
  const peak = list.reduce((a, h) => (h.uv > (a?.uv ?? -1) ? h : a), null);
  const nowUv = f.now?.uv ?? hours[0]?.uv;
  const sub = peak ? `${dayLabel(day.date, now, f.tz)}最高 ${peak.uv}（${hourOf(peak.t, f.tz)}時）` : '';
  return tile({ kind: 'uv', key, icon: '☀️', title: '紫外線', value: `${nowUv ?? '–'}<small>${uvLevel(nowUv) || ''}</small>`, color: uvColor(nowUv), sub: e(sub), art: spark(list.map(h => h.uv), { max: 11, stops: UV_STOPS }) });
}
export function airTile(f, { now, key }) {
  const a = f.air;
  if (!a) return '';
  const cols = airCols(f, now);
  return tile({ kind: 'air', key, icon: '🌫️', title: '空氣', value: `${a.aqi ?? '–'}<small>${e(a.level || '')}</small>`, color: aqiColor(a.aqi), sub: e(`PM2.5 ${a.pm25 ?? '–'} · ${cols.length - 1} 天預報`), art: spark(cols.map(c => c.aqi), { max: 150, stops: AQI_STOPS, bars: true }) });
}
export function metricTiles(f, opts) {
  const tiles = [rainTile(f, opts), uvTile(f, opts), airTile(f, opts)].filter(Boolean);
  if (!tiles.length) return '';
  return `
  <section class="wx-section">
    <h3 class="wx-h">天氣指標 <small>點一下看圖</small></h3>
    <div class="wx-metrics" style="--n:${tiles.length}">${tiles.join('')}</div>
  </section>`;
}
// The sheet a metric opens: its big graph, tabs and read-out.
export const METRIC_TITLES = { rain: '降雨機率', uv: '紫外線', air: '空氣品質' };
export function metricSheet(kind, f, opts) {
  const body = { rain: rainCard, uv: uvCard, air: airCard }[kind]?.(f, opts) || '';
  return `<div class="q-sheet-head"><h2>${METRIC_TITLES[kind]}</h2><button class="q-close" type="button" data-act="close" aria-label="關閉">×</button></div>${body}`;
}

// A whole page.
const SECTIONS = { metrics: metricTiles, advice: (f, o) => adviceCards(f, o), days: daysList, info: infoCard };
export function pageHtml(f, page, { now, cards = Object.keys(SECTIONS), hidden = [], ranges = {} }) {
  const top = topArea(f, { page, now });
  if (!f) return `${top}<section class="q-card wx-empty">${page.error ? `<p>${e(page.error)}</p><button class="q-btn" type="button" data-act="retry" data-page="${e(page.key)}">再試一次</button>` : '<div class="wx-spin"></div><p>正在取得天氣…</p>'}</section>`;
  const opts = { now, key: page.key, lat: page.lat, lon: page.lon, page, ranges };
  // 我的行程: what matters on the move, in this order.
  if (page.plan) [cards, hidden] = [['metrics', 'advice', 'days'], []];
  return [top, ...cards.filter(k => SECTIONS[k] && !hidden.includes(k)).map(k => SECTIONS[k](f, opts))].join('');
}
