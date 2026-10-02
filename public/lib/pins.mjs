// Pinned places: a name, a point in Taiwan (to the village), and when it's
// "the" place: the days of the week and the hours. Opening the app inside a
// pin's hours shows that pin; any other time, the current location.
// Saved on the Quadra Pass (the app's payload), newest wins.

export const MAX_PINS = 8;
const DAY_MS = 86_400_000;
const TPE = 8 * 3_600_000;

const clockOk = c => typeof c === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(c);
const minutes = c => Number(c.slice(0, 2)) * 60 + Number(c.slice(3, 5));
// Taiwan's weekday (0 Sunday) and minute of the day at t.
export function taipeiClock(t) {
  const d = new Date(t + TPE);
  return { day: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes(), date: d.toISOString().slice(0, 10) };
}

export function newPinId(rand = () => Math.random()) {
  return `p${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}`;
}

// A pin as stored: anything odd dropped or fixed.
export function cleanPin(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!/^p[a-z0-9]{1,12}$/.test(String(p.id)) || !(lat > 20 && lat < 27) || !(lon > 116 && lon < 124)) return null;
  const days = [...new Set((Array.isArray(p.days) ? p.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  return {
    id: String(p.id),
    name: String(p.name || '').trim().slice(0, 20) || '釘選地點',
    lat: Math.round(lat * 1e5) / 1e5,
    lon: Math.round(lon * 1e5) / 1e5,
    county: String(p.county || '').slice(0, 10),
    town: String(p.town || '').slice(0, 10),
    village: String(p.village || '').slice(0, 10),
    days,
    from: clockOk(p.from) ? p.from : '07:00',
    to: clockOk(p.to) ? p.to : '17:00',
    t: Number(p.t) || 0
  };
}

// Inside its hours now? (A window past midnight, 22:00–06:00, counts the
// morning after as the same day's.)
export function pinActiveAt(pin, t) {
  if (!pin?.days?.length) return false;
  const { day, min } = taipeiClock(t);
  const from = minutes(pin.from);
  const to = minutes(pin.to);
  if (from <= to) return pin.days.includes(day) && min >= from && min < to;
  return (pin.days.includes(day) && min >= from) || (pin.days.includes((day + 6) % 7) && min < to);
}

// The pin to open on now, or null (the current location).
export const activePin = (pins, t = Date.now()) => (pins || []).find(p => pinActiveAt(p, t)) || null;

// A pin's hours in words: 「週一至週五 07:00–17:00」.
const WEEK = '日一二三四五六';
export function scheduleText(pin) {
  if (!pin?.days?.length) return '不自動開啟';
  const d = pin.days;
  const key = d.join('');
  const days = key === '12345' ? '週一至週五' : key === '06' ? '週末' : key === '0123456' ? '每天' : d.map(x => '週' + WEEK[x]).join('、');
  return `${days} ${pin.from}–${pin.to}`;
}

// ---- The payload on the pass ------------------------------------------------------
//
// 'w1:' + JSON { pins, brief, t, gone: { id: t }, cards, hidden } (a
// deleted pin is kept as gone, so an older copy elsewhere doesn't bring it
// back; the cards' order and the hidden ones from the newer copy).

// The cards under the top, in the owner's order; `hidden` ones left out.
export const CARDS = { uv: '紫外線', rain: '降雨機率', air: '空氣品質', advice: '建議', days: '10 天預報', info: '更多資訊' };
export const DEFAULT_LAYOUT = Object.keys(CARDS);
export function cleanLayout(cards, hidden) {
  const known = (Array.isArray(cards) ? cards : []).filter(k => CARDS[k]);
  const order = [...new Set([...known, ...DEFAULT_LAYOUT])];
  return { cards: order, hidden: [...new Set((Array.isArray(hidden) ? hidden : []).filter(k => CARDS[k]))] };
}

export function emptyData() {
  return { pins: [], brief: '06:30', t: 0, gone: {}, cards: [...DEFAULT_LAYOUT], hidden: [] };
}
export function encodeData(data) {
  return 'w1:' + JSON.stringify({ pins: data.pins, brief: data.brief, t: data.t, gone: data.gone, cards: data.cards, hidden: data.hidden });
}
export function decodeData(text) {
  if (typeof text !== 'string' || !text.startsWith('w1:')) return null;
  try {
    const j = JSON.parse(text.slice(3));
    return {
      pins: (Array.isArray(j.pins) ? j.pins : []).map(cleanPin).filter(Boolean).slice(0, MAX_PINS),
      brief: clockOk(j.brief) ? j.brief : '06:30',
      t: Number(j.t) || 0,
      gone: j.gone && typeof j.gone === 'object' ? Object.fromEntries(Object.entries(j.gone).filter(([, v]) => Number.isFinite(v))) : {},
      ...cleanLayout(j.cards, j.hidden)
    };
  } catch {
    return null;
  }
}
// Two copies made one: each pin the newer of the two, a deletion newer than
// the pin wins; the brief time and the cards from the newer copy. Order: `a`'s, then new ones.
export function mergeData(a, b, now = Date.now()) {
  if (!a) return b || emptyData();
  if (!b) return a;
  const gone = { ...a.gone };
  for (const [id, t] of Object.entries(b.gone || {})) gone[id] = Math.max(gone[id] || 0, t);
  for (const [id, t] of Object.entries(gone)) if (now - t > 60 * DAY_MS) delete gone[id];
  const byId = new Map();
  for (const p of [...a.pins, ...b.pins]) {
    const had = byId.get(p.id);
    if (!had || p.t > had.t) byId.set(p.id, p);
  }
  const order = [...a.pins.map(p => p.id), ...b.pins.map(p => p.id)];
  const pins = [...new Set(order)].map(id => byId.get(id)).filter(p => p && !(gone[p.id] >= p.t)).slice(0, MAX_PINS);
  const newer = (b.t || 0) > (a.t || 0) ? b : a;
  return { pins, brief: newer.brief, t: Math.max(a.t || 0, b.t || 0), gone, ...cleanLayout(newer.cards, newer.hidden) };
}

// ---- Notices: where each one is for ----------------------------------------------
//
// For the next 7 Taiwan days: the morning brief at `brief`, for the pin
// whose hours hold that moment (else where the app last was), and the rain
// watch from 07:00 to 21:00, split by the pins' hours: each pin's at the
// pin, the rest where the app last was.
const at = (date, clock) => Date.parse(`${date}T${clock}:00+08:00`);
export function planNotices({ pins = [], brief = '06:30', here = null, now = Date.now(), days = 7, briefOn = true, rainOn = true }) {
  const items = [];
  const where = p => ({ lat: Math.round(p.lat * 1e4) / 1e4, lon: Math.round(p.lon * 1e4) / 1e4 });
  for (let i = 0; i <= days; i++) {
    const date = taipeiClock(now + i * DAY_MS).date;
    if (briefOn && clockOk(brief)) {
      const t = at(date, brief);
      const pin = activePin(pins, t);
      const p = pin || here;
      if (p && t > now && items.filter(x => x.kind === 'brief').length < days) {
        items.push({ at: t, kind: 'brief', title: pin ? `${pin.name} 今天天氣` : '今天天氣', tag: `brief:${date}`, hash: pin ? `pin=${pin.id}` : '', check: { weather: { ...where(p), kind: 'brief' } } });
      }
    }
    if (rainOn && i < days) {
      const dayStart = at(date, '07:00');
      const dayEnd = at(date, '21:00');
      // The pins' windows that day, clipped to 07–21, in time order.
      const { day } = taipeiClock(dayStart);
      const segs = pins
        .filter(p => p.days.includes(day) && minutes(p.from) < minutes(p.to))
        .map(p => ({ pin: p, from: Math.max(dayStart, at(date, p.from)), to: Math.min(dayEnd, at(date, p.to)) }))
        .filter(s => s.to > s.from)
        .sort((a, b) => a.from - b.from);
      const all = [];
      let cursor = dayStart;
      for (const s of segs) {
        if (s.from < cursor) continue;
        if (s.from > cursor && here) all.push({ from: cursor, to: s.from, p: here, pin: null });
        all.push({ from: s.from, to: s.to, p: s.pin, pin: s.pin });
        cursor = s.to;
      }
      if (cursor < dayEnd && here) all.push({ from: cursor, to: dayEnd, p: here, pin: null });
      for (const s of all) {
        if (s.to <= now) continue;
        items.push({ at: Math.max(s.from, now + 60_000), until: s.to, kind: 'rain', title: s.pin ? `${s.pin.name}快下雨了` : '快下雨了', tag: `rain:${date}:${s.pin?.id || 'here'}`, hash: s.pin ? `pin=${s.pin.id}` : '', check: { weather: { ...where(s.p), kind: 'rain' } } });
      }
    }
  }
  return items.sort((a, b) => a.at - b.at).slice(0, 60);
}
