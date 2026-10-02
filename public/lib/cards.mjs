// One place's page, top to bottom: where and now; then the cards in the
// owner's order (default: UV, rain and air, each with its graph; what to do,
// today and this week; the days; everything else). One truth: one value for each thing, no sources named.

import { clock, dateOf, dayLabel, shortDate, weekday, deg, pct, uvLevel, uvColor, aqiColor, windDir, beaufort, conditionIcon, moonPhase, escapeHtml as e, ago } from './format.mjs';
import { uvGraph, rainGraph, airGraph, dayGraph, uvCols } from './graph.mjs';
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
  const title = page.pin ? page.pin.name : place.main || '目前位置';
  const sub = page.pin ? [place.main, place.sub].filter(Boolean).join(' · ') : [place.sub, page.note || '目前位置'].filter(Boolean).join(' · ');
  const alerts = (f?.alerts || []).map(a => `<div class="wx-alert">⚠️ ${e(a.title)}${a.to ? `<span>至 ${e(clock(a.to, f.tz))}</span>` : ''}</div>`).join('');
  const h0 = f ? hoursFrom(f, now)[0] : null;
  return `
  <section class="wx-hero ${f ? skyOf(n) : 'sky-cloud sky-day'}">
    <div class="wx-where">
      <h2 class="wx-place">${page.pin ? '📌' : '📍'} ${e(title)}</h2>
      <p class="wx-sub">${e(sub)}${page.pin ? ` <span class="wx-sched">${e(scheduleText(page.pin))}</span>` : ''}</p>
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
    <div class="wx-graphbox">
      <span class="wx-when" data-when="${cls}">${e(first || '')}</span>
      <div class="wx-scroll" data-scroll="${cls}">${graph}</div>
    </div>
    <p class="wx-readout" data-read="${cls}" aria-live="polite">${foot || '點柱子看數字，左右滑動看之後'}</p>
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
    return p.uv >= 1 ? `最高 ${p.uv}（${uvLevel(p.uv)}）於 ${clock(p.t, f.tz)}${s.length ? `，${clock(s[0].t, f.tz)}–${clock(s[s.length - 1].t + HOUR, f.tz)} 要防曬` : ''}` : null;
  };
  const todayText = dayPeak(date);
  const tomorrowText = dayPeak(dateOf(now + 86_400_000, f.tz));
  const summary = todayText ? `今天${todayText}` : tomorrowText ? `明天${tomorrowText}` : '紫外線很弱';
  const cols = uvCols(hours, f.tz);
  return card({ cls: 'uv', icon: '☀️', title: '紫外線', summary: e(summary), big, graph: uvGraph(hours, { tz: f.tz, now }), first: cols[0] ? dayText(dateOf(cols[0].t, f.tz), now, f.tz) : '', foot: '白天 6–18 時，點柱子看數字' });
}

// The next rain, said once.
export function rainSummary(hours, tz, now) {
  const next = hours.find(h => h.pop >= 50);
  if (!next) {
    const top = hours.slice(0, 48).reduce((a, h) => (h.pop > (a?.pop ?? -1) ? h : a), null);
    return top && top.pop >= 30 ? `${dayLabel(dateOf(top.t, tz), now, tz)} ${clock(top.t, tz)} 有機會下雨（${top.pop}%）` : '接下來兩天不太會下雨';
  }
  return next.t <= now ? `正在或即將下雨（${next.pop}%）` : `${dayLabel(dateOf(next.t, tz), now, tz)} ${clock(next.t, tz)} 起可能下雨（${next.pop}%）`;
}

export function rainCard(f, { now }) {
  const hours = hoursFrom(f, now);
  if (!hours.length) return '';
  const pop = hours[0]?.pop;
  const big = `<div class="wx-big wx-rain-big">${pop ?? '–'}<small>%</small></div>`;
  const n = f.now || {};
  const extra = [n.rainToday != null ? `今日雨量 ${n.rainToday} mm` : '', n.rain1h ? `過去 1 小時 ${n.rain1h} mm` : ''].filter(Boolean).join(' · ');
  return card({ cls: 'rain', icon: '☔', title: '降雨機率', summary: e(rainSummary(hours, f.tz, now)), big, graph: rainGraph(hours, { tz: f.tz, now }), first: dayText(dateOf(hours[0].t, f.tz), now, f.tz), foot: `淺色是機率，深色是雨量${extra ? ` · ${e(extra)}` : ''}` });
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
  const summary = `PM2.5 ${a.pm25 ?? '–'} · ${e(a.station?.name || '')}測站 ${a.station?.km ?? '–'} 公里${worst ? ` · 之後最差 ${e(dayLabel(worst.date, now, f.tz))} ${worst.aqi}` : ''}`;
  const c0 = cols[0];
  return card({ cls: 'air', icon: '🌫️', title: '空氣品質', summary, big, graph: airGraph(cols, { tz: f.tz, now }), first: c0 ? dayText(c0.date || dateOf(c0.t, f.tz), now, f.tz) : '', foot: '左邊是測到的，右邊是預測，點柱子看數字' });
}

// ---- What to do: today, and the week -------------------------------------------------------

const ADVICE = { umbrella: ['☂️', '帶傘'], sun: ['🧴', '防曬'], wear: ['👕', '穿著'], heat: ['🥵', '炎熱'], mask: ['😷', '口罩'], week: ['📅', '這一週'] };
const ORDER = Object.keys(ADVICE);
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const strip = days =>
  `<div class="wx-strip">${days
    .map(d => `<span class="wx-sd m-${e(d.mark || 'none')}"><small>${WEEK[new Date(d.date + 'T12:00:00Z').getUTCDay()]}</small><i></i><em>${e(d.v || '')}</em></span>`)
    .join('')}</div>`;

export function adviceCards(f, { now } = {}) {
  const tz = f.tz;
  const list = (f.advice || []).filter(a => ADVICE[a.kind]).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  if (!list.length) return '';
  return `
  <section class="wx-section">
    <h3 class="wx-h">建議 <small>今天與這一週</small></h3>
    <div class="wx-advice">
      ${list
        .map(a => {
          const [icon, title] = ADVICE[a.kind];
          const todayText = a.kind === 'week' ? a.text.replace(/^本週/, '') : a.text.replace(/^[^：]+：/, '');
          const weekText = a.week?.text || '';
          // The advice's day: today, or tomorrow once today's outing is over.
          const first = a.week?.days?.[0]?.date;
          const tag = first && now != null ? dayLabel(first, now, tz) : '今天';
          return `<div class="q-card wx-tip wx-tip-${e(a.kind)} lv-${e(a.level)}">
            <div class="wx-tip-top"><span class="wx-tip-icon">${icon}</span><div><b>${title}</b><p>${a.kind === 'week' ? '' : `<span class="wx-tag">${e(tag)}</span>`}${e(todayText)}</p></div></div>
            ${a.week?.days?.length ? strip(a.week.days) : ''}
            ${weekText ? `<p class="wx-weekline"><span class="wx-tag">本週</span>${e(weekText)}</p>` : ''}
          </div>`;
        })
        .join('')}
    </div>
  </section>`;
}

// ---- The days ------------------------------------------------------------------------------

export function daysList(f, { now, key }) {
  const days = (f.days || []).filter(d => d.date >= dateOf(now, f.tz));
  if (!days.length) return '';
  const lo = Math.min(...days.map(d => d.lo ?? Infinity));
  const hi = Math.max(...days.map(d => d.hi ?? -Infinity));
  const span = Math.max(1, hi - lo);
  return `
  <section class="wx-section">
    <h3 class="wx-h">${days.length} 天預報 <small>點一天看當天的圖</small></h3>
    <div class="q-card wx-days">
      ${days
        .map(d => {
          const left = (((d.lo ?? lo) - lo) / span) * 100;
          const right = (((d.hi ?? hi) - lo) / span) * 100;
          const c = d.day?.condition || {};
          return `<button class="wx-day" type="button" data-day="${e(d.date)}" data-page="${e(key)}">
            <span class="wx-dname">${e(dayLabel(d.date, now, f.tz))}<small>${shortDate(d.date)}</small></span>
            <span class="wx-dicon">${conditionIcon(c.code, c.text, true)}<small>${d.pop >= 20 ? `${d.pop}%` : ''}</small></span>
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
  return `
    <div class="q-sheet-head"><h2>${e(dayLabel(date, now, f.tz))} ${shortDate(date)} ${weekday(date)}</h2><button class="q-close" type="button" data-act="close" aria-label="關閉">×</button></div>
    ${
      hours.length >= 4
        ? `<div class="wx-dayg">
      <div class="wx-legend"><span class="l-temp">溫度</span><span class="l-feels">體感</span><span class="l-uv">紫外線</span><span class="l-rain">降雨機率</span>${aqi.length ? '<span class="l-air">空氣</span>' : ''}</div>
      ${dayGraph(hours, { tz: f.tz, aqi })}
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
