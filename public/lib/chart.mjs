// The curve (plan E2 #2): the hours side by side, temperature and
// feels-like lines, UV as a coloured band, rain probability as bars, night
// shaded, now marked. One SVG string; each hour has a tap target
// (`data-i`).

import { uvColor, rainColor, hourOf, conditionIcon, escapeHtml } from './format.mjs';

export const COL = 36;
export const HEIGHT = 236;
const HOUR = 3_600_000;
// Rows (y): icons, the temperature area, UV, rain, hour labels.
const ROW = { icon: 16, tTop: 44, tBottom: 132, uv: 146, uvH: 8, rainTop: 166, rainBottom: 212, label: 230 };

// The temperature scale: the hours' range, padded, never under 6°.
export function tempScale(hours) {
  const vals = hours.flatMap(h => [h.temp, h.feels]).filter(v => v != null);
  if (!vals.length) return { lo: 0, hi: 1 };
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 6) {
    const mid = (hi + lo) / 2;
    lo = mid - 3;
    hi = mid + 3;
  }
  return { lo: Math.floor(lo - 1), hi: Math.ceil(hi + 1) };
}

const r1 = v => Math.round(v * 10) / 10;

// A smooth line through the points that have a value (gaps break it).
export function linePath(points) {
  let d = '';
  let prev = null;
  for (const p of points) {
    if (p.y == null) {
      prev = null;
      continue;
    }
    if (!prev) d += `M${r1(p.x)},${r1(p.y)}`;
    else {
      const mx = (prev.x + p.x) / 2;
      d += `C${r1(mx)},${r1(prev.y)} ${r1(mx)},${r1(p.y)} ${r1(p.x)},${r1(p.y)}`;
    }
    prev = p;
  }
  return d;
}

export function curveSvg(hours, { now = Date.now(), tz, isNight = h => h.day === false, selected = -1 } = {}) {
  const n = hours.length;
  const width = n * COL;
  if (!n) return { svg: '', width: 0 };
  const { lo, hi } = tempScale(hours);
  const y = v => (v == null ? null : ROW.tBottom - ((v - lo) / (hi - lo)) * (ROW.tBottom - ROW.tTop));
  const cx = i => i * COL + COL / 2;
  const out = [];
  out.push(`<svg class="curve" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="逐時溫度、紫外線與降雨機率">`);

  // Night.
  hours.forEach((h, i) => {
    if (isNight(h)) out.push(`<rect class="night" x="${i * COL}" y="0" width="${COL}" height="${ROW.rainBottom}"/>`);
  });
  // A line at each midnight, with the date.
  hours.forEach((h, i) => {
    if (i > 0 && hourOf(h.t, tz) === 0) out.push(`<line class="midnight" x1="${i * COL}" x2="${i * COL}" y1="0" y2="${HEIGHT}"/>`);
  });

  // Icons every 2 hours.
  hours.forEach((h, i) => {
    if (i % 2 === 0) out.push(`<text class="icon" x="${cx(i)}" y="${ROW.icon}">${conditionIcon(h.condition?.code, h.condition?.text, !isNight(h))}</text>`);
  });

  // Temperature and feels-like.
  const feels = linePath(hours.map((h, i) => ({ x: cx(i), y: y(h.feels) })));
  const temp = linePath(hours.map((h, i) => ({ x: cx(i), y: y(h.temp) })));
  if (feels) out.push(`<path class="feels" d="${feels}"/>`);
  if (temp) out.push(`<path class="temp" d="${temp}"/>`);
  hours.forEach((h, i) => {
    if (h.temp == null) return;
    if (i % 2 === 0) out.push(`<text class="tlabel" x="${cx(i)}" y="${r1(y(h.temp) - 8)}">${Math.round(h.temp)}°</text>`);
    out.push(`<circle class="dot" cx="${cx(i)}" cy="${r1(y(h.temp))}" r="${i === selected ? 4 : 2}"/>`);
  });

  // UV.
  hours.forEach((h, i) => {
    if (h.uv != null && h.uv > 0) out.push(`<rect class="uv" x="${i * COL + 1}" y="${ROW.uv}" width="${COL - 2}" height="${ROW.uvH}" rx="3" fill="${uvColor(h.uv)}"/>`);
  });

  // Rain.
  hours.forEach((h, i) => {
    const pop = h.pop ?? 0;
    const bh = Math.max(pop > 0 ? 2 : 0, ((ROW.rainBottom - ROW.rainTop) * pop) / 100);
    if (bh) out.push(`<rect class="rain" x="${i * COL + 6}" y="${r1(ROW.rainBottom - bh)}" width="${COL - 12}" height="${r1(bh)}" rx="3" fill="${rainColor(pop)}"/>`);
    if (pop >= 20) out.push(`<text class="plabel" x="${cx(i)}" y="${r1(ROW.rainBottom - bh - 3)}">${Math.round(pop)}%</text>`);
  });

  // Hours.
  hours.forEach((h, i) => {
    const hr = hourOf(h.t, tz);
    const label = i === 0 && now >= h.t && now < h.t + HOUR ? '現在' : `${hr}時`;
    out.push(`<text class="hlabel${hr === 0 ? ' day0' : ''}" x="${cx(i)}" y="${ROW.label}">${escapeHtml(label)}</text>`);
  });

  // Now.
  const at = (now - hours[0].t) / HOUR;
  if (at >= 0 && at <= n) out.push(`<line class="now" x1="${r1(at * COL)}" x2="${r1(at * COL)}" y1="${ROW.tTop - 14}" y2="${ROW.rainBottom}"/>`);

  if (selected >= 0 && selected < n) out.push(`<rect class="sel" x="${selected * COL}" y="0" width="${COL}" height="${HEIGHT}" rx="8"/>`);
  // Tap targets, on top.
  hours.forEach((h, i) => out.push(`<rect class="hit" data-i="${i}" x="${i * COL}" y="0" width="${COL}" height="${HEIGHT}"/>`));
  out.push('</svg>');
  return { svg: out.join(''), width };
}
