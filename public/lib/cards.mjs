// One place's page, top to bottom: where and now; UV, rain and air, each a
// card with its graph; what to do about it; the days; everything else.
// One truth: one value for each thing, no sources named.

import { clock, dateOf, dayLabel, shortDate, weekday, deg, pct, uvLevel, uvColor, aqiColor, windDir, beaufort, conditionIcon, moonPhase, escapeHtml as e, ago } from './format.mjs';
import { uvGraph, rainGraph, airGraph, dayGraph } from './graph.mjs';
import { sunTimes, goldenHours } from './sun.mjs';
import { placeLines } from './api.mjs';
import { scheduleText } from './pins.mjs';

const HOUR = 3_600_000;

// The hours from this one on (the graphs start now).
export const hoursFrom = (f, now) => (f?.hours || []).filter(h => h.t + HOUR > now);
const today = (f, now) => f.days?.find(d => d.date === dateOf(now, f.tz)) || f.days?.[0] || null;

// ---- Top: where, and now -----------------------------------------------------------

export function topArea(f, { page, now }) {
  const n = f?.now || {};
  const d = f ? today(f, now) : null;
  const place = placeLines(page.place);
  const title = page.pin ? page.pin.name : place.main || '目前位置';
  const sub = page.pin ? [place.main, place.sub].filter(Boolean).join(' · ') : [place.sub, page.note || '目前位置'].filter(Boolean).join(' · ');
  const alerts = (f?.alerts || []).map(a => `<div class="wx-alert">⚠️ ${e(a.title)}${a.to ? `<span>至 ${e(clock(a.to, f.tz))}</span>` : ''}</div>`).join('');
  return `
  <section class="wx-top">
    <div class="wx-where">
      <h2 class="wx-place">${page.pin ? '📌' : '📍'} ${e(title)}</h2>
      <p class="wx-sub">${e(sub)}${page.pin ? `<span class="wx-sched">${e(scheduleText(page.pin))}</span>` : ''}</p>
    </div>
    ${
      f
        ? `<div class="wx-now">
      <div class="wx-temp">${deg(n.temp)}</div>
      <div class="wx-cond"><span class="wx-icon">${conditionIcon(n.condition?.code, n.condition?.text, n.day ?? true)}</span>${e(n.condition?.text || '')}</div>
    </div>
    <div class="wx-hilo">
      <div><span>最高</span><b>${deg(d?.hi)}</b><small>體感 ${deg(d?.feelsHi)}</small></div>
      <div><span>最低</span><b>${deg(d?.lo)}</b><small>體感 ${deg(d?.feelsLo)}</small></div>
      <div><span>現在體感</span><b>${deg(n.feels)}</b><small>濕度 ${pct(n.humidity)}</small></div>
    </div>
    ${f.headline ? `<p class="wx-headline">${e(f.headline)}</p>` : ''}
    ${alerts}`
        : ''
    }
  </section>`;
}

// ---- The cards with graphs --------------------------------------------------------------

const card = (cls, title, summary, readId, graph, foot = '') => `
  <section class="q-card wx-card ${cls}">
    <div class="wx-card-head"><h3>${title}</h3>${summary}</div>
    <p class="wx-readout" id="${readId}" aria-live="polite">左右滑動看更多，點一下看數字</p>
    <div class="wx-scroll" data-scroll="${cls}">${graph}</div>
    ${foot}
  </section>`;

export function uvCard(f, { now, key }) {
  const hours = hoursFrom(f, now);
  if (!hours.some(h => h.uv != null)) return '';
  const date = dateOf(now, f.tz);
  const todays = hours.filter(h => dateOf(h.t, f.tz) === date && h.uv != null);
  const peak = todays.length ? todays.reduce((a, h) => (h.uv > a.uv ? h : a), todays[0]) : null;
  const nowUv = f.now?.uv ?? hours[0]?.uv;
  const summary = `<div class="wx-big" style="--c:${uvColor(nowUv)}">${nowUv ?? '–'}<small>${uvLevel(nowUv) || ''}</small></div>`;
  // Today's peak while there's one ahead; else tomorrow's.
  const dayPeak = d => {
    const list = hours.filter(h => dateOf(h.t, f.tz) === d && h.uv != null);
    if (!list.length) return null;
    const p = list.reduce((a, h) => (h.uv > a.uv ? h : a), list[0]);
    const s = list.filter(h => h.uv >= 3);
    return p.uv >= 1 ? `最高 UV ${p.uv}（${uvLevel(p.uv)}）於 ${clock(p.t, f.tz)}${s.length ? `；${clock(s[0].t, f.tz)}–${clock(s[s.length - 1].t + HOUR, f.tz)} 需要防曬` : ''}` : null;
  };
  const todayText = peak && peak.uv >= 1 ? dayPeak(date) : null;
  const tomorrowText = dayPeak(dateOf(now + 86_400_000, f.tz));
  const foot = `<p class="wx-foot">${todayText ? `今天${todayText}` : `今天剩下的時間紫外線很弱${tomorrowText ? `。明天${tomorrowText}` : ''}`}</p>`;
  return card('uv', '紫外線', summary, `read-uv-${key}`, uvGraph(hours, { tz: f.tz, now }), foot);
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

export function rainCard(f, { now, key }) {
  const hours = hoursFrom(f, now);
  if (!hours.length) return '';
  const pop = hours[0]?.pop;
  const summary = `<div class="wx-big wx-rain-big">${pop ?? '–'}<small>%</small></div>`;
  const today = f.now?.rainToday;
  const foot = `<p class="wx-foot">${e(rainSummary(hours, f.tz, now))}${today != null ? ` · 今日雨量 ${today} mm` : ''}${f.now?.rain1h ? ` · 過去 1 小時 ${f.now.rain1h} mm` : ''}</p>`;
  return card('rain', '降雨機率', summary, `read-rain-${key}`, rainGraph(hours, { tz: f.tz, now }), foot);
}

// The air graph's columns: measured hours, then the forecast days.
export function airCols(f, now) {
  const a = f.air;
  if (!a) return [];
  const hist = (a.history || []).filter(x => now - x.t < 48 * HOUR).map(x => ({ t: x.t, aqi: x.aqi, pm25: x.pm25 }));
  if (!hist.length && a.aqi != null) hist.push({ t: a.at || now, aqi: a.aqi, pm25: a.pm25 });
  const days = (a.forecast?.days || [a.forecast?.today && { date: dateOf(now, f.tz), ...a.forecast.today }, a.forecast?.tomorrow && { date: dateOf(now + 86_400_000, f.tz), ...a.forecast.tomorrow }].filter(Boolean)).filter(d => d.date >= dateOf(now, f.tz));
  return [...hist, ...days.map(d => ({ date: d.date, label: dayLabel(d.date, now, f.tz), aqi: d.aqi, forecast: true }))];
}

export function airCard(f, { now, key }) {
  const a = f.air;
  if (!a) return '';
  const cols = airCols(f, now);
  const summary = `<div class="wx-big" style="--c:${aqiColor(a.aqi)}">${a.aqi ?? '–'}<small>${e(a.level || '')}</small></div>`;
  const foot = `<p class="wx-foot">PM2.5 ${a.pm25 ?? '–'} μg/m³ · ${e(a.station?.name || '')}測站 ${a.station?.km ?? '–'} 公里${a.main ? ` · 主要 ${e(a.main)}` : ''}</p>`;
  return card('air', '空氣品質', summary, `read-air-${key}`, airGraph(cols, { tz: f.tz, now }), foot);
}

// ---- What to do ------------------------------------------------------------------------

const ADVICE = { umbrella: ['☂️', '帶傘'], sun: ['🧴', '防曬'], wear: ['👕', '穿著'], mask: ['😷', '口罩'], heat: ['🥵', '炎熱'], week: ['📅', '這一週'] };
export function adviceCards(f) {
  const list = (f.advice || []).filter(a => ADVICE[a.kind]);
  if (!list.length) return '';
  return `
  <section class="wx-section">
    <h3 class="wx-h">建議</h3>
    <div class="wx-advice">
      ${list
        .map(a => {
          const [icon, title] = ADVICE[a.kind];
          const text = a.text.replace(/^[^：]+：/, '');
          return `<div class="q-card wx-tip wx-tip-${e(a.kind)} lv-${e(a.level)}"><span class="wx-tip-icon">${icon}</span><b>${title}</b><p>${e(text)}</p></div>`;
        })
        .join('')}
    </div>
  </section>`;
}

// ---- The days ------------------------------------------------------------------------------

export function daysList(f, { now, key }) {
  const days = f.days || [];
  if (!days.length) return '';
  const lo = Math.min(...days.map(d => d.lo ?? Infinity));
  const hi = Math.max(...days.map(d => d.hi ?? -Infinity));
  const span = Math.max(1, hi - lo);
  return `
  <section class="wx-section">
    <h3 class="wx-h">${days.length} 天預報 <small>點一天看當天的圖</small></h3>
    <div class="q-rows wx-days">
      ${days
        .map(d => {
          const left = (((d.lo ?? lo) - lo) / span) * 100;
          const right = (((d.hi ?? hi) - lo) / span) * 100;
          const c = d.day?.condition || {};
          return `<button class="q-row-btn wx-day" type="button" data-day="${e(d.date)}" data-page="${e(key)}">
            <span class="wx-dname">${e(dayLabel(d.date, now, f.tz))}<small>${shortDate(d.date)}</small></span>
            <span class="wx-dicon">${conditionIcon(c.code, c.text, true)}</span>
            <span class="wx-dpop">${d.pop >= 10 ? `💧${d.pop}%` : ''}</span>
            <span class="wx-dlo">${deg(d.lo)}</span>
            <span class="wx-bar"><i style="left:${left.toFixed(1)}%;width:${Math.max(4, right - left).toFixed(1)}%"></i></span>
            <span class="wx-dhi">${deg(d.hi)}</span>
            <span class="wx-duv" style="background:${uvColor(d.uvMax)}">${d.uvMax ?? ''}</span>
          </button>`;
        })
        .join('')}
    </div>
  </section>`;
}

// The sheet for one day: its numbers, and its graph with everything on it.
export function daySheet(f, date, { now, lat, lon }) {
  const d = f.days?.find(x => x.date === date);
  const hours = (f.hours || []).filter(h => dateOf(h.t, f.tz) === date);
  const aqi = (f.air?.history || []).filter(a => dateOf(a.t, f.tz) === date);
  const s = d?.sunrise ? { sunrise: d.sunrise, sunset: d.sunset } : lat != null ? sunTimes(date, lat, lon) : null;
  const half = (name, h) => (h ? `<div><span>${name}</span><b>${conditionIcon(h.condition?.code, h.condition?.text, name === '白天')} ${e(h.condition?.text || '')}</b><small>降雨 ${pct(h.pop)}</small></div>` : '');
  const fc = f.air?.forecast?.days?.find(x => x.date === date);
  return `
    <div class="q-sheet-head"><h2>${e(dayLabel(date, now, f.tz))} ${shortDate(date)} ${weekday(date)}</h2><button class="q-close" type="button" data-act="close" aria-label="關閉">×</button></div>
    <div class="wx-grid">
      <div><span>最高 / 最低</span><b>${deg(d?.hi)} / ${deg(d?.lo)}</b><small>體感 ${deg(d?.feelsHi)} / ${deg(d?.feelsLo)}</small></div>
      <div><span>降雨機率</span><b>${pct(d?.pop)}</b><small>${d?.mm ? `約 ${d.mm} mm` : ''}</small></div>
      <div><span>紫外線最高</span><b>${d?.uvMax ?? '–'}</b><small>${uvLevel(d?.uvMax) || ''}</small></div>
      ${fc ? `<div><span>空氣（預測）</span><b style="color:${aqiColor(fc.aqi)}">${e(fc.level || '')}</b><small>AQI ${fc.aqi ?? '–'}</small></div>` : ''}
      ${half('白天', d?.day)}${half('晚上', d?.night)}
      ${s ? `<div><span>日出 / 日落</span><b>${clock(s.sunrise, f.tz)} / ${clock(s.sunset, f.tz)}</b></div>` : ''}
    </div>
    ${
      hours.length >= 4
        ? `<div class="wx-legend"><span class="l-temp">溫度</span><span class="l-feels">體感</span><span class="l-uv">紫外線</span><span class="l-rain">降雨機率</span>${aqi.length ? '<span class="l-air">空氣</span>' : ''}</div>
    <div class="wx-dayg">${dayGraph(hours, { tz: f.tz, aqi })}</div>`
        : '<p class="wx-foot">這一天沒有逐時資料。</p>'
    }`;
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
    ['濕度', pct(n.humidity ?? h0?.humidity)],
    ['露點', deg(n.dew ?? h0?.dew)],
    ['風', w.speed != null ? `<span class="wx-compass" style="--d:${w.dir ?? 0}deg">➤</span> ${e(windDir(w.dir))} ${beaufort(w.speed)} 級` : '–', w.gust ? `陣風 ${beaufort(w.gust)} 級（${Math.round(w.gust)} km/h）` : ''],
    ['氣壓', n.pressure != null ? `${Math.round(n.pressure)} hPa${trend}` : '–', trend ? '未來 3 小時' : ''],
    ['能見度', n.vis != null ? `${n.vis} 公里` : '–'],
    ['雲量', pct(n.cloud ?? h0?.cloud)],
    ['今日雨量', n.rainToday != null ? `${n.rainToday} mm` : '–', n.rain1h != null ? `過去 1 小時 ${n.rain1h} mm` : ''],
    ['雷雨機率', pct(h0?.thunder)],
    ['日出', s ? clock(s.sunrise, f.tz) : '–', g ? `黃金時刻 ${clock(g.morning[0], f.tz)}–${clock(g.morning[1], f.tz)}` : ''],
    ['日落', s ? clock(s.sunset, f.tz) : '–', g ? `黃金時刻 ${clock(g.evening[0], f.tz)}–${clock(g.evening[1], f.tz)}` : ''],
    ['日照長度', s ? `${Math.floor(len / HOUR)} 小時 ${Math.round((len % HOUR) / 60_000)} 分` : '–'],
    ['月相', moon ? `${moon[1]} ${moon[0]}` : '–', d?.moon?.rise ? `月出 ${clock(d.moon.rise, f.tz)}${d.moon.set ? ` · 月落 ${clock(d.moon.set, f.tz)}` : ''}` : ''],
    ['PM10', f.air?.pm10 != null ? `${f.air.pm10} μg/m³` : '–'],
    ['臭氧', f.air?.o3 != null ? `${f.air.o3} ppb` : '–'],
    ['附近測站', n.station ? `${e(n.station.name)} ${n.station.temp != null ? deg(n.station.temp) : ''}` : '–', n.station ? `${n.station.km} 公里 · ${clock(n.station.at, f.tz)} 實測` : ''],
    ['位置', page.place?.village ? e(page.place.village) : '–', page.place ? e([page.place.county, page.place.town].filter(Boolean).join(' ')) : '']
  ];
  return `
  <section class="q-card wx-info">
    <h3 class="wx-h">更多資訊</h3>
    <div class="wx-grid">${items.map(([k, v, sub]) => `<div><span>${k}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`).join('')}</div>
    <p class="wx-foot">${f.partial ? '部分資料稍舊 · ' : ''}更新於 ${e(ago(f.at, now))}</p>
  </section>`;
}

// A whole page.
export function pageHtml(f, page, { now }) {
  const top = topArea(f, { page, now });
  if (!f) return `${top}<section class="q-card wx-empty">${page.error ? `<p>${e(page.error)}</p><button class="q-btn" type="button" data-act="retry" data-page="${e(page.key)}">再試一次</button>` : '<div class="wx-spin"></div><p>正在取得天氣…</p>'}</section>`;
  const opts = { now, key: page.key, lat: page.lat, lon: page.lon, page };
  return [top, uvCard(f, opts), rainCard(f, opts), airCard(f, opts), adviceCards(f), daysList(f, opts), infoCard(f, opts)].join('');
}
