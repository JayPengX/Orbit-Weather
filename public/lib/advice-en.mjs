// The proxy's advice in English: its sentences are short and few, so a
// phrase table turns them over; any piece it can't read comes back null
// (and its tile is left out rather than shown half Chinese).

const DAYS = { 日: 'Sun', 一: 'Mon', 二: 'Tue', 三: 'Wed', 四: 'Thu', 五: 'Fri', 六: 'Sat' };
const UV = { 低: 'low', 中: 'moderate', 高: 'high', 過量: 'very high', 危險: 'extreme' };
const RULES = [
  [/^(\d+)時 (\d+)% 會下雨$/, 'Rain $2% at $1:00'],
  [/^摺疊傘，(\d+)時 (\d+)%$/, 'Folding one, $2% at $1:00'],
  [/^(\d+)–(\d+)時 UV ([\d.]+) (低|中|高|過量|危險)$/, (m, a, b, uv, lv) => `UV ${uv} ${UV[lv]}, ${a}:00–${b}:00`],
  [/^明早 (-?\d+)°，低 (\d+)°$/, 'Tomorrow morning $1°, $2° colder'],
  [/^明早 (-?\d+)°，高 (\d+)°$/, 'Tomorrow morning $1°, $2° warmer'],
  [/^(\d+)–(\d+)時可能打雷$/, 'Thunder likely $1:00–$2:00'],
  [/^(\d+)時陣風 (\d+) km\/h$/, 'Gusts $2 km/h at $1:00'],
  [/^(\d+)時能見度 ([\d.]+) 公里$/, 'Visibility $2 km at $1:00'],
  [/^空氣(很差|不佳)，AQI (\d+)$/, (m, how, aqi) => `Air ${how === '很差' ? 'very poor' : 'poor'}, AQI ${aqi}`],
  [/^濕度 (\d+)%，衣物易潮$/, 'Humidity $1%, clothes stay damp'],
  [/^今晚 (-?\d+)°，(.+)$/, (m, v, how) => `Tonight ${v}°, ${{ 開冷氣: 'AC on', 開除濕: 'dehumidifier on', 開電扇: 'fan on', 舒適: 'comfortable', 蓋薄被: 'light blanket', 蓋厚被: 'thick blanket' }[how] ?? how}`],
  [/^體感 (-?\d+)°，多喝水$/, 'Feels $1°, drink water'],
  // A kind the week needs but today doesn't (weather.js weekAdvice).
  [/^不太會下雨$/, 'Unlikely today'],
  [/^紫外線不強$/, 'UV low today'],
  [/^不會太熱$/, 'Not too hot today'],
  [/^空氣還可以$/, 'Air OK today']
];
const WORDS = [
  [/(\d+)–(\d+)時/g, '$1:00–$2:00'],
  [/(\d+)時/g, '$1:00'],
  [/週([日一二三四五六])/g, (m, d) => DAYS[d]],
  [/早晚加件/g, 'layer up at night'],
  [/長袖或短袖/g, 'Any sleeves'],
  [/輕薄短袖/g, 'Light short sleeves'],
  [/薄外套/g, 'Light jacket'],
  [/外套/g, 'Coat'],
  [/早晚都乾爽/g, 'Dry AM and PM'],
  [/早上/g, 'AM '],
  [/傍晚/g, 'PM '],
  [/乾爽/g, 'dry'],
  [/今天/g, 'Today'],
  [/明天/g, 'Tomorrow'],
  [/起 (\d+) 天/g, ', $1 dry days'],
  [/這週用烘乾/g, 'Use the dryer this week'],
  [/兩天都可能下雨/g, 'Rain likely both days'],
  [/較好/g, ' is better'],
  [/空氣好，可通風/g, 'Air is good, open up'],
  [/空氣差，關窗/g, 'Air is poor, keep them shut'],
  [/3 天不下雨/g, 'No rain for 3 days'],
  [/，/g, ', '],
  [/ {2,}/g, ' ']
];

const CJK = /[\u4e00-\u9fff]/;
export function adviceEn(text) {
  const s = String(text || '').trim();
  if (!CJK.test(s)) return s;
  const rule = RULES.find(([re]) => re.test(s));
  const out = rule ? s.replace(...rule) : WORDS.reduce((t, [re, to]) => t.replace(re, to), s).trim();
  // (Anything still Chinese, a rule's unknown word included: left out.)
  return CJK.test(out) ? null : out.charAt(0).toUpperCase() + out.slice(1);
}
