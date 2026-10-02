// The cards' graphs: smooth area charts, as far ahead as the data goes,
// swiped sideways, one small SVG a day (a phone's browser drops parts of a
// single very wide picture). The fill and the line take the level's colour
// (UV green → violet, AQI green → red, rain light → deep blue); a day's
// peak is labelled; under it the hours and each day's date; a place's name
// where the route changes city (我的行程).
//
// The app puts a crosshair on a column (tap, or hold and slide) and its
// numbers above the graph: `colAt` finds the column under a finger, `colY`
// says where its dot goes.

import { clock, hourOf, dateOf, shortDate, weekday, uvColor, aqiColor, rainColor, escapeHtml as e } from './format.mjs';

export const COL = 28;
export const DAY_COL = 56;
const HOUR = 3_600_000;
const TOP = 30;
const PH = 176;
const AX = 44;
export const CHART_H = TOP + PH + AX;
const r1 = v => Math.round(v * 10) / 10;
const BASE = TOP + PH;
const yOf = (v, max) => r1(BASE - Math.max(0, Math.min(1, v / max)) * PH);

// Level colours, as stops on the value scale.
const UV_STOPS = [[0, '#4caf50'], [3, '#f5c518'], [6, '#ff8c1a'], [8, '#e53935'], [11, '#8e24aa']];
const AQI_STOPS = [[0, '#4caf50'], [51, '#f5c518'], [101, '#ff8c1a'], [151, '#e53935'], [201, '#8e24aa']];
const RAIN_STOPS = [[0, '#a5d4ff'], [40, '#5aa9f5'], [70, '#2f7de1']];

// A vertical gradient in the plot's own units: a value's height gets its
// level's colour (hard steps between levels).
function gradient(id, stops, max) {
  const out = [];
  stops.forEach(([v, c], i) => {
    const from = Math.min(1, v / max);
    const next = stops[i + 1] ? Math.min(1, stops[i + 1][0] / max) : 1;
    if (from >= 1) return;
    out.push(`<stop offset="${r1(from * 100)}%" stop-color="${c}"/><stop offset="${r1(next * 100)}%" stop-color="${c}"/>`);
  });
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${BASE}" y2="${TOP}">${out.join('')}</linearGradient>`;
}

// Points → a smooth path (Catmull-Rom as Béziers).
function smooth(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0] - 6},${pts[0][1]}L${pts[0][0] + 6},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    // Never above the top or below the base between points.
    const cl = y => Math.max(TOP, Math.min(BASE, y));
    d += `C${r1(c1[0])},${r1(cl(c1[1]))} ${r1(c2[0])},${r1(cl(c2[1]))} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// The columns cut into pieces: a piece per day, a new one at a gap in the
// hours, and the forecast days (`daily`) together at the end.
function pieces(cols, tz) {
  const out = [];
  cols.forEach((c, i) => {
    const date = c.date || dateOf(c.t, tz);
    const last = out[out.length - 1];
    const prev = cols[i - 1];
    const joins = last && (c.daily ? prev?.daily : !prev?.daily && last.date === date && c.t - prev.t === HOUR);
    if (joins) last.cols.push(c);
    else out.push({ start: i, date, daily: Boolean(c.daily), cols: [c] });
  });
  return out;
}

// cols: [{ t | date, v, under, strong, fc, inner (0–1, a darker bar from
// the bottom: rain's amount), place, daily, label }].
let made = 0;
export function chart(id, cols, { max, stops, tz, label, nowIndex = -1, grid = [], minLabel = 0, fmt = v => String(Math.round(v)) }) {
  const parts = pieces(cols, tz);
  const chartN = ++made;
  const svgs = parts.map((p, pi) => {
    // Each piece its own gradient (an id another SVG defines isn't always found).
    const gid = `g${chartN}-${id}-${pi}`;
    const w = p.daily ? DAY_COL : COL;
    const width = p.cols.length * w;
    const out = [];
    const xOf = j => r1((j + 0.5) * w);
    // Days alternate shade; the level lines.
    if (pi % 2) out.push(`<rect class="ch-band" x="0" y="0" width="${width}" height="${CHART_H}"/>`);
    for (const g of grid) if (g < max) out.push(`<line class="ch-grid" x1="0" x2="${width}" y1="${yOf(g, max)}" y2="${yOf(g, max)}"/>`);
    out.push(`<line class="ch-base" x1="0" x2="${width}" y1="${BASE}" y2="${BASE}"/>`);
    if (p.daily) {
      p.cols.forEach((c, j) => {
        if (c.v == null) return;
        const y = yOf(c.v, max);
        out.push(`<rect class="ch-dbar" x="${j * w + 10}" y="${y}" width="${w - 20}" height="${r1(BASE - y)}" rx="7" fill="url(#${gid})"/>`);
        out.push(`<text class="ch-val" x="${xOf(j)}" y="${r1(y - 8)}">${e(fmt(c.v))}</text>`);
      });
    } else {
      // The line (and its area) through each run of known values; the
      // neighbouring day's point outside the edge keeps it continuous.
      const prevP = parts[pi - 1];
      const nextP = parts[pi + 1];
      const before = prevP && !prevP.daily && p.cols[0].t - prevP.cols[prevP.cols.length - 1].t === HOUR ? prevP.cols[prevP.cols.length - 1] : null;
      const after = nextP && !nextP.daily && nextP.cols[0].t - p.cols[p.cols.length - 1].t === HOUR ? nextP.cols[0] : null;
      const seq = [...(before ? [{ ...before, x: -w / 2 }] : []), ...p.cols.map((c, j) => ({ ...c, x: xOf(j) })), ...(after ? [{ ...after, x: width + w / 2 }] : [])];
      // Runs: known values, cut where measured turns to forecast (both keep the joint).
      const runs = [];
      let run = null;
      for (const c of seq) {
        if (c.v == null) {
          run = null;
          continue;
        }
        if (run && run.fc !== Boolean(c.fc)) {
          const joint = run.pts[run.pts.length - 1];
          run = { fc: Boolean(c.fc), pts: [joint] };
          runs.push(run);
        } else if (!run) {
          run = { fc: Boolean(c.fc), pts: [] };
          runs.push(run);
        }
        run.pts.push([r1(c.x), yOf(c.v, max)]);
      }
      for (const r of runs) {
        const line = smooth(r.pts);
        const a = r.pts[0];
        const z = r.pts[r.pts.length - 1];
        out.push(`<path class="ch-area${r.fc ? ' ch-fc' : ''}" d="${line}L${z[0]},${BASE}L${a[0]},${BASE}Z" fill="url(#${gid})"/>`);
        out.push(`<path class="ch-line${r.fc ? ' ch-fc' : ''}" d="${line}" stroke="url(#${gid})"/>`);
      }
      // The darker bars from the bottom (rain's amount).
      p.cols.forEach((c, j) => {
        if (c.inner > 0) out.push(`<rect class="ch-inner" x="${j * w + 7}" y="${r1(BASE - c.inner * PH * 0.4)}" width="${w - 14}" height="${r1(c.inner * PH * 0.4)}" rx="3"/>`);
      });
      // The day's peak, labelled (and now's value).
      let peak = -1;
      p.cols.forEach((c, j) => {
        if (c.v != null && c.v >= minLabel && (peak < 0 || c.v > p.cols[peak].v)) peak = j;
      });
      const nowJ = nowIndex - p.start;
      // (The peak's label only away from now's, so they don't overlap.)
      const nowIn = nowJ >= 0 && nowJ < p.cols.length;
      if (nowIn && Math.abs(peak - nowJ) <= 2) peak = -1;
      for (const j of new Set([peak, nowIn ? nowJ : -1])) {
        const c = p.cols[j];
        if (j < 0 || c?.v == null) continue;
        const y = yOf(c.v, max);
        out.push(`<circle class="ch-pt" cx="${xOf(j)}" cy="${y}" r="3.5" fill="url(#${gid})"/><text class="ch-val${j === nowJ ? ' ch-now-val' : ''}" x="${xOf(j)}" y="${r1(Math.max(TOP - 6, y - 10))}">${e(fmt(c.v))}</text>`);
      }
      if (nowJ >= 0 && nowJ < p.cols.length) out.push(`<line class="ch-now" x1="${xOf(nowJ)}" x2="${xOf(nowJ)}" y1="${TOP - 4}" y2="${BASE}"/>`);
    }
    // A place's name where the route changes city.
    p.cols.forEach((c, j) => {
      const prev = cols[p.start + j - 1];
      if (c.place && prev && prev.place !== c.place) out.push(`<line class="ch-move" x1="${j * w}" x2="${j * w}" y1="0" y2="${BASE}"/><text class="ch-place" x="${j * w + 4}" y="13">${e(c.place)}</text>`);
    });
    // Under: the hours (or the forecast days' names), then the date.
    p.cols.forEach((c, j) => {
      if (c.under) out.push(`<text class="ch-t${c.strong ? ' ch-strong' : ''}" x="${xOf(j)}" y="${BASE + 17}">${e(c.under)}</text>`);
    });
    // The date, where the piece has room for it.
    if (width >= 76 || p.daily) out.push(`<text class="ch-date" x="4" y="${BASE + 37}">${e(p.daily ? '之後幾天' : `${shortDate(p.date)} ${weekday(p.date)}`)}</text>`);
    return `<svg class="ch-seg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CHART_H}" viewBox="0 0 ${width} ${CHART_H}" data-start="${p.start}" data-n="${p.cols.length}" data-w="${w}" data-d="${e(p.date)}" data-ys="${p.cols.map(c => (c.v == null ? '' : yOf(c.v, max))).join(',')}"><defs>${gradient(gid, stops, max)}</defs>${out.join('')}</svg>`;
  });
  return `<div class="ch" data-graph="${id}" role="img" aria-label="${e(label)}">${svgs.join('')}<i class="ch-cross" hidden></i><i class="ch-dot" hidden></i></div>`;
}

// The column under a finger at clientX in a chart: its index.
export function colAt(chartEl, clientX) {
  const segs = [...chartEl.querySelectorAll('svg.ch-seg')];
  for (const s of segs) {
    const r = s.getBoundingClientRect();
    if (clientX < r.right || s === segs[segs.length - 1]) {
      const j = Math.max(0, Math.min(Number(s.dataset.n) - 1, Math.floor((clientX - r.left) / Number(s.dataset.w))));
      return Number(s.dataset.start) + j;
    }
  }
  return 0;
}
// Where column i is in the chart: { x, y (null without a value), seg }.
export function colSpot(chartEl, i) {
  for (const s of chartEl.querySelectorAll('svg.ch-seg')) {
    const start = Number(s.dataset.start);
    const n = Number(s.dataset.n);
    if (i >= start && i < start + n) {
      const j = i - start;
      const y = s.dataset.ys.split(',')[j];
      // (An SVG has no offsetLeft: measured against the chart.)
      const left = s.getBoundingClientRect().left - chartEl.getBoundingClientRect().left;
      return { x: left + (j + 0.5) * Number(s.dataset.w), y: y === '' ? null : Number(y), seg: s };
    }
  }
  return null;
}

// An hour's label: every 3 hours by the clock; midnight is the date's.
const hourText = (t, tz) => {
  const h = hourOf(t, tz);
  return h % 3 === 0 && h !== 0 ? `${h}時` : '';
};

// UV: the daylight hours only (6–18 時), a day's piece after another.
export function uvCols(hours, tz) {
  return hours.filter(h => {
    const hr = hourOf(h.t, tz);
    return hr >= 6 && hr <= 18;
  });
}
export function uvGraph(hours, { tz, now = Date.now() } = {}) {
  const list = uvCols(hours, tz);
  const nowIndex = list.findIndex(h => h.t <= now && now < h.t + HOUR);
  const cols = list.map((h, i) => ({ t: h.t, v: h.uv, place: h.place, under: i === nowIndex ? '現在' : hourOf(h.t, tz) % 3 === 0 ? `${hourOf(h.t, tz)}時` : '', strong: i === nowIndex }));
  const max = Math.max(11, ...list.map(h => h.uv ?? 0));
  return chart('uv', cols, { max, stops: UV_STOPS, tz, label: '逐時紫外線（白天）', nowIndex, grid: [3, 6, 8], minLabel: 1 });
}

// Rain: the chance as the area (0–100), the amount as darker bars from the
// bottom (10 mm fills 40% of the height); then any days past the hours.
export function rainGraph(hours, { tz } = {}) {
  const cols = hours.map((h, i) =>
    h.daily
      ? { date: h.date, daily: true, v: h.pop, under: h.label }
      : { t: h.t, v: h.pop, place: h.place, inner: h.mm >= 0.1 ? Math.min(1, h.mm / 10) : 0, under: i === 0 ? '現在' : hourText(h.t, tz), strong: i === 0 }
  );
  return chart('rain', cols, { max: 100, stops: RAIN_STOPS, tz, label: '降雨機率：逐時，之後逐日', nowIndex: 0, grid: [25, 50, 75], minLabel: 10, fmt: v => `${Math.round(v)}%` });
}

// Air: the hours measured, then the hours forecast (dashed), on one clock;
// the forecast days after, a bar each.
export function airGraph(cols, { tz } = {}) {
  const first = cols.findIndex(c => c.fc);
  const nowIndex = first > 0 ? first - 1 : first < 0 ? cols.length - 1 : 0;
  const out = cols.map((c, i) => ({ ...c, v: c.aqi, under: c.daily ? c.label : i === nowIndex ? '現在' : hourText(c.t, tz), strong: i === nowIndex }));
  const max = Math.max(150, ...cols.map(c => c.aqi ?? 0));
  return chart('air', out, { max, stops: AQI_STOPS, tz, label: '空氣品質：測到的與預測的', nowIndex, grid: [50, 100] });
}

// (Kept for the day sheet's legend colours.)
export { uvColor, aqiColor, rainColor };

// One day, everything over each other (the day list's sheet): temperature
// and feels-like lines, UV as a coloured band, rain bars, AQI dots where
// measured. Fitted to the width (24 columns): small, so one SVG is fine.
export function dayGraph(hours, { tz, aqi = [], colW = 15 } = {}) {
  const n = hours.length;
  if (!n) return '';
  const width = n * colW;
  const tTop = 30;
  const tBottom = 170;
  const uvY = 184;
  const rTop = 204;
  const rBottom = 284;
  const height = rBottom + 22;
  const vals = hours.flatMap(h => [h.temp, h.feels]).filter(v => v != null);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 6) [lo, hi] = [(hi + lo) / 2 - 3, (hi + lo) / 2 + 3];
  const y = v => tBottom - ((v - lo) / (hi - lo)) * (tBottom - tTop);
  const cx = i => i * colW + colW / 2;
  const line = key => {
    let d = '';
    hours.forEach((h, i) => {
      if (h[key] == null) return;
      d += `${d ? 'L' : 'M'}${r1(cx(i))},${r1(y(h[key]))}`;
    });
    return d;
  };
  const out = [];
  out.push(`<path class="g-feels" d="${line('feels')}"/><path class="g-temp" d="${line('temp')}"/>`);
  hours.forEach((h, i) => {
    if (h.temp != null && i % 3 === 1) out.push(`<text class="g-val" x="${cx(i)}" y="${r1(y(h.temp) - 8)}">${Math.round(h.temp)}°</text>`);
    if (h.uv > 0) out.push(`<rect x="${i * colW + 1}" y="${uvY}" width="${colW - 2}" height="8" rx="2" fill="${uvColor(h.uv)}"/>`);
    const p = h.pop ?? 0;
    const bh = p > 0 ? Math.max(2, ((rBottom - rTop) * p) / 100) : 0;
    if (bh) out.push(`<rect x="${i * colW + 2}" y="${r1(rBottom - bh)}" width="${colW - 4}" height="${r1(bh)}" rx="2" fill="${rainColor(p)}"/>`);
    if (p >= 30 && i % 2 === 0) out.push(`<text class="g-val" x="${cx(i)}" y="${r1(rBottom - bh - 3)}">${Math.round(p)}</text>`);
  });
  const t0 = hours[0].t;
  for (const a of aqi) {
    const i = Math.floor((a.t - t0) / HOUR);
    if (i >= 0 && i < n && a.aqi != null) out.push(`<circle cx="${cx(i)}" cy="${tTop - 16}" r="4" fill="${aqiColor(a.aqi)}"/>`);
  }
  out.push(`<line class="g-base" x1="0" x2="${width}" y1="${rBottom}" y2="${rBottom}"/>`);
  hours.forEach((h, i) => {
    const hr = hourOf(h.t, tz);
    if (hr % 3 === 0) out.push(`<text class="g-time" x="${cx(i)}" y="${rBottom + 15}">${hr}時</text>`);
  });
  // The crosshair a finger moves (app.mjs): a line, a dot on each curve.
  // `data-ty` / `data-fy`: each hour's height on the curves.
  const ys = key => hours.map(h => (h[key] == null ? '' : r1(y(h[key])))).join(',');
  out.push(`<line class="g-cross" x1="-99" x2="-99" y1="${tTop - 22}" y2="${rBottom}"/><circle class="g-dot g-dot-f" r="4" cx="-99" cy="0"/><circle class="g-dot g-dot-t" r="5" cx="-99" cy="0"/>`);
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

// The read-out for a tapped column: "10/3 週六 13:00 · …".
export function readout(kind, col, tz) {
  if (!col) return '';
  const when = col.daily ? `${shortDate(col.date)} ${col.label}（預測）` : `${shortDate(dateOf(col.t, tz))} ${weekday(dateOf(col.t, tz))} ${clock(col.t, tz)}${col.fc ? '（預測）' : ''}${col.place && kind !== 'plan' ? ` · ${col.place}` : ''}`;
  if (kind === 'uv') return `${when} · 紫外線 ${col.uv ?? '–'}`;
  if (kind === 'rain') return `${when} · 降雨機率 ${col.pop ?? '–'}%${col.mm >= 0.1 ? ` · 雨量 ${col.mm} mm` : ''}`;
  if (kind === 'air') return `${when} · AQI ${col.aqi ?? '–'}${col.pm25 != null ? ` · PM2.5 ${col.pm25}` : ''}`;
  if (kind === 'plan') return `${when} · ${col.place} · ${col.temp == null ? '–' : `${Math.round(col.temp)}°`} · 雨 ${col.pop ?? '–'}%${col.uv >= 3 ? ` · UV ${col.uv}` : ''}`;
  return when;
}
