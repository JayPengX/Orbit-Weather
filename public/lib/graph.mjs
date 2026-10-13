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

import { glyph } from './icons.mjs';
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
  const pw = Number(svg.dataset.pw) || CHART_W;
  return Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * (CHART_W / pw) * n)));
}
export function colSpot(svg, i) {
  const n = Number(svg.dataset.n);
  const y = svg.dataset.ys.split(',')[i];
  return { x: r1((i + 0.5) * ((Number(svg.dataset.pw) || CHART_W) / n)), y: y === '' || y == null ? null : Number(y) };
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

// One day (the 10 days' sheet): temperature (and feels-like, the high and
// low marked), then rain and UV under it on the same hours. All three share
// one frame: the plot DAY_PW wide, the scale in the gutter on its right (so
// no number sits on a line), the hours under each. Rain is a bar an hour
// (the amount darker inside it); a dry day has no rain chart, its header
// says so. The crosshair over all three is the app's, shown only while a
// finger is on them.
export const DAY_PW = CHART_W - 30;
const DAY_TOP = 20;
const DAY_UNDER = 24;
// Temperature's colours, cold to hot (the line and its fill).
const TEMP_STOPS = [[8, '#5ac8fa'], [16, '#4fd1c5'], [21, '#9be15d'], [25, '#ffd43b'], [29, '#ff9f0a'], [33, '#ff453a'], [37, '#d0367a']];
const mix = (a, b, t) => `#${[0, 2, 4].map(k => Math.round(parseInt(a.slice(1 + k, 3 + k), 16) * (1 - t) + parseInt(b.slice(1 + k, 3 + k), 16) * t).toString(16).padStart(2, '0')).join('')}`;
const colourAt = (stops, v) => {
  if (v <= stops[0][0]) return stops[0][1];
  const j = stops.findIndex(([s]) => s >= v);
  if (j < 0) return stops[stops.length - 1][1];
  const [s0, c0] = stops[j - 1];
  const [s1, c1] = stops[j];
  return mix(c0, c1, (v - s0) / (s1 - s0));
};

export function dayCharts(hours, { tz } = {}) {
  const n = hours.length;
  if (!n) return '';
  const w = DAY_PW / n;
  const x = i => r1((i + 0.5) * w);
  const id = ++made;
  const under = h => (hourOf(h.t, tz) % 3 === 0 ? `${hourOf(h.t, tz)}時` : '');
  // A panel: the grid and its scale, the base, the hours; `body` draws on it.
  const panel = ({ cls, graph, label, ph, ticks, yOf, body, ys }) => {
    const base = DAY_TOP + ph;
    const out = [];
    for (const [v, text] of ticks) out.push(`<line class="ch-grid" x1="0" x2="${DAY_PW}" y1="${yOf(v)}" y2="${yOf(v)}"/><text class="ch-ax" x="${CHART_W}" y="${r1(yOf(v) + 3.5)}">${text}</text>`);
    out.push(`<line class="ch-base" x1="0" x2="${DAY_PW}" y1="${base}" y2="${base}"/>`, ...body);
    let last = -99;
    hours.forEach((h, i) => {
      const t = under(h);
      if (!t || x(i) - last < 30) return;
      last = x(i);
      out.push(`<text class="ch-t" x="${r1(Math.min(DAY_PW - 12, Math.max(12, x(i))))}" y="${base + 17}">${t}</text>`);
    });
    return `<svg class="ch ${cls}" data-graph="${graph}" data-n="${n}" data-pw="${DAY_PW}" data-ys="${ys || ''}" viewBox="0 0 ${CHART_W} ${base + DAY_UNDER}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
  };
  // A smooth line coloured by its value, a fill under it fading to nothing.
  const line = (key, { lo, hi, ph, stops, cls = 'ch-dl', fill = true }) => {
    const base = DAY_TOP + ph;
    const y = v => r1(base - ((v - lo) / (hi - lo)) * ph);
    const pts = hours.map((h, i) => (h[key] == null ? null : [x(i), y(h[key])])).filter(Boolean);
    if (!pts.length) return { y, body: [] };
    const gid = `dl${id}-${key}`;
    const steps = 6;
    const grad = `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${base}" y2="${DAY_TOP}">${Array.from({ length: steps + 1 }, (_, k) => `<stop offset="${r1((k / steps) * 100)}%" stop-color="${colourAt(stops, lo + ((hi - lo) * k) / steps)}"/>`).join('')}</linearGradient>`;
    const fade = `<linearGradient id="${gid}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity=".42"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="${gid}m" maskContentUnits="userSpaceOnUse"><rect x="0" y="${DAY_TOP - 12}" width="${DAY_PW}" height="${base - DAY_TOP + 12}" fill="url(#${gid}f)"/></mask>`;
    const d = smooth(pts, DAY_TOP - 12, base);
    const a = pts[0];
    const z = pts[pts.length - 1];
    return { y, body: [`<defs>${grad}${fill ? fade : ''}</defs>`, fill && pts.length > 1 ? `<path d="${d}L${z[0]},${base}L${a[0]},${base}Z" fill="url(#${gid})" mask="url(#${gid}m)"/>` : '', `<path class="${cls}" d="${d}" stroke="url(#${gid})"/>`] };
  };
  // A marked value: a dot on the line, its words just above it (the high)
  // or under it (the low), the other way when there's no room; kept inside
  // the plot, a halo of the sheet's colour where they cross a line.
  const mark = (i, yDot, text, { above, base }) => {
    const up = above ? yDot - 11 >= 12 : yDot + 21 > base - 2;
    const tx = x(i);
    const anchor = tx < 34 ? 'start' : tx > DAY_PW - 34 ? 'end' : 'middle';
    const ax = anchor === 'start' ? Math.max(2, tx - 6) : anchor === 'end' ? Math.min(DAY_PW, tx + 6) : tx;
    return `<circle class="ch-hl" cx="${tx}" cy="${yDot}" r="4.5"/><text class="ch-val ch-big" x="${r1(ax)}" y="${r1(up ? yDot - 11 : yDot + 21)}" style="text-anchor:${anchor}">${text}</text>`;
  };

  // Temperature and feels-like on one scale, whole 2 or 5 degrees marked.
  const vals = hours.flatMap(h => [h.temp, h.feels]).filter(v => v != null);
  let lo = Math.floor(Math.min(...vals)) - 1;
  let hi = Math.ceil(Math.max(...vals)) + 1;
  if (hi - lo < 8) [lo, hi] = [Math.floor((hi + lo) / 2 - 4), Math.ceil((hi + lo) / 2 + 4)];
  const tph = 136;
  const tbase = DAY_TOP + tph;
  const tLine = line('temp', { lo, hi, ph: tph, stops: TEMP_STOPS, cls: 'ch-tline' });
  const fLine = line('feels', { lo, hi, ph: tph, stops: TEMP_STOPS, cls: 'ch-fline', fill: false });
  const ty = tLine.y;
  const stepT = hi - lo > 14 ? 5 : 2;
  const tTicks = [];
  for (let v = Math.ceil(lo / stepT) * stepT; v < hi; v += stepT) tTicks.push([v, `${v}°`]);
  const iHi = hours.reduce((a, h, i) => (h.temp != null && (a < 0 || h.temp > hours[a].temp) ? i : a), -1);
  const iLo = hours.reduce((a, h, i) => (h.temp != null && (a < 0 || h.temp < hours[a].temp) ? i : a), -1);
  const marks = [];
  if (iHi >= 0) marks.push(mark(iHi, ty(hours[iHi].temp), `最高 ${Math.round(hours[iHi].temp)}°`, { above: true, base: tbase }));
  if (iLo >= 0 && iLo !== iHi) marks.push(mark(iLo, ty(hours[iLo].temp), `最低 ${Math.round(hours[iLo].temp)}°`, { above: false, base: tbase }));
  const temp = panel({ cls: 'ch-daytemp', graph: 'day', label: '這一天的溫度與體感', ph: tph, ticks: tTicks, yOf: ty, body: [fLine.body[0], ...tLine.body.slice(0, 2), fLine.body[2], tLine.body[2], ...marks], ys: hours.map(h => (h.temp == null ? '' : ty(h.temp))).join(',') });

  // Rain: a bar an hour, its chance; the amount darker inside (10 mm = 40%).
  const maxPop = Math.max(0, ...hours.map(h => h.pop ?? 0));
  const wet = hours.some(h => h.mm >= 0.1);
  const dry = maxPop < 10 && !wet;
  let rain = '';
  if (!dry) {
    const rph = 70;
    const rbase = DAY_TOP + rph;
    const ry = v => r1(rbase - (Math.max(0, Math.min(100, v)) / 100) * rph);
    const bw = r1(Math.max(2, Math.min(9, w * 0.62)));
    const body = [];
    hours.forEach((h, i) => {
      if (!(h.pop > 0)) return;
      body.push(`<rect class="ch-rbar" x="${r1(x(i) - bw / 2)}" y="${ry(h.pop)}" width="${bw}" height="${r1(Math.max(2, rbase - ry(h.pop)))}" rx="${r1(Math.min(3, bw / 2))}" fill="${[...RAIN_STOPS].reverse().find(([v]) => h.pop >= v)[1]}"/>`);
      if (h.mm >= 0.1) {
        const mh = r1(Math.max(2, Math.min(1, h.mm / 10) * rph * 0.4));
        body.push(`<rect class="ch-inner" x="${r1(x(i) - bw / 2)}" y="${r1(rbase - mh)}" width="${bw}" height="${mh}" rx="${r1(Math.min(3, bw / 2))}"/>`);
      }
    });
    const iMax = hours.findIndex(h => h.pop === maxPop);
    const lx = x(iMax);
    const anchor = lx < 20 ? 'start' : lx > DAY_PW - 20 ? 'end' : 'middle';
    body.push(`<text class="ch-val" x="${r1(anchor === 'start' ? Math.max(2, lx - bw / 2) : anchor === 'end' ? lx + bw / 2 : lx)}" y="${r1(Math.max(12, ry(maxPop) - 6))}" style="text-anchor:${anchor}">${maxPop}%</text>`);
    rain = panel({ cls: 'ch-dayrain', graph: 'day-rain', label: '這一天的降雨機率', ph: rph, ticks: [[50, '50%'], [100, '100%']], yOf: ry, body });
  }

  // UV: its line coloured by the level, the peak marked.
  let uv = '';
  if (hours.some(h => h.uv > 0)) {
    const uph = 56;
    const umax = Math.max(11, ...hours.map(h => h.uv ?? 0));
    const uLine = line('uv', { lo: 0, hi: umax, ph: uph, stops: UV_STOPS, cls: 'ch-uline' });
    const iMax = hours.reduce((a, h, i) => (h.uv != null && (a < 0 || h.uv > hours[a].uv) ? i : a), -1);
    const yv = uLine.y(hours[iMax].uv);
    uv = panel({ cls: 'ch-dayuv', graph: 'day-uv', label: '這一天的紫外線', ph: uph, ticks: [[3, '3'], [6, '6'], [11, '11']], yOf: uLine.y, body: [...uLine.body, mark(iMax, yv, String(hours[iMax].uv), { above: true, base: DAY_TOP + uph })] });
  }

  const rainNote = dry ? `<span class="wx-dch-note">${maxPop ? `最高 ${maxPop}%` : '不會下雨'}</span>` : wet ? '<span class="l-mm">深色＝雨量</span>' : '';
  return `<div class="wx-dch"><p class="wx-dch-h">${glyph('thermo', { size: 16 })}溫度 <span class="l-temp">溫度</span><span class="l-feels">體感</span></p>${temp}</div>
    <div class="wx-dch${dry ? ' is-dry' : ''}"><p class="wx-dch-h">${glyph('umbrella', { size: 16 })}降雨機率 ${rainNote}</p>${rain}</div>
    ${uv ? `<div class="wx-dch"><p class="wx-dch-h">${glyph('sun', { size: 16 })}紫外線</p>${uv}</div>` : ''}
    <i class="ch-xh" hidden></i><i class="ch-dh" hidden></i>`;
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
