// One place's page, top to bottom: where and now; then the cards in the
// owner's order (default: UV, rain and air, each with its graph; what to do,
// today and this week; the days; everything else). One truth: one value for each thing, no sources named.

import { clock, hourOf, dateOf, dayLabel, shortDate, weekday, deg, pct, uvLevel, uvColor, aqiColor, windDir, beaufort, conditionIcon, moonPhase, escapeHtml as e, ago } from './format.mjs';
import { uvGraph, rainGraph, airGraph, dayGraph, uvCols, scrubHtml } from './graph.mjs';
import { sunTimes, goldenHours } from './sun.mjs';
import { placeLines } from './api.mjs';
import { scheduleText } from './pins.mjs';

const HOUR = 3_600_000;

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

const card = ({ cls, icon, title, summary, big, graph, first, foot = '' }) => `
  <section class="q-card wx-card wx-${cls}">
    <header class="wx-card-head">
      <span class="wx-ic">${icon}</span>
      <div class="wx-card-title"><h3>${title}</h3><p>${summary}</p></div>
      ${big}
    </header>
    <div class="wx-readout" data-read="${cls}" aria-live="polite" data-hint="${e(foot)}">${foot}</div>
    <div class="wx-graphbox">
      <span class="wx-when" data-when="${cls}">${e(first || '')}</span>
      <div class="wx-scroll" data-scroll="${cls}">${graph}</div>
    </div>
  </section>`;
export const dayText = (date, now, tz) => `${dayLabel(date, now, tz)} ${shortDate(date)}`;

export function uvCard(f, { now }) {
  const hours = hoursFrom(f, now);
  if (!hours.some(h => h.uv != null)) return '';
  const date = dateOf(now, f.tz);
  const nowUv = f.now?.uv ?? hours[0]?.uv;
  const big = `<div class="wx-big" style="--c:${uvColor(nowUv)}">${nowUv ?? '–'}<small>${uvLevel(nowUv) || ''}</small></div>`;
  // Today's peak while there's one ahead; else tomorrow's.
  const dayPeak = d => {
    const list = hours.filter(h => dateOf(h.t, f.tz) === d && h.uv != null);
    if (!list.length) return null;
    const p = list.reduce((a, h) => (h.uv > a.uv ? h : a), list[0]);
    const s = list.filter(h => h.uv >= 3);
    return p.uv >= 1 ? `最高 ${p.uv} ${uvLevel(p.uv)}${s.length ? `，${hourOf(s[0].t, f.tz)}–${hourOf(s[s.length - 1].t + HOUR, f.tz)}時防曬` : ''}` : null;
  };
  const todayText = dayPeak(date);
  const tomorrowText = dayPeak(dateOf(now + 86_400_000, f.tz));
  const summary = todayText ? `今天${todayText}` : tomorrowText ? `明天${tomorrowText}` : '很弱';
  const cols = uvCols(hours, f.tz);
  return card({ cls: 'uv', icon: '☀️', title: '紫外線', summary: e(summary), big, graph: uvGraph(hours, { tz: f.tz, now }), first: cols[0] ? dayText(dateOf(cols[0].t, f.tz), now, f.tz) : '', foot: '點一下或按住滑動看每小時' });
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

// The rain graph's columns: every hour forecast, then any days past them.
export function rainCols(f, now) {
  const hours = hoursFrom(f, now);
  const lastDate = hours.length ? dateOf(hours[hours.length - 1].t, f.tz) : dateOf(now - 86_400_000, f.tz);
  const more = (f.days || []).filter(d => d.date > lastDate).map(d => ({ date: d.date, daily: true, label: dayLabel(d.date, now, f.tz), pop: d.pop, mm: d.mm }));
  return [...hours, ...more];
}

export function rainCard(f, { now }) {
  const hours = hoursFrom(f, now);
  if (!hours.length) return '';
  const pop = hours[0]?.pop;
  const big = `<div class="wx-big wx-rain-big">${pop ?? '–'}<small>%</small></div>`;
  const n = f.now || {};
  const extra = [n.rainToday != null ? `今日雨量 ${n.rainToday} mm` : '', n.rain1h ? `過去 1 小時 ${n.rain1h} mm` : ''].filter(Boolean).join(' · ');
  return card({ cls: 'rain', icon: '☔', title: '降雨機率', summary: e(rainSummary(hours, f.tz, now)), big, graph: rainGraph(rainCols(f, now), { tz: f.tz, now }), first: dayText(dateOf(hours[0].t, f.tz), now, f.tz), foot: `深色柱＝雨量${extra ? ` · ${e(extra)}` : ''}` });
}

// The air graph's columns: the hours measured, then the hours forecast; or
// without those, the days' forecasts.
export function airCols(f, now) {
  const a = f.air;
  if (!a) return [];
  const hist = (a.history || [])
    .filter(x => now - x.t < 48 * HOUR)
    .map(x => ({ t: x.t, aqi: x.aqi, pm25: x.pm25 }))
    .sort((x, y) => x.t - y.t);
  if (!hist.length && a.aqi != null) hist.push({ t: a.at || now, aqi: a.aqi, pm25: a.pm25 });
  const end = hist.length ? hist[hist.length - 1].t : now - HOUR;
  const hourly = (a.hourly || []).filter(h => h.t > end).map(h => ({ t: h.t, aqi: h.aqi, pm25: h.pm25, fc: true }));
  if (hourly.length) return [...hist, ...hourly];
  const date = dateOf(now, f.tz);
  const days = (a.forecast?.days || []).filter(d => d.date >= date && d.aqi != null);
  return [...hist, ...days.map(d => ({ date: d.date, label: dayLabel(d.date, now, f.tz), aqi: d.aqi, fc: true, daily: true }))];
}

export function airCard(f, { now }) {
  const a = f.air;
  if (!a) return '';
  const cols = airCols(f, now);
  const big = `<div class="wx-big" style="--c:${aqiColor(a.aqi)}">${a.aqi ?? '–'}<small>${e(a.level || '')}</small></div>`;
  const ahead = (a.forecast?.days || []).filter(d => d.date > dateOf(now, f.tz));
  const worst = ahead.reduce((x, d) => (d.aqi > (x?.aqi ?? -1) ? d : x), null);
  const summary = `PM2.5 ${a.pm25 ?? '–'} · ${e(a.station?.name || '')} ${a.station?.km ?? '–'} km${worst && worst.aqi > 50 ? ` · ${e(dayLabel(worst.date, now, f.tz))} ${worst.aqi}` : ''}`;
  const c0 = cols[0];
  return card({ cls: 'air', icon: '🌫️', title: '空氣品質', summary, big, graph: airGraph(cols, { tz: f.tz, now }), first: c0 ? dayText(c0.date || dateOf(c0.t, f.tz), now, f.tz) : '', foot: '實線：實測 · 虛線：預測' });
}

// ---- What to do: today, and the week -------------------------------------------------------

const LIFE = {
  umbrella: ['☂️', '雨傘'], commute: ['🚇', '通勤'], wear: ['👕', '穿著'], sun: ['🧴', '防曬'], outdoor: ['🏃', '戶外'], laundry: ['🧺', '曬衣'],
  sleep: ['🛏️', '睡覺'], window: ['🪟', '開窗'], mask: ['😷', '口罩'], heat: ['🥵', '炎熱'], carwash: ['🚗', '洗車'],
  move: ['🚆', '移動'], diff: ['↔️', '兩地溫差']
};
const ORDER = ['umbrella', 'move', 'commute', 'wear', 'sun', 'diff', 'outdoor', 'laundry', 'sleep', 'window', 'mask', 'heat', 'carwash'];
// The week's table: a row per kind that has days.
const ROWS = { umbrella: '☂️ 雨', laundry: '🧺 曬衣', sun: '🧴 UV', wear: '👕 穿', heat: '🥵 熱', mask: '😷 空氣' };
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
  const rows = Object.keys(ROWS)
    .map(k => [k, (f.advice || []).find(a => a.kind === k)?.week?.days])
    .filter(([, days]) => days?.length);
  const dates = rows[0]?.[1].map(d => d.date) || [];
  const best = plan?.why?.best;
  const worst = plan?.why?.worst;
  const table = rows.length
    ? `<div class="q-card wx-weekgrid" style="--n:${dates.length}">
      <div class="wx-wg-row wx-wg-head"><span></span>${dates.map(d => `<span class="${d === best ? 'is-best' : d === worst ? 'is-worst' : ''}">${d === best ? '★' : ''}${WEEK[new Date(d + 'T12:00:00Z').getUTCDay()]}<small>${shortDate(d)}</small></span>`).join('')}</div>
      ${rows
        .map(([k, days]) => `<div class="wx-wg-row k-${k}"><span class="wx-wg-name">${ROWS[k]}</span>${dates.map(d => {
          const c = days.find(x => x.date === d);
          return `<span class="wx-wg-cell m-${e(c?.mark || 'none')}">${e(c?.v || '')}</span>`;
        }).join('')}</div>`)
        .join('')}
      ${plan ? `<p class="wx-wg-foot">★ 最佳 ${e(wdOf(best))}${worst ? ` · 最差 ${e(wdOf(worst))}` : ''}${plan.why?.laundry ? ` · 曬衣 ${e(wdOf(plan.why.laundry))}` : ''}</p>` : ''}
    </div>`
    : '';
  return `
  <section class="wx-section">
    <h3 class="wx-h">${whose}的建議</h3>
    <div class="wx-lifegrid">${tiles}</div>
    ${table ? `<h3 class="wx-h">這一週</h3>${table}` : ''}
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
export function daySheet(f, date, { now, lat, lon }) {
  const d = f.days?.find(x => x.date === date);
  const hours = (f.hours || []).filter(h => dateOf(h.t, f.tz) === date);
  const aqi = (f.air?.history || []).filter(a => dateOf(a.t, f.tz) === date);
  const s = d?.sunrise ? { sunrise: d.sunrise, sunset: d.sunset } : lat != null ? sunTimes(date, lat, lon) : null;
  const half = (name, h) => (h ? `<div><span>${name}</span><b>${conditionIcon(h.condition?.code, h.condition?.text, name === '白天')} ${e(h.condition?.text || '')}</b><small>降雨 ${pct(h.pop)}</small></div>` : '');
  const fc = f.air?.forecast?.days?.find(x => x.date === date);
  // The days either side (for ‹ ›), and the hour the read-out starts at:
  // now on today, else noon.
  const dates = (f.days || []).map(x => x.date).filter(x => x >= dateOf(now, f.tz));
  const at = dates.indexOf(date);
  const prev = at > 0 ? dates[at - 1] : null;
  const next = at >= 0 && at < dates.length - 1 ? dates[at + 1] : null;
  const nowAt = hours.findIndex(h => h.t <= now && now < h.t + HOUR);
  const noon = hours.findIndex(h => clock(h.t, f.tz) === '12:00');
  const start = Math.max(0, nowAt >= 0 ? nowAt : noon);
  const aqiAt = h => (h ? aqi.find(a => Math.floor(a.t / HOUR) === Math.floor(h.t / HOUR)) || null : null);
  return `
    <div class="q-sheet-head">
      <button class="q-icon-btn wx-mini" type="button" data-dayn="${e(prev || '')}" aria-label="前一天" ${prev ? '' : 'disabled'}>‹</button>
      <h2>${/^週/.test(dayLabel(date, now, f.tz)) ? '' : `${e(dayLabel(date, now, f.tz))} `}${shortDate(date)} ${weekday(date)}</h2>
      <button class="q-icon-btn wx-mini" type="button" data-dayn="${e(next || '')}" aria-label="後一天" ${next ? '' : 'disabled'}>›</button>
      <button class="q-close" type="button" data-act="close" aria-label="關閉">×</button>
    </div>
    ${
      hours.length >= 4
        ? `<div class="wx-dayg">
      <div class="wx-scrub" aria-live="polite">${scrubHtml(hours[start], { tz: f.tz, aqi: aqiAt(hours[start]) })}</div>
      <div class="wx-dayg-plot" data-start="${start}">${dayGraph(hours, { tz: f.tz, aqi })}</div>
      <div class="wx-legend"><span class="l-temp">溫度</span><span class="l-feels">體感</span><span class="l-uv">紫外線</span><span class="l-rain">降雨機率</span>${aqi.length ? '<span class="l-air">空氣</span>' : ''}<em>按住圖左右滑，看每小時</em></div>
    </div>`
        : '<p class="wx-foot">這一天沒有逐時資料。</p>'
    }
    <div class="wx-grid">
      <div><span>最高 / 最低</span><b>${deg(d?.hi)} / ${deg(d?.lo)}</b><small>體感 ${deg(d?.feelsHi)} / ${deg(d?.feelsLo)}</small></div>
      <div><span>降雨機率</span><b>${pct(d?.pop)}</b><small>${d?.mm ? `約 ${d.mm} mm` : ''}</small></div>
      <div><span>紫外線最高</span><b>${d?.uvMax ?? '–'}</b><small>${uvLevel(d?.uvMax) || ''}</small></div>
      ${fc ? `<div><span>空氣（預測）</span><b style="color:${aqiColor(fc.aqi)}">${e(fc.level || '')}</b><small>AQI ${fc.aqi ?? '–'}</small></div>` : ''}
      ${half('白天', d?.day)}${half('晚上', d?.night)}
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

// A whole page.
const SECTIONS = { uv: uvCard, rain: rainCard, air: airCard, advice: (f, o) => adviceCards(f, o), days: daysList, info: infoCard };
export function pageHtml(f, page, { now, cards = Object.keys(SECTIONS), hidden = [] }) {
  const top = topArea(f, { page, now });
  if (!f) return `${top}<section class="q-card wx-empty">${page.error ? `<p>${e(page.error)}</p><button class="q-btn" type="button" data-act="retry" data-page="${e(page.key)}">再試一次</button>` : '<div class="wx-spin"></div><p>正在取得天氣…</p>'}</section>`;
  const opts = { now, key: page.key, lat: page.lat, lon: page.lon, page };
  return [top, ...cards.filter(k => SECTIONS[k] && !hidden.includes(k)).map(k => SECTIONS[k](f, opts))].join('');
}
