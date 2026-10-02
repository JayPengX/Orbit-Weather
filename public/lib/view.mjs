// The screen, top to bottom (plan E2), as HTML strings from the forecast.
// One truth: one value for each thing; no sources named.

import { clock, dateOf, dayLabel, shortDate, deg, pct, uvLevel, uvColor, aqiColor, windDir, beaufort, conditionIcon, moonPhase, escapeHtml as e, ago } from './format.mjs';
import { curveSvg } from './chart.mjs';
import { sunTimes, goldenHours, sunProgress } from './sun.mjs';

const HOUR = 3_600_000;

// Sunrise and sunset for a date: the forecast's, else worked out here.
export function sunFor(forecast, date, lat, lon) {
  const d = forecast.days?.find(x => x.date === date);
  if (d?.sunrise && d?.sunset) return { sunrise: d.sunrise, sunset: d.sunset };
  return lat != null && lon != null ? sunTimes(date, lat, lon) : null;
}

// Night for an hour: the forecast's flag, else from the sun.
export function nightTest(forecast, lat, lon) {
  const tz = forecast.tz;
  return h => {
    if (typeof h.day === 'boolean') return !h.day;
    const s = sunFor(forecast, dateOf(h.t + HOUR / 2, tz), lat, lon);
    const mid = h.t + HOUR / 2;
    return s ? mid < s.sunrise || mid > s.sunset : false;
  };
}

const ADVICE_ICON = { umbrella: '☂️', sun: '🧴', wear: '👕', mask: '😷', heat: '🥵', week: '📅' };

export function todayCard(f, { place, now, note }) {
  const n = f.now || {};
  const day = n.day ?? true;
  const d0 = f.days?.find(x => x.date === dateOf(now, f.tz)) || f.days?.[0];
  const chips = (f.advice || []).filter(a => a.kind !== 'week');
  const alerts = (f.alerts || []).map(a => `<div class="alert">⚠️ ${e(a.title)}${a.to ? `<span>至 ${e(clock(a.to, f.tz))}</span>` : ''}</div>`).join('');
  return `
  <section class="card today">
    <div class="top">
      <button class="place" data-act="pick" aria-label="選擇地區">
        <span class="pin">📍</span><span>${e(place)}</span><span class="chev">⌄</span>
      </button>
      <button class="gear" data-act="settings" aria-label="通知設定">🔔</button>
    </div>
    ${note ? `<div class="note">${note}</div>` : ''}
    <div class="now">
      <div class="big">${deg(n.temp)}</div>
      <div class="cond">
        <div class="icon">${conditionIcon(n.condition?.code, n.condition?.text, day)}</div>
        <div>${e(n.condition?.text || '')}</div>
        <div class="dim">體感 ${deg(n.feels)}</div>
      </div>
    </div>
    <div class="range">${d0 ? `最高 ${deg(d0.hi)} · 最低 ${deg(d0.lo)}` : ''}${n.uv != null ? ` · UV ${Math.round(n.uv)}` : ''}${n.rain1h ? ` · 過去 1 小時 ${n.rain1h} mm` : ''}</div>
    ${f.headline ? `<div class="headline">${e(f.headline)}</div>` : ''}
    ${alerts}
    <div class="chips">${chips.map(a => `<div class="chip ${e(a.kind)} lv-${e(a.level)}"><span>${ADVICE_ICON[a.kind] || '•'}</span>${e(a.text.replace(/^[^：]+：/, ''))}</div>`).join('')}</div>
    <div class="age">${f.partial ? '部分資料稍舊 · ' : ''}更新於 ${e(ago(f.at, now))}</div>
  </section>`;
}

export function curveCard(f, { now, lat, lon, selected = -1 }) {
  const hours = (f.hours || []).filter(h => h.t + HOUR > now).slice(0, 48);
  const { svg } = curveSvg(hours, { now, tz: f.tz, isNight: nightTest(f, lat, lon), selected });
  const h = hours[selected] || hours[0];
  return `
  <section class="card curve-card">
    <h2>逐時預報 <span class="dim">· 左右滑動看 48 小時</span></h2>
    <div class="legend"><span class="l-temp">溫度</span><span class="l-feels">體感</span><span class="l-uv">紫外線</span><span class="l-rain">降雨機率</span></div>
    <div class="scroller" data-scroll="curve">${svg}</div>
    ${h ? hourDetail(h, f) : ''}
  </section>`;
}

export function hourDetail(h, f) {
  const w = h.wind || {};
  const rows = [
    ['時間', `${dayLabel(dateOf(h.t, f.tz), Date.now(), f.tz)} ${clock(h.t, f.tz)}`],
    ['天氣', `${conditionIcon(h.condition?.code, h.condition?.text, h.day !== false)} ${h.condition?.text || ''}`],
    ['溫度', `${deg(h.temp)}（體感 ${deg(h.feels)}）`],
    ['降雨', `${pct(h.pop)}${h.mm ? ` · ${h.mm} mm` : ''}${h.thunder >= 20 ? ` · 雷 ${h.thunder}%` : ''}`],
    ['紫外線', h.uv != null ? `${h.uv}（${uvLevel(h.uv)}）` : '–'],
    ['風', w.speed != null ? `${windDir(w.dir)} ${beaufort(w.speed)} 級${w.gust ? `，陣風 ${beaufort(w.gust)} 級` : ''}` : '–'],
    ['濕度', pct(h.humidity)]
  ];
  return `<div class="hour-detail">${rows.map(([k, v]) => `<div><span>${k}</span><b>${e(v)}</b></div>`).join('')}</div>`;
}

export function airCard(f) {
  const a = f.air;
  if (!a) return '';
  const ring = Math.min(1, (a.aqi ?? 0) / 200);
  const C = 2 * Math.PI * 34;
  const tomorrow = a.forecast?.tomorrow;
  return `
  <section class="card air">
    <h2>空氣品質</h2>
    <div class="air-row">
      <svg class="ring" viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
        <circle cx="40" cy="40" r="34" class="ring-bg"/>
        <circle cx="40" cy="40" r="34" class="ring-fg" stroke="${aqiColor(a.aqi)}" stroke-dasharray="${(C * ring).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 40 40)"/>
        <text x="40" y="46" class="ring-num">${a.aqi ?? '–'}</text>
      </svg>
      <div>
        <div class="air-level" style="color:${aqiColor(a.aqi)}">${e(a.level || '')}</div>
        <div>PM2.5 ${a.pm25 ?? '–'} μg/m³ · PM10 ${a.pm10 ?? '–'}</div>
        <div class="dim">${e(a.station?.name || '')}測站 · ${a.station?.km ?? '–'} 公里${a.main ? ` · 主要：${e(a.main)}` : ''}</div>
        ${tomorrow ? `<div class="dim">明天預測：<span style="color:${aqiColor(tomorrow.aqi)}">${e(tomorrow.level || '')}</span></div>` : ''}
      </div>
    </div>
  </section>`;
}

export function daysCard(f, { now, open = null }) {
  const days = f.days || [];
  if (!days.length) return '';
  const lo = Math.min(...days.map(d => d.lo ?? Infinity));
  const hi = Math.max(...days.map(d => d.hi ?? -Infinity));
  const span = Math.max(1, hi - lo);
  const week = (f.advice || []).find(a => a.kind === 'week');
  const rows = days.map(d => {
    const left = (((d.lo ?? lo) - lo) / span) * 100;
    const right = (((d.hi ?? hi) - lo) / span) * 100;
    const cond = d.day?.condition || {};
    const isOpen = open === d.date;
    return `
      <button class="day${isOpen ? ' open' : ''}" data-act="day" data-date="${e(d.date)}">
        <span class="dname">${e(dayLabel(d.date, now, f.tz))}<small>${shortDate(d.date)}</small></span>
        <span class="dicon">${conditionIcon(cond.code, cond.text, true)}</span>
        <span class="dpop">${d.pop >= 10 ? `💧${d.pop}%` : ''}</span>
        <span class="dlo">${deg(d.lo)}</span>
        <span class="bar"><i style="left:${left.toFixed(1)}%;width:${Math.max(4, right - left).toFixed(1)}%"></i></span>
        <span class="dhi">${deg(d.hi)}</span>
        <span class="duv" style="background:${uvColor(d.uvMax)}" title="UV">${d.uvMax ?? ''}</span>
      </button>
      ${isOpen ? dayDetail(d, f) : ''}`;
  });
  return `
  <section class="card days">
    <h2>10 天預報</h2>
    ${rows.join('')}
    ${week ? `<div class="week dim">📅 ${e(week.text)}</div>` : ''}
  </section>`;
}

export function dayDetail(d, f) {
  const half = (name, h) => (h ? `<div><span>${name}</span><b>${conditionIcon(h.condition?.code, h.condition?.text, name === '白天')} ${e(h.condition?.text || '')} · 降雨 ${pct(h.pop)}</b></div>` : '');
  const hours = (f.hours || []).filter(h => dateOf(h.t, f.tz) === d.date);
  return `<div class="day-detail">
    ${half('白天', d.day)}${half('晚上', d.night)}
    <div><span>體感</span><b>${deg(d.feelsLo)} – ${deg(d.feelsHi)}</b></div>
    <div><span>紫外線</span><b>${d.uvMax ?? '–'}${d.uvMax != null ? `（${uvLevel(d.uvMax)}）` : ''}</b></div>
    ${d.mm ? `<div><span>雨量</span><b>${d.mm} mm</b></div>` : ''}
    ${hours.length >= 6 ? `<div class="scroller">${curveSvg(hours, { tz: f.tz, isNight: h => h.day === false }).svg}</div>` : ''}
  </div>`;
}

export function sunCard(f, { now, lat, lon }) {
  const date = dateOf(now, f.tz);
  const s = sunFor(f, date, lat, lon);
  if (!s) return '';
  const g = goldenHours(s);
  const p = sunProgress(s, now);
  const len = s.sunset - s.sunrise;
  const d0 = f.days?.find(x => x.date === date);
  const moon = moonPhase(d0?.moon?.phase);
  // The arc: a half ellipse, the sun on it by the day's progress.
  const ang = Math.PI * (1 - (p ?? 0));
  const sx = 100 + 84 * Math.cos(ang);
  const sy = 92 - 70 * Math.sin(ang);
  return `
  <section class="card sun">
    <h2>日出日落</h2>
    <svg viewBox="0 0 200 104" class="arc" aria-hidden="true">
      <path d="M16,92 A84,70 0 0 1 184,92" class="arc-path"/>
      <line x1="6" x2="194" y1="92" y2="92" class="horizon"/>
      ${p != null ? `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="8" class="sun-dot"/>` : ''}
    </svg>
    <div class="sun-row">
      <div><span>🌅 日出</span><b>${clock(s.sunrise, f.tz)}</b></div>
      <div><span>日照</span><b>${Math.floor(len / HOUR)} 小時 ${Math.round((len % HOUR) / 60_000)} 分</b></div>
      <div><span>🌇 日落</span><b>${clock(s.sunset, f.tz)}</b></div>
    </div>
    <div class="dim">黃金時刻 ${clock(g.morning[0], f.tz)}–${clock(g.morning[1], f.tz)}、${clock(g.evening[0], f.tz)}–${clock(g.evening[1], f.tz)}${moon ? ` · ${moon[1]} ${moon[0]}` : ''}</div>
  </section>`;
}

export function extrasCard(f) {
  const n = f.now || {};
  const w = n.wind || {};
  const h0 = f.hours?.[0];
  const h3 = f.hours?.[3];
  const trend = n.pressure != null && h3?.pressure != null ? (h3.pressure - n.pressure > 0.5 ? '↑' : h3.pressure - n.pressure < -0.5 ? '↓' : '→') : '';
  const items = [
    ['今日雨量', n.rainToday != null ? `${n.rainToday} mm` : '–'],
    ['氣壓', n.pressure != null ? `${Math.round(n.pressure)} hPa ${trend}` : '–'],
    ['風', w.speed != null ? `<span class="compass" style="--d:${w.dir ?? 0}deg">➤</span> ${e(windDir(w.dir))} ${beaufort(w.speed)} 級${w.gust ? ` · 陣風 ${beaufort(w.gust)} 級` : ''}` : '–'],
    ['濕度', pct(n.humidity ?? h0?.humidity)],
    ['露點', deg(n.dew ?? h0?.dew)],
    ['能見度', n.vis != null ? `${n.vis} 公里` : '–'],
    ['雲量', pct(n.cloud ?? h0?.cloud)]
  ];
  return `
  <section class="card extras">
    <details>
      <summary><h2>更多數據</h2></summary>
      <div class="grid">${items.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    </details>
  </section>`;
}

// The radar (Taiwan only): CWA's composite, loaded only when opened.
export const RADAR_URL = 'https://www.cwa.gov.tw/Data/radar/CV1_TW_1000.png';
export function radarCard(f, { now, open = false }) {
  if (!f.place) return '';
  const src = `${RADAR_URL}?t=${Math.floor(now / 600_000)}`;
  return `
  <section class="card radar">
    <details data-act="radar"${open ? ' open' : ''}>
      <summary><h2>雷達回波</h2></summary>
      ${open ? `<img src="${src}" alt="臺灣雷達回波圖" loading="lazy">` : ''}
      <div class="dim">每 10 分鐘更新，顏色越暖雨越大。</div>
    </details>
  </section>`;
}

// The notices' settings sheet.
export function settingsSheet(state, { supported, homeScreen, error = '' }) {
  const p = state.notify || {};
  const on = !!(p.brief || p.rain);
  return `<div class="sheet-body card">
    <div class="sheet-head"><h2>通知</h2><button class="link" data-act="close">完成</button></div>
    ${!supported ? '<p class="hint">這個瀏覽器不支援通知。</p>' : homeScreen ? '<p class="hint">iPhone 需要先從 Safari 的「分享 → 加入主畫面」安裝，再從主畫面打開本 App，才能開啟通知。</p>' : ''}
    <label class="setting"><span>每日早報<small>每天早上一句話：降雨、溫度、紫外線、空氣</small></span>
      <span class="switch"><input type="checkbox" data-set="brief"${p.brief ? ' checked' : ''}${supported && !homeScreen ? '' : ' disabled'}><span></span></span></label>
    <label class="setting"><span>早報時間</span><input type="time" data-set="time" value="${e(p.brief || state.briefTime || '06:30')}"></label>
    <label class="setting"><span>降雨提醒<small>白天 2 小時內可能下雨時提醒一次</small></span>
      <span class="switch"><input type="checkbox" data-set="rain"${p.rain ? ' checked' : ''}${supported && !homeScreen ? '' : ' disabled'}><span></span></span></label>
    <p class="hint">${on ? '以最後打開本 App 的位置為準。' : '通知以最後打開本 App 的位置為準。'}${error ? `<br>${e(error)}` : ''}</p>
  </div>`;
}
