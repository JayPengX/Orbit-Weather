// Labels, colours and icons: everything the screen says about a number.

const TZ = 'Asia/Taipei';

export const pad = n => String(n).padStart(2, '0');

// "HH:MM" in the forecast's time zone.
export function clock(ms, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const get = t => parts.find(p => p.type === t)?.value;
  return `${get('hour')}:${get('minute')}`;
}
export const hourOf = (ms, tz = TZ) => Number(clock(ms, tz).slice(0, 2));

// "YYYY-MM-DD" in the forecast's time zone.
export function dateOf(ms, tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
// 今天, 明天, or 週X, for a "YYYY-MM-DD".
export function dayLabel(date, now, tz = TZ) {
  const today = dateOf(now, tz);
  if (date === today) return '今天';
  if (date === dateOf(now + 86_400_000, tz)) return '明天';
  return '週' + WEEK[new Date(date + 'T12:00:00Z').getUTCDay()];
}
export const shortDate = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

export const deg = v => (v == null ? '–' : `${Math.round(v)}°`);
export const pct = v => (v == null ? '–' : `${Math.round(v)}%`);

// UV: the levels Taiwan uses, and a colour for each (green → violet).
export function uvLevel(uv) {
  if (uv == null) return null;
  return uv < 3 ? '低' : uv < 6 ? '中' : uv < 8 ? '高' : uv < 11 ? '過量' : '危險';
}
export function uvColor(uv) {
  if (uv == null) return 'transparent';
  return uv < 3 ? '#4caf50' : uv < 6 ? '#f5c518' : uv < 8 ? '#ff8c1a' : uv < 11 ? '#e53935' : '#8e24aa';
}

// AQI: Taiwan's six levels.
export function aqiColor(aqi) {
  if (aqi == null) return '#9e9e9e';
  return aqi <= 50 ? '#4caf50' : aqi <= 100 ? '#f5c518' : aqi <= 150 ? '#ff8c1a' : aqi <= 200 ? '#e53935' : aqi <= 300 ? '#8e24aa' : '#7b1e1e';
}

// A rain bar's colour by probability.
export const rainColor = pop => (pop >= 70 ? '#1e88e5' : pop >= 40 ? '#42a5f5' : '#90caf9');

// Compass direction (the wind comes FROM it), in Chinese.
const DIRS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
export const windDir = d => (d == null ? '' : DIRS[Math.round((((d % 360) + 360) % 360) / 45) % 8] + '風');
// km/h → Beaufort, the way Taiwan says wind.
export function beaufort(kmh) {
  if (kmh == null) return null;
  const limits = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  const i = limits.findIndex(l => kmh < l);
  return i === -1 ? 12 : i;
}

// An icon for a condition (Google's codes; CWA's text when that's all there is).
export function conditionIcon(code, text = '', day = true) {
  const c = String(code || '').toUpperCase();
  const t = String(text || '');
  if (/THUNDER/.test(c) || /雷/.test(t)) return '⛈️';
  if (/SNOW|HAIL|SLEET/.test(c) || /雪|冰雹/.test(t)) return '🌨️';
  if (/HEAVY_RAIN|RAIN_SHOWERS|SHOWERS/.test(c) || /大雨|豪雨|陣雨/.test(t)) return '🌧️';
  if (/RAIN|DRIZZLE/.test(c) || /雨/.test(t)) return '🌦️';
  if (/FOG|HAZE|MIST/.test(c) || /霧|霾/.test(t)) return '🌫️';
  if (/WIND/.test(c)) return '💨';
  if (/^CLOUDY|OVERCAST|MOSTLY_CLOUDY/.test(c) || /^陰/.test(t)) return '☁️';
  if (/PARTLY|MOSTLY_CLEAR|MOSTLY_SUNNY/.test(c) || /多雲/.test(t)) return day ? '⛅' : '☁️';
  if (/CLEAR|SUNNY/.test(c) || /晴/.test(t)) return day ? '☀️' : '🌙';
  return day ? '🌤️' : '🌙';
}

const MOON = {
  NEW_MOON: ['新月', '🌑'], WAXING_CRESCENT: ['眉月', '🌒'], FIRST_QUARTER: ['上弦月', '🌓'], WAXING_GIBBOUS: ['盈凸月', '🌔'],
  FULL_MOON: ['滿月', '🌕'], WANING_GIBBOUS: ['虧凸月', '🌖'], LAST_QUARTER: ['下弦月', '🌗'], WANING_CRESCENT: ['殘月', '🌘']
};
export const moonPhase = p => MOON[p] || null;

// The page's look: a gradient for the weather and the time of day.
export function theme(condition, day) {
  const c = String(condition?.code || '').toUpperCase();
  const t = condition?.text || '';
  const wet = /RAIN|THUNDER|SHOWER|DRIZZLE/.test(c) || /雨/.test(t);
  const grey = /CLOUDY|OVERCAST|FOG|HAZE/.test(c) || /陰|霧/.test(t);
  if (!day) return wet ? 'night-rain' : 'night';
  return wet ? 'rain' : grey ? 'cloudy' : 'clear';
}

export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// "5 分鐘前", for the data's age.
export function ago(ms, now) {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return '剛剛';
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} 小時前` : `${Math.round(h / 24)} 天前`;
}
