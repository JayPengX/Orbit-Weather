// The graphs: smooth area charts (or bars for days), each fitted to the
// sheet's width (no sideways scrolling); the sheet's tabs pick the range (24 hours, 48, 10 days…). The
// fill and line take the level's colour (UV green → violet, AQI green →
// red, rain light → deep blue); each day's peak is labelled; the hours
// under, the dates at day changes, a place's name where the route changes
// city (我的行程).
//
// The app moves a crosshair and dot (`.ch-x`, `.ch-d`) to the column under
// a finger or the mouse (`colAt`), dragging on the graph (it only pans up
// and down) — and shows the column's numbers above.

import { glyph } from './icons.mjs';
import { clock, hourOf, dateOf, shortDate, weekday, conditionText, aqiName } from './format.mjs';
import { escHtml as e } from '#kit/ui.mjs';
import { W } from '#kit/lang.mjs';

// The frame's width in its own units: a phone's 340.
export const CHART_W = 340;
const HOUR = 3_600_000;
const TOP = 26;
const PH = 150;
const BASE = TOP + PH;
export const PLOT_BOTTOM = BASE;
const r1 = v => Math.round(v * 10) / 10;

export const UV_STOPS = [[0, '#4caf50'], [3, '#f5c518'], [6, '#ff8c1a'], [8, '#e53935'], [11, '#8e24aa']];
export const AQI_STOPS = [[0, '#4caf50'], [51, '#f5c518'], [101, '#ff8c1a'], [151, '#e53935'], [201, '#8e24aa']];
export const RAIN_STOPS = [[0, '#a5d4ff'], [40, '#5aa9f5'], [70, '#2f7de1']];
// Rain's bars are as tall as the chance, coloured by how much falls (mm an
// hour; a day's total over 8): pale for a sprinkle, deep blue, violet for a
// downpour. One scale, one meaning a colour.
export const MM_STOPS = [[0, '#a9d3fb'], [0.5, '#6cb4f6'], [2.5, '#3b8cea'], [8, '#1f5fd6'], [20, '#5b3fd6']];
const mmColour = mm => colourAt(MM_STOPS, mm || 0);

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
// Every graph's frame: the plot PLOT_W wide, its scale in a gutter on the
// right (so no number sits on a line), the times under it.
const PLOT_W = CHART_W - 30;
const frameW = svg => svg.viewBox?.baseVal?.width || CHART_W;
const mix = (a, b, t) => `#${[0, 2, 4].map(k => Math.round(parseInt(a.slice(1 + k, 3 + k), 16) * (1 - t) + parseInt(b.slice(1 + k, 3 + k), 16) * t).toString(16).padStart(2, '0')).join('')}`;
// The colour at a value, blended between the stops around it.
const colourAt = (stops, v) => {
  if (v <= stops[0][0]) return stops[0][1];
  const j = stops.findIndex(([s]) => s >= v);
  if (j < 0) return stops[stops.length - 1][1];
  const [s0, c0] = stops[j - 1];
  const [s1, c1] = stops[j];
  return mix(c0, c1, (v - s0) / (s1 - s0));
};
// A line's paint: its value's colour up the plot (lo at base, hi at top),
// and a mask that fades a fill under it to nothing.
function linePaint(gid, stops, lo, hi, top, base, x2 = PLOT_W) {
  const steps = 8;
  const grad = `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${base}" y2="${top}">${Array.from({ length: steps + 1 }, (_, k) => `<stop offset="${r1((k / steps) * 100)}%" stop-color="${colourAt(stops, lo + ((hi - lo) * k) / steps)}"/>`).join('')}</linearGradient>`;
  const fade = `<linearGradient id="${gid}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity=".32"/><stop offset="80%" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="${gid}m" maskContentUnits="userSpaceOnUse"><rect x="0" y="${top - 12}" width="${x2}" height="${base - top + 12}" fill="url(#${gid}f)"/></mask>`;
  return grad + fade;
}
// A value's words at x, kept inside the plot (anchored inward at its edges).
const valText = (x, y, text, cls = 'ch-val') => {
  const anchor = x < 30 ? 'start' : x > PLOT_W - 30 ? 'end' : 'middle';
  const ax = anchor === 'start' ? Math.max(1, x - 7) : anchor === 'end' ? Math.min(PLOT_W, x + 7) : x;
  return `<text class="${cls}" x="${r1(ax)}" y="${r1(y)}" style="text-anchor:${anchor}">${e(text)}</text>`;
};
// A bar's colour: its value's level.
const levelOf = (stops, v) => [...stops].reverse().find(([s]) => v >= s)?.[1] || stops[0][1];
// A bar standing on the base, its top rounded (a short one, a flat tick).
const barPath = (x, y, w, base, r) => {
  const h = base - y;
  if (h < 3) return `M${r1(x)},${r1(base - 2)}h${r1(w)}v2h${r1(-w)}Z`;
  const rr = r1(Math.min(r, w / 2, h / 2));
  return `M${r1(x)},${base}V${r1(y + rr)}Q${r1(x)},${r1(y)} ${r1(x + rr)},${r1(y)}H${r1(x + w - rr)}Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + rr)}V${base}Z`;
};
// The scale's marks, none closer than 18 px to the one under it or the base.
const fitTicks = (ticks, yv, base, max) => {
  let last = base;
  return ticks.filter(([v]) => {
    if (v > max || last - yv(v) < 18) return false;
    last = yv(v);
    return true;
  });
};

// cols: [{ t | date, v, under (the axis text), strong, fill (a bar's own
// colour: rain's amount), place, daily, label, fc }]. `bars`: a bar a column
// (days, or rain's hours). `ticks`: [[value, words]] for the scale.
export function chart(id, cols, { max, stops, tz, label, nowIndex = -1, ticks = [], fmt = v => String(Math.round(v)), minLabel = 0, bars = false, height = PH, dates = true }) {
  // A shorter plot (the day sheet's rain and UV) when asked; no date row there.
  const ph = height;
  const base = TOP + ph;
  const chartH = base + (dates && !cols.some(c => c.daily) ? 42 : 24);
  const yv = v => r1(base - Math.max(0, Math.min(1, v / max)) * ph);
  const n = Math.max(1, cols.length);
  const w = PLOT_W / n;
  const gid = `g${++made}-${id}`;
  const xOf = i => r1((i + 0.5) * w);
  const out = [];
  for (const [v, text] of fitTicks(ticks, yv, base, max)) out.push(`<line class="ch-grid" x1="0" x2="${PLOT_W}" y1="${yv(v)}" y2="${yv(v)}"/><text class="ch-ax" x="${CHART_W}" y="${r1(yv(v) + 3.5)}">${e(text)}</text>`);
  out.push(`<line class="ch-base" x1="0" x2="${PLOT_W}" y1="${base}" y2="${base}"/>`);
  const dateOfCol = c => c.date || (c.t == null ? '' : dateOf(c.t, tz));
  // What's labelled: every bar of a few; else each day's peak and now's value, never two close together.
  const peaks = {};
  cols.forEach((c, i) => {
    const d = dateOfCol(c);
    if (c.v != null && c.v >= minLabel && (peaks[d] == null || c.v > cols[peaks[d]].v)) peaks[d] = i;
  });
  const labelled = [];
  // (Days: each change of value, so a run of 20%s says it once.)
  for (const i of bars && cols.every(c => c.daily) ? cols.map((c, i) => i).filter(i => !i || cols[i].v !== cols[i - 1].v) : [...(nowIndex >= 0 && cols[nowIndex]?.v != null ? [nowIndex] : []), ...Object.values(peaks)]) {
    if (cols[i]?.v == null || (!cols[i].daily && cols[i].v < minLabel) || labelled.some(j => Math.abs(xOf(j) - xOf(i)) < 30)) continue;
    labelled.push(i);
  }
  if (bars) {
    // Thin bars, a 2 px gap at the least; days a little wider.
    const bw = r1(Math.max(2, Math.min(cols.every(c => c.daily) ? 22 : 14, w - 2.5, w * (cols.every(c => c.daily) ? 0.56 : 0.72))));
    cols.forEach((c, i) => {
      // (An hour at 0 has no bar: nothing to draw; a day at 0 keeps a tick.)
      if (c.v == null || (!c.daily && c.v <= 0)) return;
      out.push(`<path class="ch-bar" d="${barPath(xOf(i) - bw / 2, yv(c.v), bw, base, 4)}" fill="${c.fill || levelOf(stops, c.v)}"/>`);
    });
    for (const i of labelled) out.push(valText(xOf(i), Math.max(TOP - 8, yv(cols[i].v) - 7), fmt(cols[i].v)));
  } else {
    out.push(`<defs>${linePaint(gid, stops, 0, max, TOP, base)}</defs>`);
    // Runs of known values; measured and forecast apart (both keep the joint).
    const runs = [];
    let run = null;
    cols.forEach((c, i) => {
      if (c.v == null) return void (run = null);
      if (run && run.fc !== Boolean(c.fc)) {
        run = { fc: Boolean(c.fc), pts: [run.pts[run.pts.length - 1]] };
        runs.push(run);
      } else if (!run) runs.push((run = { fc: Boolean(c.fc), pts: [] }));
      run.pts.push([xOf(i), yv(c.v)]);
    });
    for (const r of runs) {
      const line = smooth(r.pts, TOP, base);
      const a = r.pts[0];
      const z = r.pts[r.pts.length - 1];
      out.push(`<path class="ch-area${r.fc ? ' ch-fc' : ''}" d="${line}L${z[0]},${base}L${a[0]},${base}Z" fill="url(#${gid})" mask="url(#${gid}m)"/><path class="ch-line${r.fc ? ' ch-fc' : ''}" d="${line}" stroke="url(#${gid})"/>`);
    }
    for (const i of labelled) {
      const y = yv(cols[i].v);
      out.push(`<circle class="ch-pt" cx="${xOf(i)}" cy="${y}" r="4"/>${valText(xOf(i), Math.max(TOP - 8, y - 10), fmt(cols[i].v))}`);
    }
  }
  if (nowIndex >= 0 && !bars) out.push(`<line class="ch-now" x1="${xOf(nowIndex)}" x2="${xOf(nowIndex)}" y1="${TOP - 4}" y2="${base}"/>`);
  // Day changes: a line and the date under; a place's name where it changes.
  // (Axis words that would touch the one before are left out.)
  let lastUnder = -99;
  const daily = cols.some(c => c.daily);
  const firstChange = daily ? -1 : cols.findIndex((c, i) => i && dateOfCol(cols[i - 1]) !== dateOfCol(c));
  cols.forEach((c, i) => {
    const prev = cols[i - 1];
    if (dates && !daily && prev && dateOfCol(prev) !== dateOfCol(c)) out.push(`<line class="ch-day" x1="${r1(i * w)}" x2="${r1(i * w)}" y1="${TOP - 6}" y2="${base + 40}"/><text class="ch-date" x="${r1(Math.min(PLOT_W - 60, i * w + 4))}" y="${base + 36}">${e(`${shortDate(dateOfCol(c))} ${weekday(dateOfCol(c))}`)}</text>`);
    if (c.place && prev && prev.place !== c.place) out.push(`<line class="ch-move" x1="${r1(i * w)}" x2="${r1(i * w)}" y1="4" y2="${base}"/><text class="ch-place" x="${r1(Math.min(PLOT_W - 40, i * w + 3))}" y="14">${e(c.place)}</text>`);
    if (c.under && xOf(i) - lastUnder >= 30) {
      lastUnder = xOf(i);
      out.push(`<text class="ch-t${c.strong ? ' ch-strong' : ''}" x="${r1(Math.min(PLOT_W - 12, Math.max(12, xOf(i))))}" y="${base + 17}">${e(c.under)}</text>`);
    }
  });
  if (dates && !daily && cols[0] && (firstChange < 0 || firstChange * w > 78)) out.push(`<text class="ch-date" x="2" y="${base + 36}">${e(`${shortDate(dateOfCol(cols[0]))} ${weekday(dateOfCol(cols[0]))}`)}</text>`);
  return `<svg class="ch" data-graph="${id}" data-n="${n}" data-pw="${PLOT_W}" data-ys="${cols.map(c => (c.v == null ? '' : yv(c.v))).join(',')}" viewBox="0 0 ${CHART_W} ${chartH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${e(label)}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
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
  const pw = Number(svg.dataset.pw) || frameW(svg);
  return Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * (frameW(svg) / pw) * n)));
}
export function colSpot(svg, i) {
  const n = Number(svg.dataset.n);
  const y = svg.dataset.ys.split(',')[i];
  return { x: r1((i + 0.5) * ((Number(svg.dataset.pw) || frameW(svg)) / n)), y: y === '' || y == null ? null : Number(y) };
}

const hourText = (t, tz, every) => {
  const h = hourOf(t, tz);
  return h % every === 0 ? W(`${h}時`, `${h}`) : '';
};

const UV_TICKS = [[3, '3'], [6, '6'], [8, '8'], [11, '11']];

// UV: one day's daylight (6–18時), or the 10 days' peaks.
export function uvGraph(cols, { tz, now = Date.now(), daily = false } = {}) {
  if (daily) return chart('uv', cols.map(d => ({ date: d.date, v: d.uvMax, under: d.label, daily: true })), { max: 12, stops: UV_STOPS, tz, label: W('每天的紫外線最高', 'Daily UV peak'), bars: true, ticks: UV_TICKS });
  const nowIndex = cols.findIndex(h => h.t <= now && now < h.t + HOUR);
  return chart(
    'uv',
    cols.map((h, i) => ({ t: h.t, v: h.uv, place: h.place, under: i === nowIndex ? W('現在', 'Now') : hourText(h.t, tz, 3), strong: i === nowIndex })),
    { max: Math.max(11, ...cols.map(h => h.uv ?? 0)), stops: UV_STOPS, tz, label: W('逐時紫外線（白天）', 'Hourly UV (daytime)'), nowIndex, ticks: UV_TICKS, minLabel: 1 }
  );
}

// Rain: a bar an hour, its chance, the amount darker inside it (10 mm =
// 40% of the height); or the 10 days as bars. Hours that stay dry (under
// 10%, no amount) get no graph, only the words (`dryNote`).
const RAIN_TICKS = [[50, '50%'], [100, '100%']];
// The key to rain's colours: light to heavy, under one word.
export const mmKey = `<span class="l-mm">${W('雨量', 'Amount')}</span>`;
const isDry = hours => !hours.some(h => h.pop >= 10 || h.mm >= 0.1);
const dryNote = hours => {
  const top = Math.max(0, ...hours.map(h => h.pop ?? 0));
  return top ? W(`最高 ${top}%`, `peak ${top}%`) : W('不會下雨', 'no rain');
};
export function rainGraph(cols, { tz, daily = false, fromNow = true } = {}) {
  if (daily) return chart('rain', cols.map(d => ({ date: d.date, v: d.pop, under: d.label, daily: true, fill: mmColour((d.mm || 0) / 8) })), { max: 100, stops: RAIN_STOPS, tz, label: W('每天的降雨機率', 'Daily chance of rain'), bars: true, ticks: RAIN_TICKS, fmt: v => `${Math.round(v)}%` });
  if (isDry(cols)) return `<p class="wx-dry">${glyph('umbrella', { size: 18 })}${dryNote(cols)}</p>`;
  const every = cols.length > 30 ? 6 : 3;
  return chart(
    'rain',
    cols.map((h, i) => ({ t: h.t, v: h.pop, place: h.place, fill: mmColour(h.mm), under: fromNow && i === 0 ? W('現在', 'Now') : hourText(h.t, tz, every), strong: fromNow && i === 0 })),
    { max: 100, stops: RAIN_STOPS, tz, label: W('逐時降雨機率', 'Hourly chance of rain'), nowIndex: fromNow ? 0 : -1, bars: true, ticks: RAIN_TICKS, minLabel: 10, fmt: v => `${Math.round(v)}%` }
  );
}

// Air: its hours as a line coloured by the level (a day tab), or now and
// the forecast days, a bar each.
const AQI_TICKS = [[50, '50'], [100, '100'], [150, '150']];
export function airGraph(cols, { tz, daily = true, fromNow = true } = {}) {
  const max = Math.max(150, ...cols.map(c => c.aqi ?? 0));
  if (daily) return chart('air', cols.map(c => ({ ...c, v: c.aqi, under: c.label, daily: true })), { max, stops: AQI_STOPS, tz, label: W('空氣品質：現在與預報', 'Air quality: now and forecast'), bars: true, ticks: AQI_TICKS });
  const every = cols.length > 30 ? 6 : 3;
  return chart('air', cols.map((h, i) => ({ t: h.t, v: h.aqi, under: fromNow && i === 0 ? W('現在', 'Now') : hourText(h.t, tz, every), strong: fromNow && i === 0 })), { max, stops: AQI_STOPS, tz, label: W('逐時空氣品質', 'Hourly air quality'), nowIndex: fromNow ? 0 : -1, ticks: AQI_TICKS });
}


// One day (the 10 days' sheet): temperature (and feels-like, the high and
// low marked), then rain and UV under it on the same hours, in the same
// frame as every graph (`chart`). A dry day has no rain chart, its header
// says so. The crosshair over all three is the app's, shown only while a
// finger is on them.
const DAY_TOP = 20;
// Temperature's colours, cold to hot (the line and its fill).
const TEMP_STOPS = [[8, '#5ac8fa'], [16, '#4fd1c5'], [21, '#9be15d'], [25, '#ffd43b'], [29, '#ff9f0a'], [33, '#ff453a'], [37, '#d0367a']];

export function dayCharts(hours, { tz } = {}) {
  const n = hours.length;
  if (!n) return '';
  const w = PLOT_W / n;
  const x = i => r1((i + 0.5) * w);
  const id = ++made;
  const under = h => (hourOf(h.t, tz) % 3 === 0 ? W(`${hourOf(h.t, tz)}時`, `${hourOf(h.t, tz)}`) : '');

  // Temperature and feels-like on one scale, whole 2 or 5 degrees marked.
  const vals = hours.flatMap(h => [h.temp, h.feels]).filter(v => v != null);
  let lo = Math.floor(Math.min(...vals)) - 1;
  let hi = Math.ceil(Math.max(...vals)) + 1;
  if (hi - lo < 8) [lo, hi] = [Math.floor((hi + lo) / 2 - 4), Math.ceil((hi + lo) / 2 + 4)];
  const ph = 136;
  const base = DAY_TOP + ph;
  const y = v => r1(base - ((v - lo) / (hi - lo)) * ph);
  const gid = `dt${id}`;
  const out = [`<defs>${linePaint(gid, TEMP_STOPS, lo, hi, DAY_TOP, base)}</defs>`];
  const stepT = hi - lo > 14 ? 5 : 2;
  for (let v = Math.ceil(lo / stepT) * stepT; v < hi; v += stepT) out.push(`<line class="ch-grid" x1="0" x2="${PLOT_W}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-ax" x="${CHART_W}" y="${r1(y(v) + 3.5)}">${v}°</text>`);
  out.push(`<line class="ch-base" x1="0" x2="${PLOT_W}" y1="${base}" y2="${base}"/>`);
  const pts = key => hours.map((h, i) => (h[key] == null ? null : [x(i), y(h[key])])).filter(Boolean);
  const tp = pts('temp');
  const tl = smooth(tp, DAY_TOP - 12, base);
  if (tp.length > 1) out.push(`<path d="${tl}L${tp[tp.length - 1][0]},${base}L${tp[0][0]},${base}Z" fill="url(#${gid})" mask="url(#${gid}m)"/>`);
  out.push(`<path class="ch-fline" d="${smooth(pts('feels'), DAY_TOP - 12, base)}"/><path class="ch-tline" d="${tl}" stroke="url(#${gid})"/>`);
  // The high and low: a dot, the words just above (the high) or under (the
  // low), the other way when there's no room; a halo where they cross a line.
  const iHi = hours.reduce((a, h, i) => (h.temp != null && (a < 0 || h.temp > hours[a].temp) ? i : a), -1);
  const iLo = hours.reduce((a, h, i) => (h.temp != null && (a < 0 || h.temp < hours[a].temp) ? i : a), -1);
  for (const [i, above, word] of [[iHi, true, W('最高', 'H')], [iLo, false, W('最低', 'L')]]) {
    if (i < 0 || (!above && i === iHi)) continue;
    const yd = y(hours[i].temp);
    const up = above ? yd - 11 >= 12 : yd + 21 > base - 2;
    out.push(`<circle class="ch-hl" cx="${x(i)}" cy="${yd}" r="4.5"/>${valText(x(i), up ? yd - 11 : yd + 21, `${word} ${Math.round(hours[i].temp)}°`, 'ch-val ch-big')}`);
  }
  let last = -99;
  hours.forEach((h, i) => {
    const t = under(h);
    if (!t || x(i) - last < 30) return;
    last = x(i);
    out.push(`<text class="ch-t" x="${r1(Math.min(PLOT_W - 12, Math.max(12, x(i))))}" y="${base + 17}">${t}</text>`);
  });
  const temp = `<svg class="ch ch-daytemp" data-graph="day" data-n="${n}" data-pw="${PLOT_W}" data-ys="${hours.map(h => (h.temp == null ? '' : y(h.temp))).join(',')}" viewBox="0 0 ${CHART_W} ${base + 24}" role="img" aria-label="${W('這一天的溫度與體感', 'Temperature and feels-like this day')}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;

  const dry = isDry(hours);
  const wet = hours.some(h => h.mm >= 0.1);
  const rain = dry ? '' : chart('day-rain', hours.map(h => ({ t: h.t, v: h.pop, fill: mmColour(h.mm), under: under(h) })), { max: 100, stops: RAIN_STOPS, tz, label: W('這一天的降雨機率', 'Chance of rain this day'), bars: true, ticks: RAIN_TICKS, minLabel: 10, fmt: v => `${Math.round(v)}%`, height: 70, dates: false });
  const uv = hours.some(h => h.uv > 0) ? chart('day-uv', hours.map(h => ({ t: h.t, v: h.uv, under: under(h) })), { max: Math.max(11, ...hours.map(h => h.uv ?? 0)), stops: UV_STOPS, tz, label: W('這一天的紫外線', 'UV this day'), ticks: UV_TICKS, minLabel: 1, height: 56, dates: false }) : '';
  const rainNote = dry ? `<span class="wx-dch-note">${dryNote(hours)}</span>` : wet ? mmKey : '';
  return `<div class="wx-dch"><p class="wx-dch-h">${glyph('thermo', { size: 16 })}${W('溫度', 'Temperature')}<span class="l-feels">${W('體感', 'Feels')}</span></p>${temp}</div>
    <div class="wx-dch${dry ? ' is-dry' : ''}"><p class="wx-dch-h">${glyph('umbrella', { size: 16 })}${W('降雨機率', 'Chance of rain')} ${rainNote}</p>${rain}</div>
    ${uv ? `<div class="wx-dch"><p class="wx-dch-h">${glyph('sun', { size: 16 })}${W('紫外線', 'UV')}</p>${uv}</div>` : ''}
    <i class="ch-xh" hidden></i><i class="ch-dh" hidden></i>`;
}

// What the crosshair reads at one hour of the day sheet: the time, then
// every number for it.
export function scrubHtml(h, { tz, aqi = null } = {}) {
  if (!h) return '';
  const cell = (k, v, sub = '') => `<div><span>${k}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const deg = v => (v == null ? '–' : `${Math.round(v)}°`);
  const w = h.wind || {};
  return `<div class="wx-scrub-time"><b>${clock(h.t, tz)}</b><span>${h.place ? `${e(h.place)} · ` : ''}${e(conditionText(h.condition?.code, h.condition?.text))}</span></div>
    <div class="wx-scrub-vals">
      ${cell(W('溫度', 'Temp'), deg(h.temp), `${W('體感', 'Feels')} ${deg(h.feels)}`)}
      ${cell(W('降雨', 'Rain'), h.pop == null ? '–' : `${h.pop}%`, h.mm >= 0.1 ? `${h.mm} mm` : '')}
      ${cell(W('紫外線', 'UV'), h.uv ?? '–', h.uv >= 3 ? W('要防曬', 'cover up') : '')}
      ${aqi ? cell(W('空氣', 'Air'), String(aqi.aqi), aqi.pm25 != null ? `PM2.5 ${aqi.pm25}` : '') : cell(W('濕度', 'Humidity'), h.humidity == null ? '–' : `${h.humidity}%`, w.speed != null ? `${W('風', 'Wind')} ${Math.round(w.speed)} km/h` : '')}
    </div>`;
}

// The read-out for a picked column: "10/3 週六 13:00 · 學校 · …", or a day's.
export function readout(kind, col, tz) {
  if (!col) return '';
  const when = col.t == null ? `${col.label}${col.date ? ` ${shortDate(col.date)}` : ''}` : `${weekday(dateOf(col.t, tz))} ${clock(col.t, tz)}${col.place ? ` · ${col.place}` : ''}`;
  if (kind === 'uv') return `${when} · UV ${(col.t == null ? col.uvMax : col.uv) ?? '–'}`;
  if (kind === 'rain') return `${when} · ${col.pop == null ? '–' : `${col.pop}%`}${col.mm >= 0.1 ? ` · ${col.t == null ? '~' : ''}${col.mm} mm` : ''}`;
  if (kind === 'air') return `${when} · AQI ${col.aqi ?? '–'}${col.aqi != null ? ` ${aqiName(col.aqi)}` : ''}`;
  return when;
}
