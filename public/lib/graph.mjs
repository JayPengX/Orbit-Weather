// The graphs: smooth area charts (or bars for days), each fitted to the
// card's width — no sideways scrolling inside a page that already swipes
// sideways; the card's tabs pick the range (24 hours, 48, 10 days…). The
// fill and line take the level's colour (UV green → violet, AQI green →
// red, rain light → deep blue); each day's peak is labelled; the hours
// under, the dates at day changes, a place's name where the route changes
// city (我的行程).
//
// The app moves a crosshair and dot (`.ch-x`, `.ch-d`) to the column under
// a finger or the mouse (`colAt`), dragging on the graph (it only pans up
// and down) — and shows the column's numbers above.

import { clock, hourOf, dateOf, shortDate, weekday, uvColor, aqiColor, rainColor, escapeHtml as e } from './format.mjs';

export const CHART_W = 340;
const HOUR = 3_600_000;
const TOP = 26;
const PH = 150;
const BASE = TOP + PH;
export const CHART_H = BASE + 42;
const r1 = v => Math.round(v * 10) / 10;
const yOf = (v, max) => r1(BASE - Math.max(0, Math.min(1, v / max)) * PH);

export const UV_STOPS = [[0, '#4caf50'], [3, '#f5c518'], [6, '#ff8c1a'], [8, '#e53935'], [11, '#8e24aa']];
export const AQI_STOPS = [[0, '#4caf50'], [51, '#f5c518'], [101, '#ff8c1a'], [151, '#e53935'], [201, '#8e24aa']];
export const RAIN_STOPS = [[0, '#a5d4ff'], [40, '#5aa9f5'], [70, '#2f7de1']];

// A vertical gradient in the plot's units: a height gets its level's colour.
function gradient(id, stops, max) {
  const out = [];
  stops.forEach(([v, c], i) => {
    const from = Math.min(1, v / max);
    const next = stops[i + 1] ? Math.min(1, stops[i + 1][0] / max) : 1;
    if (from < 1) out.push(`<stop offset="${r1(from * 100)}%" stop-color="${c}"/><stop offset="${r1(next * 100)}%" stop-color="${c}"/>`);
  });
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${BASE}" y2="${TOP}">${out.join('')}</linearGradient>`;
}

// Points → a smooth path (Catmull-Rom as Béziers, kept inside the plot).
export function smooth(pts, top = TOP, base = BASE) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0] - 4},${pts[0][1]}L${pts[0][0] + 4},${pts[0][1]}`;
  const cl = y => r1(Math.max(top, Math.min(base, y)));
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)},${cl(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)},${cl(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

let made = 0;
// cols: [{ t | date, v, under (the axis text), strong, inner (0–1: rain's
// amount, a dark bar), place, daily, label }]. `bars`: a bar a column (days).
export function chart(id, cols, { max, stops, tz, label, nowIndex = -1, grid = [], fmt = v => String(Math.round(v)), minLabel = 0, bars = false }) {
  const n = Math.max(1, cols.length);
  const w = CHART_W / n;
  const gid = `g${++made}-${id}`;
  const xOf = i => r1((i + 0.5) * w);
  const out = [`<defs>${gradient(gid, stops, max)}</defs>`];
  for (const g of grid) if (g < max) out.push(`<line class="ch-grid" x1="0" x2="${CHART_W}" y1="${yOf(g, max)}" y2="${yOf(g, max)}"/>`);
  out.push(`<line class="ch-base" x1="0" x2="${CHART_W}" y1="${BASE}" y2="${BASE}"/>`);
  const dateOfCol = c => c.date || dateOf(c.t, tz);
  if (bars) {
    cols.forEach((c, i) => {
      if (c.v == null) return;
      const y = yOf(c.v, max);
      const bw = Math.min(34, w * 0.62);
      // A bar is one colour: its value's level.
      const fill = [...stops].reverse().find(([v]) => c.v >= v)?.[1] || stops[0][1];
      out.push(`<rect class="ch-bar" x="${r1(xOf(i) - bw / 2)}" y="${y}" width="${r1(bw)}" height="${r1(Math.max(2, BASE - y))}" rx="${r1(Math.min(8, bw / 3))}" fill="${fill}"/>`);
      out.push(`<text class="ch-val" x="${xOf(i)}" y="${r1(y - 7)}">${e(fmt(c.v))}</text>`);
      if (c.inner > 0) out.push(`<rect class="ch-inner" x="${r1(xOf(i) - bw / 2)}" y="${r1(BASE - c.inner * PH * 0.4)}" width="${r1(bw)}" height="${r1(c.inner * PH * 0.4)}" rx="3"/>`);
    });
  } else {
    // Runs of known values; measured and forecast apart (both keep the joint).
    const runs = [];
    let run = null;
    cols.forEach((c, i) => {
      if (c.v == null) return void (run = null);
      if (run && run.fc !== Boolean(c.fc)) {
        run = { fc: Boolean(c.fc), pts: [run.pts[run.pts.length - 1]] };
        runs.push(run);
      } else if (!run) runs.push((run = { fc: Boolean(c.fc), pts: [] }));
      run.pts.push([xOf(i), yOf(c.v, max)]);
    });
    for (const r of runs) {
      const line = smooth(r.pts);
      const a = r.pts[0];
      const z = r.pts[r.pts.length - 1];
      out.push(`<path class="ch-area${r.fc ? ' ch-fc' : ''}" d="${line}L${z[0]},${BASE}L${a[0]},${BASE}Z" fill="url(#${gid})"/><path class="ch-line${r.fc ? ' ch-fc' : ''}" d="${line}" stroke="url(#${gid})"/>`);
    }
    cols.forEach((c, i) => {
      if (c.inner > 0) out.push(`<rect class="ch-inner" x="${r1(i * w + w * 0.18)}" y="${r1(BASE - c.inner * PH * 0.4)}" width="${r1(w * 0.64)}" height="${r1(c.inner * PH * 0.4)}" rx="1.5"/>`);
    });
    // Each day's peak labelled, and now's value; never two close together.
    const peaks = {};
    cols.forEach((c, i) => {
      const d = dateOfCol(c);
      if (c.v != null && c.v >= minLabel && (peaks[d] == null || c.v > cols[peaks[d]].v)) peaks[d] = i;
    });
    const marks = [...(nowIndex >= 0 && cols[nowIndex]?.v != null ? [nowIndex] : []), ...Object.values(peaks)];
    const shown = [];
    for (const i of marks) {
      if (shown.some(j => Math.abs(xOf(j) - xOf(i)) < 30)) continue;
      shown.push(i);
      const y = yOf(cols[i].v, max);
      out.push(`<circle class="ch-pt" cx="${xOf(i)}" cy="${y}" r="3.5" fill="url(#${gid})"/><text class="ch-val" x="${Math.min(CHART_W - 14, Math.max(14, xOf(i)))}" y="${r1(Math.max(TOP - 8, y - 10))}">${e(fmt(cols[i].v))}</text>`);
    }
    if (nowIndex >= 0) out.push(`<line class="ch-now" x1="${xOf(nowIndex)}" x2="${xOf(nowIndex)}" y1="${TOP - 4}" y2="${BASE}"/>`);
  }
  // Day changes: a line and the date under; a place's name where it changes.
  // (Axis words that would touch the one before are left out.)
  let lastUnder = -99;
  const firstChange = bars ? -1 : cols.findIndex((c, i) => i && dateOfCol(cols[i - 1]) !== dateOfCol(c));
  cols.forEach((c, i) => {
    const prev = cols[i - 1];
    if (!bars && prev && dateOfCol(prev) !== dateOfCol(c)) out.push(`<line class="ch-day" x1="${r1(i * w)}" x2="${r1(i * w)}" y1="${TOP - 6}" y2="${BASE + 40}"/><text class="ch-date" x="${r1(Math.min(CHART_W - 60, i * w + 4))}" y="${BASE + 36}">${e(`${shortDate(dateOfCol(c))} ${weekday(dateOfCol(c))}`)}</text>`);
    if (c.place && prev && prev.place !== c.place) out.push(`<line class="ch-move" x1="${r1(i * w)}" x2="${r1(i * w)}" y1="4" y2="${BASE}"/><text class="ch-place" x="${r1(Math.min(CHART_W - 40, i * w + 3))}" y="14">${e(c.place)}</text>`);
    if (c.under && xOf(i) - lastUnder >= 30) {
      lastUnder = xOf(i);
      out.push(`<text class="ch-t${c.strong ? ' ch-strong' : ''}" x="${r1(Math.min(CHART_W - 12, Math.max(12, xOf(i))))}" y="${BASE + 17}">${e(c.under)}</text>`);
    }
    if (bars && c.date) out.push(`<text class="ch-t ch-sub" x="${xOf(i)}" y="${BASE + 34}">${e(shortDate(c.date))}</text>`);
  });
  if (!bars && cols[0] && (firstChange < 0 || firstChange * w > 78)) out.push(`<text class="ch-date" x="2" y="${BASE + 36}">${e(`${shortDate(dateOfCol(cols[0]))} ${weekday(dateOfCol(cols[0]))}`)}</text>`);
  // The crosshair, moved by the app.
  out.push(`<line class="ch-x" x1="-9" x2="-9" y1="${TOP - 6}" y2="${BASE}"/><circle class="ch-d" cx="-9" cy="-9" r="6"/>`);
  return `<svg class="ch" data-graph="${id}" data-n="${n}" data-ys="${cols.map(c => (c.v == null ? '' : yOf(c.v, max))).join(',')}" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${e(label)}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
}

// The column under clientX, and where its crosshair goes (SVG units).
export function colAt(svg, clientX) {
  const r = svg.getBoundingClientRect();
  const n = Number(svg.dataset.n);
  return Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n)));
}
export function colSpot(svg, i) {
  const n = Number(svg.dataset.n);
  const y = svg.dataset.ys.split(',')[i];
  return { x: r1((i + 0.5) * (CHART_W / n)), y: y === '' || y == null ? null : Number(y) };
}

const hourText = (t, tz, every) => {
  const h = hourOf(t, tz);
  return h % every === 0 ? `${h}時` : '';
};

// UV: one day's daylight (6–18時), or the 10 days' peaks.
export function uvGraph(cols, { tz, now = Date.now(), daily = false } = {}) {
  if (daily) return chart('uv', cols.map(d => ({ date: d.date, v: d.uvMax, under: d.label })), { max: 12, stops: UV_STOPS, tz, label: '每天的紫外線最高', bars: true });
  const nowIndex = cols.findIndex(h => h.t <= now && now < h.t + HOUR);
  return chart(
    'uv',
    cols.map((h, i) => ({ t: h.t, v: h.uv, place: h.place, under: i === nowIndex ? '現在' : hourText(h.t, tz, 3), strong: i === nowIndex })),
    { max: Math.max(11, ...cols.map(h => h.uv ?? 0)), stops: UV_STOPS, tz, label: '逐時紫外線（白天）', nowIndex, grid: [3, 6, 8], minLabel: 1 }
  );
}

// Rain: the chance as the area, the amount as dark bars (10 mm = 40% of
// the height); or the 10 days as bars.
export function rainGraph(cols, { tz, daily = false } = {}) {
  if (daily) return chart('rain', cols.map(d => ({ date: d.date, v: d.pop, under: d.label, inner: d.mm >= 0.5 ? Math.min(1, d.mm / 30) : 0 })), { max: 100, stops: RAIN_STOPS, tz, label: '每天的降雨機率', bars: true, fmt: v => `${Math.round(v)}%` });
  const every = cols.length > 30 ? 6 : 3;
  return chart(
    'rain',
    cols.map((h, i) => ({ t: h.t, v: h.pop, place: h.place, inner: h.mm >= 0.1 ? Math.min(1, h.mm / 10) : 0, under: i === 0 ? '現在' : hourText(h.t, tz, every), strong: i === 0 })),
    { max: 100, stops: RAIN_STOPS, tz, label: '逐時降雨機率', nowIndex: 0, grid: [25, 50, 75], minLabel: 10, fmt: v => `${Math.round(v)}%` }
  );
}

// Air: now, then the forecast days, a bar each.
export function airGraph(cols, { tz } = {}) {
  return chart('air', cols.map(c => ({ ...c, v: c.aqi, under: c.label })), { max: Math.max(150, ...cols.map(c => c.aqi ?? 0)), stops: AQI_STOPS, tz, label: '空氣品質：現在與預報', bars: true });
}

export { uvColor, aqiColor, rainColor };

// One day, everything over each other (the day list's sheet): temperature
// and feels-like as smooth lines over a soft area, UV as a coloured band,
// rain as bars, AQI dots where measured; fitted to the width. The app
// moves its crosshair (`.g-cross`, `.g-dot-*`).
export function dayGraph(hours, { tz, aqi = [], colW = 15 } = {}) {
  const n = hours.length;
  if (!n) return '';
  const width = n * colW;
  const tTop = 34;
  const tBottom = 176;
  const uvY = 190;
  const rTop = 210;
  const rBottom = 286;
  const height = rBottom + 24;
  const vals = hours.flatMap(h => [h.temp, h.feels]).filter(v => v != null);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 6) [lo, hi] = [(hi + lo) / 2 - 3, (hi + lo) / 2 + 3];
  const y = v => r1(tBottom - ((v - lo) / (hi - lo)) * (tBottom - tTop));
  const cx = i => r1(i * colW + colW / 2);
  const pts = key => hours.map((h, i) => (h[key] == null ? null : [cx(i), y(h[key])])).filter(Boolean);
  const out = [`<defs><linearGradient id="dg-t" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#fbbf24" stop-opacity=".35"/><stop offset="100%" stop-color="#fbbf24" stop-opacity="0"/></linearGradient></defs>`];
  const tp = pts('temp');
  const tl = smooth(tp, tTop - 10, tBottom + 10);
  if (tp.length > 1) out.push(`<path d="${tl}L${tp[tp.length - 1][0]},${tBottom}L${tp[0][0]},${tBottom}Z" fill="url(#dg-t)"/>`);
  out.push(`<path class="g-feels" d="${smooth(pts('feels'), tTop - 10, tBottom + 10)}"/><path class="g-temp" d="${tl}"/>`);
  // Each 3 hours' temperature; the day's high and low marked.
  const tHi = hours.reduce((a, h, i) => (h.temp != null && (a < 0 || h.temp > hours[a].temp) ? i : a), -1);
  const tLo = hours.reduce((a, h, i) => (h.temp != null && (a < 0 || h.temp < hours[a].temp) ? i : a), -1);
  hours.forEach((h, i) => {
    if (h.temp == null) return;
    if (i === tHi || i === tLo) out.push(`<circle class="g-hl" cx="${cx(i)}" cy="${y(h.temp)}" r="3.5"/><text class="g-val g-big" x="${cx(i)}" y="${r1(i === tHi ? y(h.temp) - 10 : y(h.temp) + 20)}">${Math.round(h.temp)}°</text>`);
    else if (i % 3 === 1 && Math.abs(i - tHi) > 1 && Math.abs(i - tLo) > 1) out.push(`<text class="g-val" x="${cx(i)}" y="${r1(y(h.temp) - 8)}">${Math.round(h.temp)}°</text>`);
  });
  hours.forEach((h, i) => {
    if (h.uv > 0) out.push(`<rect x="${i * colW + 0.5}" y="${uvY}" width="${colW - 1}" height="9" rx="2" fill="${uvColor(h.uv)}"/>`);
    const p = h.pop ?? 0;
    const bh = p > 0 ? Math.max(2, ((rBottom - rTop) * p) / 100) : 0;
    if (bh) out.push(`<rect x="${i * colW + 2}" y="${r1(rBottom - bh)}" width="${colW - 4}" height="${r1(bh)}" rx="2.5" fill="${rainColor(p)}"/>`);
  });
  const wet = hours.reduce((a, h, i) => ((h.pop ?? -1) > (hours[a]?.pop ?? -1) ? i : a), 0);
  if (hours[wet]?.pop >= 20) out.push(`<text class="g-val" x="${cx(wet)}" y="${r1(rBottom - ((rBottom - rTop) * hours[wet].pop) / 100 - 4)}">${hours[wet].pop}%</text>`);
  const t0 = hours[0].t;
  for (const a of aqi) {
    const i = Math.floor((a.t - t0) / HOUR);
    if (i >= 0 && i < n && a.aqi != null) out.push(`<circle cx="${cx(i)}" cy="${tTop - 20}" r="4" fill="${aqiColor(a.aqi)}"/>`);
  }
  out.push(`<line class="g-base" x1="0" x2="${width}" y1="${rBottom}" y2="${rBottom}"/>`);
  hours.forEach((h, i) => {
    const hr = hourOf(h.t, tz);
    if (hr % 3 === 0) out.push(`<text class="g-time" x="${cx(i)}" y="${rBottom + 16}">${hr}時</text>`);
  });
  const ys = key => hours.map(h => (h[key] == null ? '' : y(h[key]))).join(',');
  out.push(`<line class="g-cross" x1="-99" x2="-99" y1="${tTop - 24}" y2="${rBottom}"/><circle class="g-dot g-dot-f" r="4" cx="-99" cy="0"/><circle class="g-dot g-dot-t" r="5" cx="-99" cy="0"/>`);
  return `<svg class="graph day-graph" xmlns="http://www.w3.org/2000/svg" viewBox="-10 0 ${width + 20} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="這一天的溫度、紫外線、降雨與空氣" data-n="${n}" data-col="${colW}" data-ty="${ys('temp')}" data-fy="${ys('feels')}">${out.join('')}</svg>`;
}

// What the crosshair reads at one hour of the day sheet: the time, then
// every number for it.
export function scrubHtml(h, { tz, aqi = null } = {}) {
  if (!h) return '';
  const cell = (k, v, sub = '') => `<div><span>${k}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const deg = v => (v == null ? '–' : `${Math.round(v)}°`);
  const w = h.wind || {};
  return `<div class="wx-scrub-time"><b>${clock(h.t, tz)}</b><span>${h.place ? `${e(h.place)} · ` : ''}${e(h.condition?.text || '')}</span></div>
    <div class="wx-scrub-vals">
      ${cell('溫度', deg(h.temp), `體感 ${deg(h.feels)}`)}
      ${cell('降雨', h.pop == null ? '–' : `${h.pop}%`, h.mm >= 0.1 ? `${h.mm} mm` : '')}
      ${cell('紫外線', h.uv ?? '–', h.uv >= 3 ? '要防曬' : '')}
      ${aqi ? cell('空氣', String(aqi.aqi), aqi.pm25 != null ? `PM2.5 ${aqi.pm25}` : '') : cell('濕度', h.humidity == null ? '–' : `${h.humidity}%`, w.speed != null ? `風 ${Math.round(w.speed)} km/h` : '')}
    </div>`;
}

// The read-out for a picked column: "10/3 週六 13:00 · 學校 · …", or a day's.
export function readout(kind, col, tz) {
  if (!col) return '';
  const when = col.t == null ? `${col.label}${col.date ? ` ${shortDate(col.date)}` : ''}` : `${shortDate(dateOf(col.t, tz))} ${weekday(dateOf(col.t, tz))} ${clock(col.t, tz)}${col.place ? ` · ${col.place}` : ''}`;
  if (kind === 'uv') return col.t == null ? `${when} · 最高 UV ${col.uvMax ?? '–'}` : `${when} · 紫外線 ${col.uv ?? '–'}`;
  if (kind === 'rain') return `${when} · 降雨機率 ${col.pop ?? '–'}%${col.mm >= 0.1 ? ` · ${col.t == null ? '約 ' : '雨量 '}${col.mm} mm` : ''}`;
  if (kind === 'air') return `${when} · AQI ${col.aqi ?? '–'}${col.aqi != null ? ` ${AQI_NAMES.find(([m]) => col.aqi <= m)[1]}` : ''}${col.pm25 != null ? ` · PM2.5 ${col.pm25}` : ''}${col.main ? ` · 主要 ${col.main}` : ''}`;
  return when;
}
const AQI_NAMES = [[50, '良好'], [100, '普通'], [150, '對敏感族群不健康'], [200, '不健康'], [300, '非常不健康'], [Infinity, '危害']];
