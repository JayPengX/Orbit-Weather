// 問天氣 (the family's AI plan, Jay 11-10; code first): a question typed in
// 搜尋地點 (明天竹北會下雨嗎, 週六合歡山會下雪嗎) read into a day, a place and
// what's asked; the answer is code's, from Orbit's own forecast. Only a place
// code can't find among Taiwan's townships (a mountain, a school) is asked of
// the AI door (weather-ask), and only on a tap.
import { W } from '#kit/lang.mjs';
import { conditionKind, conditionText, rainLevel, wearFor, outFeel, shortDate, weekday, dateOf } from './format.mjs';
import { dayPop } from './cards.mjs';

const WD = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
export const addDay = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = day => new Date(`${day}T12:00:00Z`).getUTCDay();
// (Taiwan's week starts on Monday: 這週日 is the week's last day.)
const mondayOf = day => addDay(day, -((dow(day) + 6) % 7));
const wdIndex = c => (WD[c] + 6) % 7;

// The day a question means, and the words that said it ('' none: today).
export function dayOf(text, today) {
  const s = String(text || '').replace(/周/g, '週');
  let m;
  if ((m = /大後天/.exec(s))) return { day: addDay(today, 3), word: m[0] };
  if ((m = /後天/.exec(s))) return { day: addDay(today, 2), word: m[0] };
  if ((m = /明[天日早晚]/.exec(s))) return { day: addDay(today, 1), word: m[0] };
  if ((m = /(下下|下)個?(?:週|星期|禮拜)([一二三四五六日天])/.exec(s))) return { day: addDay(mondayOf(today), (m[1] === '下下' ? 14 : 7) + wdIndex(m[2])), word: m[0] };
  if ((m = /(?:這|本)?個?(?:週|星期|禮拜)([一二三四五六日天])/.exec(s))) {
    const d = addDay(mondayOf(today), wdIndex(m[1]));
    return { day: d < today ? addDay(d, 7) : d, word: m[0] };
  }
  if ((m = /(?:這|下)?個?週末/.exec(s))) {
    const sat = addDay(mondayOf(today), 5);
    return { day: m[0].startsWith('下') ? addDay(sat, 7) : today > sat ? today : sat, word: m[0] };
  }
  if ((m = /(\d{1,2})\s*[/月]\s*(\d{1,2})\s*[日號]?/.exec(s))) {
    const y = Number(today.slice(0, 4));
    let d = `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    if (d < addDay(today, -30)) d = `${y + 1}${d.slice(4)}`;
    return { day: d, word: m[0] };
  }
  if ((m = /(\d{1,2})\s*[號日]/.exec(s))) {
    let d = `${today.slice(0, 8)}${String(m[1]).padStart(2, '0')}`;
    if (d < today) {
      const next = new Date(`${today.slice(0, 8)}01T12:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      d = `${next.toISOString().slice(0, 8)}${String(m[1]).padStart(2, '0')}`;
    }
    return { day: d, word: m[0] };
  }
  if ((m = /今[天日早晚]|現在|等一下|待會/.exec(s))) return { day: today, word: m[0] };
  return { day: today, word: '' };
}

// What's asked: snow, rain, cold, hot, or the day as a whole.
const WHAT = [
  ['snow', /雪|結冰/],
  ['rain', /雨|傘|淋/],
  ['hot', /熱|高溫|曬|紫外線|防曬/],
  ['cold', /冷|凍|低溫|外套|穿什麼|穿多少|幾度|溫度|氣溫/]
];
export const whatOf = text => WHAT.find(([, re]) => re.test(text))?.[0] || 'day';

// A question, not a place's name: a question word, a day word or a kind of weather.
export const asking = text => /[嗎呢?？]|會不會|要不要|天氣|怎樣|如何|好不好|冷不冷|熱不熱|幾度|下雨|下雪|帶傘/.test(text) || /明[天日]|後天|週|周|星期|禮拜/.test(text);

// The words that are neither the place nor the day (what's left is the place's name).
const FILLER = /請問|我想知道|想知道|會不會|會|要不要|要|嗎|呢|吧|天氣|怎樣|如何|好不好|冷不冷|熱不熱|幾度|溫度|氣溫|下雨|下雪|雨|雪|帶傘|帶|傘|冷|熱|穿什麼|穿|適合|出門|去|到|在|的|有沒有|有|可能|早上|中午|下午|晚上|白天|今晚|晚|早|會|和|跟|玩|爬|看|[\s?？!！。，、,.]/g;
const HERE = /這裡|這邊|我這|附近|這附近|外面/;

// Taiwan's townships ([[county, town, lat, lon]], 臺) by the names a person
// says: 竹北市 or 竹北, 大安區 or 大安; a county (新竹縣, 新竹) at its towns' middle.
function placeNames(towns) {
  const names = [];
  const counties = new Map();
  for (const [c, t, la, lo] of towns || []) {
    if (!t) continue;
    const place = { county: c, town: t, lat: la, lon: lo };
    names.push([t, place]);
    if (t.length >= 3 && /[市鎮鄉區]$/.test(t)) names.push([t.slice(0, -1), place]);
    (counties.get(c) || counties.set(c, []).get(c)).push(place);
  }
  for (const [c, ps] of counties) {
    const mid = { county: c, town: '', lat: ps.reduce((a, p) => a + p.lat, 0) / ps.length, lon: ps.reduce((a, p) => a + p.lon, 0) / ps.length };
    names.push([c, mid]);
    if (c.length >= 3) names.push([c.slice(0, -1), mid]);
  }
  return names.sort((a, b) => b[0].length - a[0].length);
}
const near = (a, here) => (here?.lat != null ? (a.lat - here.lat) ** 2 + (a.lon - here.lon) ** 2 : 0);

// → { day, dayWord, what, place | null, here, unknown } or null when it isn't a question.
export function readAsk(text, towns, { today, here = null } = {}) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 40 || !asking(raw)) return null;
  const s = raw.replace(/台/g, '臺');
  const { day, word } = dayOf(s, today);
  const what = whatOf(s);
  let rest = word ? s.replace(word, ' ') : s;
  // The longest name said; a name several townships share (東區), the county said or the nearest.
  let place = null;
  const names = placeNames(towns);
  for (const [name, p] of names) {
    if (name.length < 2 || !rest.includes(name)) continue;
    const same = names.filter(([n]) => n === name).map(([, x]) => x);
    const inCounty = same.filter(x => x.county && x.town && rest.includes(x.county.slice(0, 2)));
    place = (inCounty.length ? inCounty : same).sort((a, b) => near(a, here) - near(b, here))[0] || p;
    rest = rest.replace(name, ' ').replace(place.county, ' ').replace(place.county.slice(0, -1), ' ');
    break;
  }
  const isHere = !place && HERE.test(rest);
  const unknown = place || isHere ? '' : rest.replace(HERE, ' ').replace(FILLER, ' ').replace(/\s+/g, '').trim();
  return { day, dayWord: word, what, place, here: !place && !unknown, unknown: unknown.length >= 2 ? unknown : '' };
}

// The answer, from a forecast `f` for the place: { day, head, line } (null: no forecast).
export function answerOf(ask, f, { now = Date.now(), name = '' } = {}) {
  if (!ask || !f?.days?.length) return null;
  const today = dateOf(now, f.tz);
  const when = ask.day === today ? W('今天', 'Today') : ask.day === addDay(today, 1) ? W('明天', 'Tomorrow') : weekday(ask.day);
  const head = [`${when} ${shortDate(ask.day)}`, name].filter(Boolean).join(' · ');
  const d = f.days.find(x => x.date === ask.day);
  if (!d) return { day: ask.day, head, line: ask.day < today ? W('這天已經過了。', 'That day has passed.') : W('只看得到未來 10 天的天氣，近一點再問。', 'The forecast reaches 10 days; ask again nearer the day.') };
  const pop = dayPop(f, d, now);
  const hi = d.hi != null ? Math.round(d.hi) : null;
  const lo = d.lo != null ? Math.round(d.lo) : null;
  const temps = hi != null && lo != null ? W(`${lo}–${hi}°`, `${lo}–${hi}°`) : '';
  const rainPct = pop != null ? W(`降雨機率 ${Math.round(pop)}%`, `${Math.round(pop)}% chance of rain`) : '';
  const sky = conditionText(d.day?.condition?.code, d.day?.condition?.text);
  const kinds = [d.day, d.night].filter(Boolean).map((h, i) => conditionKind(h.condition?.code, h.condition?.text, i === 0));
  const say = (...parts) => parts.filter(Boolean).join(W('，', ', '));
  // The answer as it's drawn (Jay 11-10: never a plain text): the verdict, the
  // day's sky, its temperatures and the facts that back it as chips; `line`
  // the same in words, for a screen reader.
  let verdict = '';
  const facts = [];
  if (ask.what === 'snow') {
    const yes = kinds.includes('snow');
    const maybe = !yes && lo != null && lo <= 2 && (pop ?? 0) >= 30;
    verdict = yes ? W('預報會下雪', 'Snow is forecast') : maybe ? W('冷又可能有雨，有機會下雪', 'Cold and wet: snow is possible') : W('不太會下雪', 'Snow is unlikely');
    facts.push(rainPct);
  } else if (ask.what === 'rain') {
    const lv = rainLevel(pop ?? 0);
    verdict = lv === 'yes' ? W('會下雨，記得帶傘', 'Rain likely: take an umbrella') : lv === 'maybe' ? W('可能下雨，帶把折傘', 'Rain possible: a folding umbrella') : W('不太會下雨', 'Rain unlikely');
    facts.push(rainPct);
  } else if (ask.what === 'cold' || ask.what === 'hot') {
    const wear = hi != null && lo != null ? wearFor(outFeel(d.feelsLo ?? lo, d.feelsHi ?? hi)) : null;
    verdict = wear ? W(`穿${wear.text}`, wear.text) : sky;
    facts.push(ask.what === 'hot' && d.uvMax != null ? W(`紫外線 ${Math.round(d.uvMax)}`, `UV ${Math.round(d.uvMax)}`) : '', rainPct);
  } else {
    verdict = sky;
    facts.push(rainPct);
  }
  const chips = facts.filter(Boolean);
  const line = say(verdict, ask.what === 'snow' && lo != null ? W(`最低 ${lo}°`, `low ${lo}°`) : hi != null ? W(`最高 ${hi}°、最低 ${lo}°`, `High ${hi}°, low ${lo}°`) : '', ...chips);
  return { day: ask.day, head, line: `${line}${W('。', '.')}`, verdict, sky, code: d.day?.condition?.code ?? null, codeText: d.day?.condition?.text || '', hi, lo, chips };
}
