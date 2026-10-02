// The cards' graphs: one column per step (an hour, or a forecast day), as
// far ahead as the data goes, swiped sideways; under them the time, and the
// date at the first column and each midnight. Every column is a tap target
// (`data-g` the graph, `data-i` the column) for the card's read-out.

import { clock, hourOf, dateOf, shortDate, weekday, uvColor, aqiColor, rainColor, escapeHtml as e } from './format.mjs';

export const COL = 26;
const AXIS = 34;
const r1 = v => Math.round(v * 10) / 10;

// The time row and the date row under the columns. `every`: an hour label
// every this many columns (dates always at midnight).
export function axis(cols, { tz, colW = COL, y, every = 3, daily = false }) {
  const out = [];
  cols.forEach((c, i) => {
    const x = i * colW + colW / 2;
    if (daily) {
      out.push(`<text class="g-time" x="${x}" y="${y + 12}">${e(c.label || shortDate(c.date))}</text>`);
      return;
    }
    const h = hourOf(c.t, tz);
    if (i % every === 0 || h === 0) out.push(`<text class="g-time${h === 0 ? ' g-mid' : ''}" x="${x}" y="${y + 12}">${h === 0 ? '0時' : `${h}時`}</text>`);
    if (i === 0 || h === 0) {
      const d = dateOf(c.t, tz);
      out.push(`<text class="g-date" x="${i * colW + 2}" y="${y + 28}">${shortDate(d)} ${weekday(d)}</text>`);
      if (i > 0) out.push(`<line class="g-day" x1="${i * colW}" x2="${i * colW}" y1="0" y2="${y + 30}"/>`);
    } else if (h === 12 && i >= 4) {
      // Noon too, so a graph swiped to the middle of a day still says which.
      const d = dateOf(c.t, tz);
      out.push(`<text class="g-date g-noon" x="${i * colW + colW / 2}" y="${y + 28}">${shortDate(d)} ${weekday(d)}</text>`);
    }
  });
  return out.join('');
}

const frame = (id, width, height, body, label) =>
  `<svg class="graph" data-graph="${id}" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${e(label)}">${body}<rect class="g-sel" x="-100" y="0" width="0" height="${height}" rx="6"/></svg>`;
const hits = (id, n, colW, height) => Array.from({ length: n }, (_, i) => `<rect class="g-hit" data-g="${id}" data-i="${i}" x="${i * colW}" y="0" width="${colW}" height="${height}"/>`).join('');
const nowLine = (cols, now, colW, top, bottom) => {
  if (!cols.length || cols[0].t == null) return '';
  const x = ((now - cols[0].t) / 3_600_000) * colW;
  return x >= 0 && x <= cols.length * colW ? `<line class="g-now" x1="${r1(x)}" x2="${r1(x)}" y1="${top}" y2="${bottom}"/>` : '';
};

// Bars from the bottom: value / max of the plot's height, coloured and
// labelled by the caller.
function bars(cols, { colW, top, bottom, max, value, color, label, pad = 5 }) {
  const out = [];
  cols.forEach((c, i) => {
    const v = value(c);
    if (v == null) return;
    const h = Math.max(v > 0 ? 2 : 0, ((bottom - top) * Math.min(v, max)) / max);
    if (h) out.push(`<rect class="g-bar" x="${i * colW + pad}" y="${r1(bottom - h)}" width="${colW - pad * 2}" height="${r1(h)}" rx="4" fill="${color(v, c)}"/>`);
    const t = label?.(v, c, i);
    if (t) out.push(`<text class="g-val" x="${i * colW + colW / 2}" y="${r1(bottom - h - 4)}">${e(t)}</text>`);
  });
  return out.join('');
}

// UV, hourly: bars coloured by level, the value on each hour above 0.
export function uvGraph(hours, { tz, now = Date.now(), colW = COL } = {}) {
  const top = 18;
  const bottom = 120;
  const max = Math.max(11, ...hours.map(h => h.uv ?? 0));
  const width = hours.length * colW;
  const height = bottom + AXIS;
  const body = [
    bars(hours, { colW, top, bottom, max, value: h => h.uv, color: v => uvColor(v), label: v => (v >= 1 ? String(Math.round(v)) : '') }),
    `<line class="g-base" x1="0" x2="${width}" y1="${bottom}" y2="${bottom}"/>`,
    nowLine(hours, now, colW, 0, bottom),
    axis(hours, { tz, colW, y: bottom })
  ].join('');
  return frame('uv', width, height, body + hits('uv', hours.length, colW, height), '逐時紫外線');
}

// Rain, hourly: probability as bars (0–100), the amount under it when any.
export function rainGraph(hours, { tz, now = Date.now(), colW = COL } = {}) {
  const top = 18;
  const bottom = 120;
  const width = hours.length * colW;
  const height = bottom + AXIS;
  const mm = hours
    .map((h, i) => (h.mm >= 0.1 ? `<text class="g-mm" x="${i * colW + colW / 2}" y="${bottom - 4}">${h.mm >= 10 ? Math.round(h.mm) : r1(h.mm)}</text>` : ''))
    .join('');
  const body = [
    `<line class="g-grid" x1="0" x2="${width}" y1="${top + (bottom - top) / 2}" y2="${top + (bottom - top) / 2}"/>`,
    bars(hours, { colW, top, bottom, max: 100, value: h => h.pop, color: v => rainColor(v), label: v => (v >= 20 ? `${Math.round(v)}` : '') }),
    mm,
    `<line class="g-base" x1="0" x2="${width}" y1="${bottom}" y2="${bottom}"/>`,
    nowLine(hours, now, colW, 0, bottom),
    axis(hours, { tz, colW, y: bottom })
  ].join('');
  return frame('rain', width, height, body + hits('rain', hours.length, colW, height), '逐時降雨機率');
}

// Air: the last hours measured (hourly bars), then the coming days'
// forecast (a wider column each). `cols`: [{ t, aqi }…] then [{ date,
// label, aqi, forecast: true }…].
export function airGraph(cols, { tz, now = Date.now(), colW = COL } = {}) {
  const top = 18;
  const bottom = 120;
  const max = Math.max(150, ...cols.map(c => c.aqi ?? 0));
  const wide = colW * 2.2;
  const xs = [];
  let x = 0;
  for (const c of cols) {
    xs.push(x);
    x += c.forecast ? wide : colW;
  }
  const width = x;
  const height = bottom + AXIS;
  const out = [];
  const firstForecast = cols.findIndex(c => c.forecast);
  cols.forEach((c, i) => {
    const w = c.forecast ? wide : colW;
    if (c.aqi == null) return;
    const h = Math.max(2, ((bottom - top) * Math.min(c.aqi, max)) / max);
    out.push(`<rect class="g-bar${c.forecast ? ' g-fc' : ''}" x="${r1(xs[i] + 4)}" y="${r1(bottom - h)}" width="${r1(w - 8)}" height="${r1(h)}" rx="4" fill="${aqiColor(c.aqi)}"/>`);
    if (c.forecast || i % 3 === 0 || i === firstForecast - 1) out.push(`<text class="g-val" x="${r1(xs[i] + w / 2)}" y="${r1(bottom - h - 4)}">${c.aqi}</text>`);
    // Labels under: hours as in the others, the forecast days by name.
    if (c.forecast) out.push(`<text class="g-time" x="${r1(xs[i] + w / 2)}" y="${bottom + 12}">${e(c.label)}</text><text class="g-time" x="${r1(xs[i] + w / 2)}" y="${bottom + 28}">${shortDate(c.date)}</text>`);
    else {
      const hr = hourOf(c.t, tz);
      if (i % 3 === 0 || hr === 0) out.push(`<text class="g-time${hr === 0 ? ' g-mid' : ''}" x="${r1(xs[i] + w / 2)}" y="${bottom + 12}">${hr}時</text>`);
      // The date where there's room for it before the forecast.
      const room = (firstForecast < 0 ? cols.length : firstForecast) - i >= 3;
      if ((i === 0 || hr === 0) && room) {
        const d = dateOf(c.t, tz);
        out.push(`<text class="g-date" x="${r1(xs[i] + 2)}" y="${bottom + 28}">${shortDate(d)} ${weekday(d)}</text>`);
      }
    }
  });
  if (firstForecast >= 0) out.push(`<text class="g-date" x="${r1(xs[firstForecast] + 4)}" y="12">預測 →</text>`);
  if (firstForecast > 0) out.push(`<line class="g-day" x1="${xs[firstForecast]}" x2="${xs[firstForecast]}" y1="0" y2="${bottom + 30}"/>`);
  const hitRects = cols.map((c, i) => `<rect class="g-hit" data-g="air" data-i="${i}" x="${r1(xs[i])}" y="0" width="${r1(c.forecast ? wide : colW)}" height="${height}"/>`).join('');
  const body = out.join('') + `<line class="g-base" x1="0" x2="${width}" y1="${bottom}" y2="${bottom}"/>`;
  return frame('air', r1(width), height, body + hitRects, '空氣品質：過去測值與預測');
}

// One day, everything over each other (the day list's sheet): temperature
// and feels-like lines, UV as a coloured band, rain bars, AQI dots where
// measured. Fitted to the width (24 columns).
export function dayGraph(hours, { tz, aqi = [], colW = 15 } = {}) {
  const n = hours.length;
  if (!n) return '';
  const width = n * colW;
  const tTop = 26;
  const tBottom = 118;
  const uvY = 128;
  const rTop = 142;
  const rBottom = 196;
  const height = rBottom + AXIS;
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
    if (h.temp != null && i % 3 === 0) out.push(`<text class="g-val" x="${cx(i)}" y="${r1(y(h.temp) - 7)}">${Math.round(h.temp)}°</text>`);
    if (h.uv > 0) out.push(`<rect x="${i * colW + 1}" y="${uvY}" width="${colW - 2}" height="7" rx="2" fill="${uvColor(h.uv)}"/>`);
  });
  // Rain labels every 3 hours, and at the day's wettest hour.
  const wettest = Math.max(...hours.map(h => h.pop ?? 0));
  out.push(bars(hours, { colW, top: rTop, bottom: rBottom, max: 100, value: h => h.pop, color: v => rainColor(v), label: (v, c, i) => (v >= 20 && (i % 3 === 0 || v === wettest) ? `${Math.round(v)}` : ''), pad: 2 }));
  // AQI measured that day, at its hour.
  const t0 = hours[0].t;
  for (const a of aqi) {
    const i = Math.floor((a.t - t0) / 3_600_000);
    if (i >= 0 && i < n && a.aqi != null) out.push(`<circle cx="${cx(i)}" cy="${tTop - 14}" r="4" fill="${aqiColor(a.aqi)}"/>`);
  }
  out.push(`<line class="g-base" x1="0" x2="${width}" y1="${rBottom}" y2="${rBottom}"/>`);
  hours.forEach((h, i) => {
    const hr = hourOf(h.t, tz);
    if (hr % 3 === 0) out.push(`<text class="g-time" x="${cx(i)}" y="${rBottom + 14}">${hr}時</text>`);
  });
  return `<svg class="graph day-graph" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="這一天的溫度、紫外線、降雨與空氣">${out.join('')}</svg>`;
}

// The read-out for a tapped column: "10/3 週六 13:00 · …".
export function readout(kind, col, tz) {
  if (!col) return '';
  const when = col.forecast ? `${col.label}（預測）` : `${shortDate(dateOf(col.t, tz))} ${weekday(dateOf(col.t, tz))} ${clock(col.t, tz)}`;
  if (kind === 'uv') return `${when} · 紫外線 ${col.uv ?? '–'}`;
  if (kind === 'rain') return `${when} · 降雨機率 ${col.pop ?? '–'}%${col.mm >= 0.1 ? ` · ${col.mm} mm` : ''}`;
  if (kind === 'air') return `${when} · AQI ${col.aqi ?? '–'}${col.pm25 != null ? ` · PM2.5 ${col.pm25}` : ''}`;
  return when;
}
