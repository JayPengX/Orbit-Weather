// The app's own pictures, instead of emoji: a drawing for each kind of
// weather (64×64) and line glyphs (24×24, drawn in the text's colour) for
// everything else.

import { conditionKind } from './format.mjs';

// ---- The weather pictures --------------------------------------------------------------------
// Orbit's own drawings (Jay 2026-11-03: the glossy ones read as emoji): flat,
// no gradient, no shadow, no shine. A cloud is a line in the text's colour
// over a faint fill of it; the sun is a lit disc ringed by dots (the app's
// mark: a lit dot on a thin line); the moon a flat crescent; rain is lines,
// drizzle dots. Colours come from weather.css (`--wxi-*`, light and dark),
// so a picture sits on the sky, a graphite card or a white one alike.

// The cut-outs, once per page (app.mjs puts them in the body): a cloud in
// front hides what's behind it without painting over the card.
const CLOUD = 'M19.5 48A8 8 0 0 1 19 32A11.5 11.5 0 0 1 41.8 29.2A9.5 9.5 0 1 1 43.5 48Z';
const CRESCENT = 'M31.4 17A15 15 0 1 0 46.4 36.3A12.5 12.5 0 0 1 31.4 17Z';
// Where the cloud sits in each layout.
const AT = {
  low: 'translate(8 8) scale(.9)', // in front, low (partly cloudy)
  high: 'translate(4 -6) scale(.94)', // raised, something falls below it
  back: 'translate(22 -3) scale(.6)' // the second cloud behind (overcast)
};
const cut = (id, t) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><path d="${CLOUD}" transform="${t}" fill="#000" stroke="#000" stroke-width="9" stroke-linejoin="round"/></mask>`;
export const ICON_DEFS = `<svg class="wx-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">
<defs>${cut('wxi-cut-low', AT.low)}${cut('wxi-cut-high', AT.high)}</defs>
</svg>`;

const cloud = (at, cls = 'wxi-c') => `<path class="${cls}" d="${CLOUD}" transform="${AT[at]}"/>`;
// The sun: a lit disc and its ring of dots.
function sun(cx, cy, r, { dots = 8, gap = 6.5, dot = 2.3 } = {}) {
  let ring = '';
  for (let i = 0; i < dots; i++) {
    const a = (i * 2 * Math.PI) / dots - Math.PI / 2;
    const x = Math.round((cx + Math.cos(a) * (r + gap)) * 10) / 10;
    const y = Math.round((cy + Math.sin(a) * (r + gap)) * 10) / 10;
    ring += `<circle cx="${x}" cy="${y}" r="${dot}"/>`;
  }
  return `<g class="wxi-sun"><circle cx="${cx}" cy="${cy}" r="${r}"/>${ring}</g>`;
}
const moon = (t = '') => `<path class="wxi-moon" d="${CRESCENT}"${t ? ` transform="${t}"` : ''}/>`;
const stars = pts => `<g class="wxi-star">${pts.map(([x, y, r = 1.6]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
const behind = (id, body) => `<g mask="url(#${id})">${body}</g>`;
// What falls from a raised cloud: rain as lines, drizzle as dots, snow as flakes.
const RAIN_X = [24, 34, 44];
const rainLines = xs => `<path class="wxi-rain" d="${xs.map(x => `M${x + 1.5} 47.5l-3 8.5`).join('')}"/>`;
const drizzle = xs => `<g class="wxi-drop">${xs.map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 54 : 50}" r="2.4"/>`).join('')}</g>`;
const flake = (x, y) => `M${x} ${y - 4}v8M${x - 3.5} ${y - 2}l7 4M${x - 3.5} ${y + 2}l7-4`;

const ART = {
  'clear-day': () => sun(32, 32, 11),
  'clear-night': () => `${moon('translate(-1 1)')}${stars([[48, 17, 2], [53, 27, 1.4]])}`,
  'part-day': () => `${behind('wxi-cut-low', sun(24, 24, 8.5, { gap: 5.5, dot: 2 }))}${cloud('low')}`,
  'part-night': () => `${behind('wxi-cut-low', `${moon('translate(-1 -3) scale(.8)')}`)}${stars([[47, 13, 1.6]])}${cloud('low')}`,
  cloud: () => `${behind('wxi-cut-low', cloud('back', 'wxi-c wxi-c2'))}${cloud('low')}`,
  'drizzle-day': () => `${behind('wxi-cut-high', sun(14.5, 14.5, 6, { gap: 4.5, dot: 1.7 }))}${cloud('high')}${drizzle([23, 34, 45])}`,
  'drizzle-night': () => `${behind('wxi-cut-high', moon('translate(-5 -5) scale(.6)'))}${cloud('high')}${drizzle([23, 34, 45])}`,
  rain: () => `${cloud('high')}${rainLines(RAIN_X)}`,
  storm: () => `${cloud('high')}<path class="wxi-bolt" d="M37 40.5l-8.5 11.5h7l-3.5 10 11-14h-7l3.5-7.5z"/>`,
  snow: () => `${cloud('high')}<path class="wxi-snow" d="${flake(24, 51)}${flake(44, 51)}${flake(34, 58)}"/>`,
  fog: () => `${cloud('high')}<path class="wxi-fog" d="M16 49h26M48 49h4M20 56h4M30 56h22"/>`,
  wind: () => `<path class="wxi-wind" d="M10 25h25a6.5 6.5 0 1 0-6.5-6.5M10 34h36a7 7 0 1 1-7 7M10 43h17"/>`
};

// A weather picture: by kind ('clear-day'…) or straight from a condition.
export function wxArt(kind, { size = 40, cls = '' } = {}) {
  const draw = ART[kind] || ART.cloud;
  return `<svg class="wx-art-i${cls ? ` ${cls}` : ''}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false">${draw()}</svg>`;
}
export const conditionArt = (code, text, day = true, opts) => wxArt(conditionKind(code, text, day), opts);
// The sun rising or setting, in the same hand: the horizon, the sun half
// over it, an arrow which way it goes.
export const sunArt = (kind, { size = 24 } = {}) =>
  `<svg class="wx-art-i wx-sun-i" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false"><g class="wxi-sun"><path d="M19 42a13 13 0 0 1 26 0z"/><circle cx="32" cy="18" r="2.3"/><circle cx="16" cy="27" r="2.3"/><circle cx="48" cy="27" r="2.3"/></g><path class="wxi-line" d="M8 42h48${kind === 'sunset' ? 'M32 47v9M27.5 51.5 32 56l4.5-4.5' : 'M32 56v-9M27.5 51.5 32 47l4.5 4.5'}"/></svg>`;

// ---- Line glyphs -----------------------------------------------------------------------------

const P = {
  umbrella: '<path d="M3.5 12a8.5 8.5 0 0 1 17 0z"/><path d="M12 12v6.5a2.2 2.2 0 0 1-4.4 0M12 2.5v1"/>',
  shirt: '<path d="M8.5 3.5 4 6 2.5 10l3 1.5 1-1.5v10.5h11V10l1 1.5 3-1.5L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z"/>',
  // (The sun as the pictures draw it: a disc ringed by dots.)
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3.6v.01M12 20.4v.01M3.6 12h.01M20.4 12h.01M6.1 6.1v.01M17.9 17.9v.01M6.1 17.9v.01M17.9 6.1v.01" stroke-width="2.6"/>',
  run: '<circle cx="14.5" cy="4.5" r="1.8"/><path d="m7.5 21 3.2-5.6 3.3 2.6v4M5.5 11.5 9 8.5h4.5l2.4 3.4 3 .6M10.5 8.6 9.2 14.2l3.3 2.8"/>',
  laundry: '<path d="M12 7.6a2 2 0 1 1 2-2c0 1.2-2 1.5-2 2.9l8.4 6.1a1.5 1.5 0 0 1-.9 2.7H4.5a1.5 1.5 0 0 1-.9-2.7L12 8.5"/>',
  train: '<rect x="5.5" y="3" width="13" height="14" rx="3"/><path d="M5.5 10.5h13M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="13.8" r=".6"/><circle cx="15" cy="13.8" r=".6"/>',
  bed: '<path d="M3 18.5v-12M3 14h18v4.5M21 14v-2.5a3 3 0 0 0-3-3h-7V14"/><circle cx="7" cy="11" r="1.8"/>',
  window: '<rect x="4.5" y="3.5" width="15" height="17" rx="1.5"/><path d="M12 3.5v17M4.5 12h15"/>',
  mask: '<path d="M5 8.5c3-1.5 11-1.5 14 0v5c0 3-3.5 5.5-7 5.5s-7-2.5-7-5.5z"/><path d="M5 10H3.8a1.5 1.5 0 0 0 0 3H5M19 10h1.2a1.5 1.5 0 0 1 0 3H19M9 11.5h6M9.5 14.5h5"/>',
  thermo: '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7.5"/>',
  heat: '<path d="M8 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M10 9v7.5M16.5 5.5 18 4.5M17 9h2.5M16.5 12.5l1.5 1"/>',
  car: '<path d="M5 16.5H3.5v-4l2-5h13l2 5v4H19M3.5 12.5h17M9.5 16.5h5"/><circle cx="7.3" cy="16.5" r="2"/><circle cx="16.7" cy="16.5" r="2"/>',
  arrows: '<path d="M7 8 3.5 12 7 16M17 8l3.5 4-3.5 4M3.5 12h17"/>',
  tent: '<path d="M12 4 3 20h18L12 4zM9 20l3-6 3 6"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>',
  wind: '<path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5M3 13h15a3 3 0 1 1-3 3M3 17h6"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8z"/>',
  fog: '<path d="M4 8h16M3 12h18M5 16h14M8 20h8"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  locate: '<path d="M20 4 4 11l7 2 2 7 7-16z"/>',
  route: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8.2 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevR: '<path d="m9 5 7 7-7 7"/>',
  chevL: '<path d="m15 5-7 7 7 7"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4"/>',
  layout: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M10 10v10"/>',
  gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="m12 13 3.5-4"/><circle cx="12" cy="13" r="1.2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  rain: '<path d="M7 15.5a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 7.1a4.2 4.2 0 0 1 .5 8.4"/><path d="m8.5 18-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
  cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.6 8.6a5 5 0 0 1-.1 9.9z"/>',
  sunrise: '<path d="M7 14.5a5 5 0 0 1 10 0M3 14.5h18M12 21v-3.6M10.2 19.2l1.8-1.8 1.8 1.8"/><path d="M12 5.5v.01M5.6 8.6v.01M18.4 8.6v.01" stroke-width="2.6"/>',
  sunset: '<path d="M7 14.5a5 5 0 0 1 10 0M3 14.5h18M12 17.4V21M10.2 19.2l1.8 1.8 1.8-1.8"/><path d="M12 5.5v.01M5.6 8.6v.01M18.4 8.6v.01" stroke-width="2.6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  air: '<circle cx="7" cy="8" r="2"/><circle cx="16" cy="6.5" r="1.4"/><circle cx="12.5" cy="13" r="2.4"/><circle cx="6.5" cy="17" r="1.3"/><circle cx="17.5" cy="16.5" r="2"/>',
  station: '<path d="M12 11v10M8.5 21h7M8 5.5a5.5 5.5 0 0 0 0 7M16 5.5a5.5 5.5 0 0 1 0 7"/><circle cx="12" cy="9" r="2"/>',
  typhoon: '<circle cx="12" cy="12" r="3.2"/><path d="M12 8.8C12 5 14.6 3 18.5 3M12 15.2c0 3.8-2.6 5.8-6.5 5.8"/>',
  warn: '<path d="M12 4 2.8 19.5h18.4L12 4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  moon: '<path d="M11.4 4A8 8 0 1 0 19.8 13.6 6.5 6.5 0 0 1 11.4 4z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chart: '<path d="M4 19.5h16M6.5 16v-4M11 16V8M15.5 16v-6M19.5 16V5"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.1M4.5 12h.1M4.5 18h.1"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>'
};

// A line glyph by name, in the text's colour.
export function glyph(name, { size = 20, cls = '' } = {}) {
  return `<svg class="wx-g${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || P.cloud}</svg>`;
}

// The moon as it looks tonight (a phase name), lit part drawn.
const PHASES = ['NEW_MOON', 'WAXING_CRESCENT', 'FIRST_QUARTER', 'WAXING_GIBBOUS', 'FULL_MOON', 'WANING_GIBBOUS', 'LAST_QUARTER', 'WANING_CRESCENT'];
export function moonArt(phase, { size = 20 } = {}) {
  const k = PHASES.indexOf(phase);
  const f = k < 0 ? 0.5 : k / 8;
  const r = 9;
  const rx = Math.round(Math.abs(Math.cos(2 * Math.PI * f)) * r * 100) / 100;
  let lit = '';
  if (k === 4) lit = `<circle cx="12" cy="12" r="${r}" fill="#f6e3a8"/>`;
  else if (k > 0) {
    const waxing = f < 0.5;
    const thin = waxing ? f < 0.25 : f > 0.75;
    const d = waxing ? `M12 3A9 9 0 0 1 12 21A${rx} 9 0 0 ${thin ? 0 : 1} 12 3Z` : `M12 3A9 9 0 0 0 12 21A${rx} 9 0 0 ${thin ? 1 : 0} 12 3Z`;
    lit = `<path d="${d}" fill="#f6e3a8"/>`;
  }
  return `<svg class="wx-moon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="${r}" fill="#3a3f57" stroke="#6b7192" stroke-width=".8"/>${lit}</svg>`;
}

// Each kind of advice's glyph.
export const ADVICE_GLYPH = {
  umbrella: 'umbrella', commute: 'train', wear: 'shirt', sun: 'sun', run: 'run', laundry: 'laundry', sleep: 'bed', window: 'window', mask: 'mask', heat: 'heat', carwash: 'car',
  move: 'train', pe: 'run', diff: 'arrows', weekend: 'tent', humid: 'drop', temp: 'thermo', wind: 'wind', thunder: 'bolt', fog: 'fog'
};
// Where a page is: the route, home, a pin, or here.
export const placeGlyph = (page, opts) => glyph(page?.plan ? 'route' : page?.pin?.home ? 'home' : page?.pin || page?.look ? 'pin' : 'locate', opts);
