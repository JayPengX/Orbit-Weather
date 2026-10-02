// The cards' graphs: one column per hour (or forecast day), as far ahead as
// the data goes, swiped sideways. Plain elements, not one long picture: a
// phone's browser draws a 6,000-pixel-wide SVG in tiles and drops some while
// scrolling (the "empty hours"); a row of small boxes it always draws.
//
// Under the bars the hour, and at each day's first column its date; each day
// on its own shade. Every column is a tap target (`data-g` the graph,
// `data-i` the column) for the card's read-out, and carries its date
// (`data-d`) for the date chip that follows the swipe.

import { clock, hourOf, dateOf, shortDate, weekday, uvColor, aqiColor, rainColor, escapeHtml as e } from './format.mjs';

export const COL = 30;
const HOUR = 3_600_000;
const r1 = v => Math.round(v * 10) / 10;

// cols: [{ t | date, v, color, text (above the bar), under (the time row),
// strong, fc (a forecast: lighter), inner (a darker part, 0–1 of the bar) }].
export function timeline(id, cols, { max, tz, label, nowIndex = -1 }) {
  let dayN = -1;
  let last = null;
  const html = cols.map((c, i) => {
    const date = c.date || dateOf(c.t, tz);
    const start = date !== last;
    if (start) dayN++;
    last = date;
    const v = c.v;
    const h = v == null ? 0 : Math.max(v > 0 ? 3 : 0, Math.min(100, (v / max) * 100));
    const bar = v == null ? '<i class="tl-none">–</i>' : v <= 0 ? '<i class="tl-zero"></i>' : `<i class="tl-bar${c.fc ? ' tl-fc' : ''}" style="height:${r1(h)}%;background:${c.color}">${c.inner ? `<i class="tl-inner" style="height:${r1(Math.min(1, c.inner) * 100)}%"></i>` : ''}</i>`;
    const text = c.text ? `<span class="tl-val" style="bottom:${r1(h)}%">${e(c.text)}</span>` : '';
    const dayTag = start ? `<em class="tl-date">${e(c.dayText || `${shortDate(date)} ${weekday(date)}`)}</em>` : '';
    const cls = ['tl-col', c.daily ? 'tl-wide' : '', dayN % 2 ? 'tl-odd' : '', start && i ? 'tl-start' : '', i === nowIndex ? 'tl-now' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-g="${id}" data-i="${i}" data-d="${date}"><span class="tl-plot">${text}${bar}</span><b class="tl-t${c.strong ? ' tl-strong' : ''}">${e(c.under || '')}</b>${dayTag}</button>`;
  });
  return `<div class="tl" data-graph="${id}" role="img" aria-label="${e(label)}">${html.join('')}</div>`;
}

// An hour's label: every 3 hours by the clock ("6時"); midnight is the
// date's place, so none.
const hourText = (t, tz) => {
  const h = hourOf(t, tz);
  return h % 3 === 0 && h !== 0 ? `${h}時` : '';
};

// Value labels where they help: each day's highest (when it counts) and
// every 3 hours, never two side by side.
function sparseLabels(cols, { tz, min, fmt }) {
  const peak = {};
  cols.forEach((c, i) => {
    const d = dateOf(c.t, tz);
    if (c.v != null && c.v >= min && (peak[d] == null || c.v > cols[peak[d]].v)) peak[d] = i;
  });
  const peaks = new Set(Object.values(peak));
  let lastAt = -9;
  cols.forEach((c, i) => {
    const want = c.v != null && c.v >= min && (peaks.has(i) || hourOf(c.t, tz) % 3 === 0);
    if (!want) return;
    if (i - lastAt === 1) {
      if (!peaks.has(i)) return;
      cols[lastAt].text = '';
    }
    c.text = fmt(c.v);
    lastAt = i;
  });
  return cols;
}

// UV: the daylight hours only (6–18 時), a day's block after another.
export function uvCols(hours, tz) {
  return hours.filter(h => {
    const hr = hourOf(h.t, tz);
    return hr >= 6 && hr <= 18;
  });
}
export function uvGraph(hours, { tz, now = Date.now() } = {}) {
  const list = uvCols(hours, tz);
  const nowIndex = list.findIndex(h => h.t <= now && now < h.t + HOUR);
  const cols = sparseLabels(
    list.map((h, i) => ({ t: h.t, v: h.uv, color: uvColor(h.uv), under: i === nowIndex ? '現在' : hourOf(h.t, tz) % 2 ? '' : `${hourOf(h.t, tz)}時`, strong: i === nowIndex })),
    { tz, min: 1, fmt: v => String(Math.round(v)) }
  );
  const max = Math.max(11, ...list.map(h => h.uv ?? 0));
  return timeline('uv', cols, { max, tz, label: '逐時紫外線（白天）', nowIndex });
}

// Rain: probability as the bar (0–100), the amount as its darker part
// (10 mm fills the graph's height; never taller than the bar).
// `hours` may end with whole days (`daily`: past the hourly forecast), a
// wider column each.
export function rainGraph(hours, { tz } = {}) {
  const hourly = hours.filter(h => !h.daily);
  const cols = sparseLabels(
    hourly.map((h, i) => ({ t: h.t, v: h.pop, color: rainColor(h.pop), inner: h.mm >= 0.1 && h.pop > 0 ? Math.min(1, h.mm / 10 / (h.pop / 100)) : 0, under: i === 0 ? '現在' : hourText(h.t, tz), strong: i === 0 })),
    { tz, min: 20, fmt: v => `${Math.round(v)}` }
  );
  for (const d of hours.filter(h => h.daily)) cols.push({ date: d.date, daily: true, fc: true, v: d.pop, color: rainColor(d.pop), text: d.pop != null ? `${d.pop}` : '', under: d.label, dayText: shortDate(d.date) });
  return timeline('rain', cols, { max: 100, tz, label: '降雨機率：逐時，之後逐日', nowIndex: 0 });
}

// Air: the hours measured, then the hours forecast (lighter), on one
// clock; without hourly forecasts, the days' forecasts after the measured
// hours, a column each.
export function airGraph(cols, { tz } = {}) {
  const first = cols.findIndex(c => c.fc);
  const nowIndex = first > 0 ? first - 1 : first < 0 ? cols.length - 1 : 0;
  const out = cols.map((c, i) => ({
    ...c,
    v: c.aqi,
    color: aqiColor(c.aqi),
    under: c.daily ? c.label : i === nowIndex ? '現在' : hourText(c.t, tz),
    strong: i === nowIndex,
    dayText: c.daily ? shortDate(c.date) : undefined
  }));
  sparseLabels(
    out.filter(c => !c.daily),
    { tz, min: 0, fmt: v => String(Math.round(v)) }
  );
  for (const c of out) if (c.daily && c.v != null) c.text = String(Math.round(c.v));
  if (out[nowIndex]?.v != null) out[nowIndex].text = String(Math.round(out[nowIndex].v));
  const max = Math.max(150, ...cols.map(c => c.aqi ?? 0));
  return timeline('air', out, { max, tz, label: '空氣品質：測到的與預測的', nowIndex });
}

// One day, everything over each other (the day list's sheet): temperature
// and feels-like lines, UV as a coloured band, rain bars, AQI dots where
// measured. Fitted to the width (24 columns): small, so one SVG is fine.
export function dayGraph(hours, { tz, aqi = [], colW = 15 } = {}) {
  const n = hours.length;
  if (!n) return '';
  const width = n * colW;
  const tTop = 26;
  const tBottom = 112;
  const uvY = 124;
  const rTop = 140;
  const rBottom = 190;
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
  return `<div class="wx-scrub-time"><b>${clock(h.t, tz)}</b><span>${e(h.condition?.text || '')}</span></div>
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
  const when = col.daily ? `${shortDate(col.date)} ${col.label}（預測）` : `${shortDate(dateOf(col.t, tz))} ${weekday(dateOf(col.t, tz))} ${clock(col.t, tz)}${col.fc ? '（預測）' : ''}`;
  if (kind === 'uv') return `${when} · 紫外線 ${col.uv ?? '–'}`;
  if (kind === 'rain') return `${when} · 降雨機率 ${col.pop ?? '–'}%${col.mm >= 0.1 ? ` · 雨量 ${col.mm} mm` : ''}`;
  if (kind === 'air') return `${when} · AQI ${col.aqi ?? '–'}${col.pm25 != null ? ` · PM2.5 ${col.pm25}` : ''}`;
  return when;
}
