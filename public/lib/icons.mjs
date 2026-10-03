// The app's own pictures, instead of emoji: a colour picture for each kind
// of weather (64×64, its gradients defined once for the page, `ICON_DEFS`),
// and line glyphs (24×24, drawn in the text's colour) for everything else.

import { conditionKind } from './format.mjs';

// ---- The weather pictures --------------------------------------------------------------------

// The gradients and the shadow, once per page (app.mjs puts them in the
// body; a picture refers to them by id).
export const ICON_DEFS = `<svg class="wx-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">
<defs>
<radialGradient id="wxi-sun" cx=".38" cy=".34" r=".72"><stop offset="0" stop-color="#fff6c2"/><stop offset=".45" stop-color="#ffcc3d"/><stop offset="1" stop-color="#ff9a1f"/></radialGradient>
<linearGradient id="wxi-moon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#f3d27e"/></linearGradient>
<linearGradient id="wxi-cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3deed"/></linearGradient>
<linearGradient id="wxi-cloud2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d5e6"/><stop offset="1" stop-color="#8fa1bb"/></linearGradient>
<linearGradient id="wxi-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa8c0"/><stop offset="1" stop-color="#55627c"/></linearGradient>
<linearGradient id="wxi-drop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd0ff"/><stop offset="1" stop-color="#2f7de1"/></linearGradient>
<linearGradient id="wxi-bolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff07a"/><stop offset="1" stop-color="#ffa21f"/></linearGradient>
<filter id="wxi-sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="#0a1430" flood-opacity=".32"/></filter>
</defs>
</svg>`;

const CLOUD = 'M18 48A10 10 0 0 1 16.8 28.07A14 14 0 0 1 43.6 24.4A12 12 0 0 1 46 48Z';
const CRESCENT = 'M30.5 15.1A17 17 0 1 0 48.7 35.3A14 14 0 0 1 30.5 15.1Z';
const cloud = (fill, t = '') => `<path d="${CLOUD}" fill="url(#${fill})"${t ? ` transform="${t}"` : ''} filter="url(#wxi-sh)"/>`;
function sun(cx, cy, r, ray = 5) {
  const rays = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const p = d => `${Math.round((cx + Math.cos(a) * d) * 10) / 10} ${Math.round((cy + Math.sin(a) * d) * 10) / 10}`;
    rays.push(`M${p(r + 3.5)}L${p(r + 3.5 + ray)}`);
  }
  return `<path d="${rays.join('')}" stroke="#ffc23d" stroke-width="3.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#wxi-sun)"/>`;
}
const moon = (t = '') => `<path d="${CRESCENT}" fill="url(#wxi-moon)"${t ? ` transform="${t}"` : ''}/>`;
const star = (x, y, s = 1) => `<path d="M${x} ${y - 3 * s}Q${x} ${y} ${x + 3 * s} ${y}Q${x} ${y} ${x} ${y + 3 * s}Q${x} ${y} ${x - 3 * s} ${y}Q${x} ${y} ${x} ${y - 3 * s}Z" fill="#fff4cf"/>`;
const drops = xs => xs.map(x => `<path d="M${x} 47l-2.6 7" stroke="url(#wxi-drop)" stroke-width="4" stroke-linecap="round"/>`).join('');

const ART = {
  'clear-day': () => sun(32, 32, 13, 6),
  'clear-night': () => `${moon()}${star(14, 16, 1.1)}${star(20, 46, 0.8)}`,
  'part-day': () => `${sun(23, 22, 10, 4.5)}${cloud('wxi-cloud', 'translate(10 13) scale(.82)')}`,
  'part-night': () => `${moon('translate(2 -2) scale(.62)')}${cloud('wxi-cloud', 'translate(10 13) scale(.82)')}`,
  cloud: () => `${cloud('wxi-cloud2', 'translate(19 1) scale(.72)')}${cloud('wxi-cloud', 'translate(-2 7) scale(.9)')}`,
  'drizzle-day': () => `${sun(22, 18, 9, 4)}${cloud('wxi-cloud', 'translate(8 4) scale(.82)')}${drops([27, 39])}`,
  'drizzle-night': () => `${moon('translate(0 -6) scale(.55)')}${cloud('wxi-cloud', 'translate(8 4) scale(.82)')}${drops([27, 39])}`,
  rain: () => `${cloud('wxi-dark', 'translate(2 -4) scale(.92)')}${drops([22, 33, 44])}`,
  storm: () => `${cloud('wxi-dark', 'translate(2 -5) scale(.92)')}<path d="M34 39l-9 13h7l-3 10 12-15h-7l4-8z" fill="url(#wxi-bolt)" filter="url(#wxi-sh)"/>`,
  snow: () => `${cloud('wxi-cloud', 'translate(2 -5) scale(.92)')}${[[22, 50], [32, 56], [42, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.8" fill="#fff" stroke="#bcd3f0" stroke-width="1"/>`).join('')}`,
  fog: () => `${cloud('wxi-cloud', 'translate(4 -7) scale(.86)')}<path d="M12 46h34M18 52h34M14 58h26" stroke="#cfd9e8" stroke-width="3.6" stroke-linecap="round"/>`,
  wind: () => `<path d="M8 24h28a6 6 0 1 0-6-6M8 34h38a7 7 0 1 1-7 7M8 44h20" fill="none" stroke="#cfe3ff" stroke-width="4" stroke-linecap="round"/>`
};

// A weather picture: by kind ('clear-day'…) or straight from a condition.
export function wxArt(kind, { size = 40, cls = '' } = {}) {
  const draw = ART[kind] || ART.cloud;
  return `<svg class="wx-art-i${cls ? ` ${cls}` : ''}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false">${draw()}</svg>`;
}
export const conditionArt = (code, text, day = true, opts) => wxArt(conditionKind(code, text, day), opts);

// ---- Line glyphs -----------------------------------------------------------------------------

const P = {
  umbrella: '<path d="M3.5 12a8.5 8.5 0 0 1 17 0z"/><path d="M12 12v6.5a2.2 2.2 0 0 1-4.4 0M12 2.5v1"/>',
  shirt: '<path d="M8.5 3.5 4 6 2.5 10l3 1.5 1-1.5v10.5h11V10l1 1.5 3-1.5L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
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
  gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="m12 13 3.5-4"/><circle cx="12" cy="13" r="1.2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  rain: '<path d="M7 15.5a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 7.1a4.2 4.2 0 0 1 .5 8.4"/><path d="m8.5 18-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
  cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.6 8.6a5 5 0 0 1-.1 9.9z"/>',
  sunrise: '<path d="M12 3v5M9.5 5.5 12 3l2.5 2.5M6.5 16a5.5 5.5 0 0 1 11 0M2.5 16h19M5 20h14M4 11.5l1.5 1M20 11.5l-1.5 1"/>',
  sunset: '<path d="M12 3v5M9.5 5.5 12 8l2.5-2.5M6.5 16a5.5 5.5 0 0 1 11 0M2.5 16h19M5 20h14M4 11.5l1.5 1M20 11.5l-1.5 1"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  air: '<circle cx="7" cy="8" r="2"/><circle cx="16" cy="6.5" r="1.4"/><circle cx="12.5" cy="13" r="2.4"/><circle cx="6.5" cy="17" r="1.3"/><circle cx="17.5" cy="16.5" r="2"/>',
  station: '<path d="M12 11v10M8.5 21h7M8 5.5a5.5 5.5 0 0 0 0 7M16 5.5a5.5 5.5 0 0 1 0 7"/><circle cx="12" cy="9" r="2"/>',
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
  move: 'train', diff: 'arrows', weekend: 'tent', humid: 'drop', temp: 'thermo', wind: 'wind', thunder: 'bolt', fog: 'fog'
};
// Where a page is: the route, home, a pin, or here.
export const placeGlyph = (page, opts) => glyph(page?.plan ? 'route' : page?.pin?.home ? 'home' : page?.pin ? 'pin' : 'locate', opts);
