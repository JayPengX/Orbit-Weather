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
export const PLOT_BOTTOM = BASE;
export const CHART_H = BASE + 42;
const r1 = v => Math.round(v * 10) / 10;
const yOf = (v, max) => r1(BASE - Math.max(0, Math.min(1, v / max)) * PH);

export const UV_STOPS = [[0, '#4caf50'], [3, '#f5c518'], [6, '#ff8c1a'], [8, '#e53935'], [11, '#8e24aa']];
export const AQI_STOPS = [[0, '#4caf50'], [51, '#f5c518'], [101, '#ff8c1a'], [151, '#e53935'], [201, '#8e24aa']];
export const RAIN_STOPS = [[0, '#a5d4ff'], [40, '#5aa9f5'], [70, '#2f7de1']];

// A vertical gradient in the plot's units: a height gets its level's colour.
function gradient(id, stops, max, base = BASE) {
  const out = [];
  stops.forEach(([v, c], i) => {
    const from = Math.min(1, v / max);
    const next = stops[i + 1] ? Math.min(1, stops[i + 1][0] / max) : 1;
    if (from < 1) out.push(`<stop offset="${r1(from * 100)}%" stop-color="${c}"/><stop offset="${r1(next * 100)}%" stop-color="${c}"/>`);
  });
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${base}" y2="${TOP}">${out.join('')}</linearGradient>`;
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
export function chart(id, cols, { max, stops, tz, label, nowIndex = -1, grid = [], fmt = v => String(Math.round(v)), minLabel = 0, bars = false, height = PH, dates = true }) {
  // A shorter plot (the day sheet's rain and UV) when asked; no date row there.
  const ph = height;
  const base = TOP + ph;
  const chartH = base + (dates ? 42 : 24);
  const yv = (v, mx) => r1(base - Math.max(0, Math.min(1, v / mx)) * ph);
  const n = Math.max(1, cols.length);
  const w = CHART_W / n;
  const gid = `g${++made}-${id}`;
  const xOf = i => r1((i + 0.5) * w);
  const out = [`<defs>${gradient(gid, stops, max, base)}</defs>`];
  for (const g of grid) if (g < max) out.push(`<line class="ch-grid" x1="0" x2="${CHART_W}" y1="${yv(g, max)}" y2="${yv(g, max)}"/>`);
  out.push(`<line class="ch-base" x1="0" x2="${CHART_W}" y1="${base}" y2="${base}"/>`);
  const dateOfCol = c => c.date || dateOf(c.t, tz);
  if (bars) {
    cols.forEach((c, i) => {
      if (c.v == null) return;
      const y = yv(c.v, max);
      const bw = Math.min(34, w * 0.62);
      // A bar is one colour: its value's level.
      const fill = [...stops].reverse().find(([v]) => c.v >= v)?.[1] || stops[0][1];
      out.push(`<rect class="ch-bar" x="${r1(xOf(i) - bw / 2)}" y="${y}" width="${r1(bw)}" height="${r1(Math.max(2, base - y))}" rx="${r1(Math.min(8, bw / 3))}" fill="${fill}"/>`);
      out.push(`<text class="ch-val" x="${xOf(i)}" y="${r1(y - 7)}">${e(fmt(c.v))}</text>`);
      if (c.inner > 0) out.push(`<rect class="ch-inner" x="${r1(xOf(i) - bw / 2)}" y="${r1(base - c.inner * ph * 0.4)}" width="${r1(bw)}" height="${r1(c.inner * ph * 0.4)}" rx="3"/>`);
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
      run.pts.push([xOf(i), yv(c.v, max)]);
    });
    for (const r of runs) {
      const line = smooth(r.pts, TOP, base);
      const a = r.pts[0];
      const z = r.pts[r.pts.length - 1];
      out.push(`<path class="ch-area${r.fc ? ' ch-fc' : ''}" d="${line}L${z[0]},${base}L${a[0]},${base}Z" fill="url(#${gid})"/><path class="ch-line${r.fc ? ' ch-fc' : ''}" d="${line}" stroke="url(#${gid})"/>`);
    }
    cols.forEach((c, i) => {
      if (c.inner > 0) out.push(`<rect class="ch-inner" x="${r1(i * w + w * 0.18)}" y="${r1(base - c.inner * ph * 0.4)}" width="${r1(w * 0.64)}" height="${r1(c.inner * ph * 0.4)}" rx="1.5"/>`);
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
      const y = yv(cols[i].v, max);
      out.push(`<circle class="ch-pt" cx="${xOf(i)}" cy="${y}" r="3.5" fill="url(#${gid})"/><text class="ch-val" x="${Math.min(CHART_W - 14, Math.max(14, xOf(i)))}" y="${r1(Math.max(TOP - 8, y - 10))}">${e(fmt(cols[i].v))}</text>`);
    }
    if (nowIndex >= 0) out.push(`<line class="ch-now" x1="${xOf(nowIndex)}" x2="${xOf(nowIndex)}" y1="${TOP - 4}" y2="${base}"/>`);
  }
  // Day changes: a line and the date under; a place's name where it changes.
  // (Axis words that would touch the one before are left out.)
  let lastUnder = -99;
  const firstChange = bars ? -1 : cols.findIndex((c, i) => i && dateOfCol(cols[i - 1]) !== dateOfCol(c));
  cols.forEach((c, i) => {
    const prev = cols[i - 1];
    if (dates && !bars && prev && dateOfCol(prev) !== dateOfCol(c)) out.push(`<line class="ch-day" x1="${r1(i * w)}" x2="${r1(i * w)}" y1="${TOP - 6}" y2="${base + 40}"/><text class="ch-date" x="${r1(Math.min(CHART_W - 60, i * w + 4))}" y="${base + 36}">${e(`${shortDate(dateOfCol(c))} ${weekday(dateOfCol(c))}`)}</text>`);
    if (c.place && prev && prev.place !== c.place) out.push(`<line class="ch-move" x1="${r1(i * w)}" x2="${r1(i * w)}" y1="4" y2="${base}"/><text class="ch-place" x="${r1(Math.min(CHART_W - 40, i * w + 3))}" y="14">${e(c.place)}</text>`);
    if (c.under && xOf(i) - lastUnder >= 30) {
      lastUnder = xOf(i);
      out.push(`<text class="ch-t${c.strong ? ' ch-strong' : ''}" x="${r1(Math.min(CHART_W - 12, Math.max(12, xOf(i))))}" y="${base + 17}">${e(c.under)}</text>`);
    }
    if (bars && c.date) out.push(`<text class="ch-t ch-sub" x="${xOf(i)}" y="${base + 34}">${e(shortDate(c.date))}</text>`);
  });
  if (dates && !bars && cols[0] && (firstChange < 0 || firstChange * w > 78)) out.push(`<text class="ch-date" x="2" y="${base + 36}">${e(`${shortDate(dateOfCol(cols[0]))} ${weekday(dateOfCol(cols[0]))}`)}</text>`);
  return `<svg class="ch" data-graph="${id}" data-n="${n}" data-ys="${cols.map(c => (c.v == null ? '' : yv(c.v, max))).join(',')}" viewBox="0 0 ${CHART_W} ${chartH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${e(label)}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
}

// A small card's line: the values as a smooth area, no labels (w × h).
export function spark(values, { max, stops, w = 120, h = 40, bars = false }) {
  const n = values.length;
  if (!n) return '';
  const gid = `s${++made}`;
  const top = 3;
  const base = h - 2;
  const y = v => r1(base - Math.max(0, Math.min(1, v / max)) * (base - top));
  const grad = `<defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${base}" y2="${top}">${stops
    .map(([v, c], i) => {
      const a = Math.min(1, v / max);
      const b = stops[i + 1] ? Math.min(1, stops[i + 1][0] / max) : 1;
      return a < 1 ? `<stop offset="${r1(a * 100)}%" stop-color="${c}"/><stop offset="${r1(b * 100)}%" stop-color="${c}"/>` : '';
    })
    .join('')}</linearGradient></defs>`;
  let body = '';
  if (bars) {
    const bw = Math.min(16, (w / n) * 0.6);
    body = values.map((v, i) => (v == null ? '' : `<rect x="${r1((i + 0.5) * (w / n) - bw / 2)}" y="${y(v)}" width="${r1(bw)}" height="${r1(Math.max(2, base - y(v)))}" rx="3" fill="${[...stops].reverse().find(([s0]) => v >= s0)?.[1] || stops[0][1]}"/>`)).join('');
  } else {
    const pts = values.map((v, i) => (v == null ? null : [r1((i / Math.max(1, n - 1)) * w), y(v)])).filter(Boolean);
    const line = smooth(pts, top, base);
    if (pts.length) body = `<path d="${line}L${pts[pts.length - 1][0]},${base}L${pts[0][0]},${base}Z" fill="url(#${gid})" opacity=".3"/><path d="${line}" fill="none" stroke="url(#${gid})" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  return `<svg class="wx-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${grad}${body}</svg>`;
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

// One day (the 10 days' sheet): a big temperature chart (temperature and
// feels-like, the high and low marked), then rain and UV under it on the
// same hours, each fitted to the width. The crosshair over all three is the
// app's, shown only while a finger is on them.
export function dayCharts(hours, { tz } = {}) {
  const n = hours.length;
  if (!n) return '';
  const w = CHART_W / n;
  const x = i => r1((i + 0.5) * w);
  const top = 28;
  const ph = 160;
  const base = top + ph;
  const H = base + 26;
  const vals = hours.flatMap(h => [h.temp, h.feels]).filter(v => v != null);
  let lo = Math.floor(Math.min(...vals)) - 1;
  let hi = Math.ceil(Math.max(...vals)) + 1;
  if (hi - lo < 8) [lo, hi] = [(hi + lo) / 2 - 4, (hi + lo) / 2 + 4];
  const y = v => r1(base - ((v - lo) / (hi - lo)) * ph);
  const pts = key => hours.map((h, i) => (h[key] == null ? null : [x(i), y(h[key])])).filter(Boolean);
  const out = [`<defs><linearGradient id="dt${++made}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#fb923c" stop-opacity=".45"/><stop offset="100%" stop-color="#fb923c" stop-opacity="0"/></linearGradient></defs>`];
  const gid = `dt${made}`;
  // Faint lines at whole 2 or 5 degrees.
  const stepT = hi - lo > 14 ? 5 : 2;
  for (let v = Math.ceil(lo / stepT) * stepT; v < hi; v += stepT) out.push(`<line class="ch-grid" x1="0" x2="${CHART_W}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-ax" x="${CHART_W - 2}" y="${r1(y(v) - 3)}">${v}°</text>`);
  const tp = pts('temp');
  const tl = smooth(tp, top - 12, base);
  if (tp.length > 1) out.push(`<path d="${tl}L${tp[tp.length - 1][0]},${base}L${tp[0][0]},${base}Z" fill="url(#${gid})"/>`);
  out.push(`<path class="ch-fline" d="${smooth(pts('feels'), top - 12, base)}"/><path class="ch-tline" d="${tl}"/>`);
  const iHi = hours.reduce((a, h, i) => (h.temp != null && (a < 0 || h.temp > hours[a].temp) ? i : a), -1);
  const iLo = hours.reduce((a, h, i) => (h.temp != null && (a < 0 || h.temp < hours[a].temp) ? i : a), -1);
  for (const [i, up] of [[iHi, true], [iLo, false]]) {
    if (i < 0) continue;
    out.push(`<circle class="ch-hl" cx="${x(i)}" cy="${y(hours[i].temp)}" r="4.5"/><text class="ch-val ch-big" x="${Math.min(CHART_W - 16, Math.max(16, x(i)))}" y="${r1(up || y(hours[i].temp) + 22 > base - 4 ? y(hours[i].temp) - 12 : y(hours[i].temp) + 22)}">${up ? '最高 ' : '最低 '}${Math.round(hours[i].temp)}°</text>`);
  }
  out.push(`<line class="ch-base" x1="0" x2="${CHART_W}" y1="${base}" y2="${base}"/>`);
  hours.forEach((h, i) => {
    const hr = hourOf(h.t, tz);
    if (hr % 3 === 0) out.push(`<text class="ch-t" x="${Math.min(CHART_W - 12, Math.max(12, x(i)))}" y="${base + 18}">${hr}時</text>`);
  });
  const temp = `<svg class="ch ch-daytemp" data-graph="day" data-n="${n}" data-ys="${hours.map(h => (h.temp == null ? '' : y(h.temp))).join(',')}" viewBox="0 0 ${CHART_W} ${H}" role="img" aria-label="這一天的溫度與體感" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
  const under = h => (hourOf(h.t, tz) % 3 === 0 ? `${hourOf(h.t, tz)}時` : '');
  const rain = chart('day-rain', hours.map(h => ({ t: h.t, v: h.pop, inner: h.mm >= 0.1 ? Math.min(1, h.mm / 10) : 0, under: under(h) })), { max: 100, stops: RAIN_STOPS, tz, label: '這一天的降雨機率', grid: [50], minLabel: 20, fmt: v => `${Math.round(v)}%`, height: 84, dates: false });
  const uv = hours.some(h => h.uv > 0) ? chart('day-uv', hours.map(h => ({ t: h.t, v: h.uv, under: under(h) })), { max: 11, stops: UV_STOPS, tz, label: '這一天的紫外線', grid: [3, 6, 8], minLabel: 1, height: 64, dates: false }) : '';
  return `<div class="wx-dch"><p class="wx-dch-h">🌡️ 溫度 <span class="l-temp">溫度</span><span class="l-feels">體感</span></p>${temp}</div>
    <div class="wx-dch"><p class="wx-dch-h">☔ 降雨機率 <span class="l-mm">深色＝雨量</span></p>${rain}</div>
    ${uv ? `<div class="wx-dch"><p class="wx-dch-h">☀️ 紫外線</p>${uv}</div>` : ''}
    <i class="ch-xh" hidden></i><i class="ch-dh" hidden></i>`;
}
// (The old name, for anything still asking for it.)
export const dayGraph = dayCharts;

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
