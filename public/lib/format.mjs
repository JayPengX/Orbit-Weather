// Labels, colours and icons: everything the screen says about a number.

import { W, en } from './lang.mjs';

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
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// 今天, 明天, or 週X, for a "YYYY-MM-DD".
export function dayLabel(date, now, tz = TZ) {
  const today = dateOf(now, tz);
  if (date === today) return W('今天', 'Today');
  if (date === dateOf(now + 86_400_000, tz)) return W('明天', 'Tomorrow');
  return weekday(date);
}
export const shortDate = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
// 「週六」 for a "YYYY-MM-DD".
export const weekday = date => (en ? WEEK_EN[new Date(date + 'T12:00:00Z').getUTCDay()] : '週' + WEEK[new Date(date + 'T12:00:00Z').getUTCDay()]);

export const deg = v => (v == null ? '–' : `${Math.round(v)}°`);
export const pct = v => (v == null ? '–' : `${Math.round(v)}%`);

// UV: the levels Taiwan uses, and a colour for each (green → violet).
export function uvLevel(uv) {
  if (uv == null) return null;
  return uv < 3 ? W('低', 'Low') : uv < 6 ? W('中', 'Moderate') : uv < 8 ? W('高', 'High') : uv < 11 ? W('過量', 'Very high') : W('危險', 'Extreme');
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
const DIRS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const windDir = d => {
  if (d == null) return '';
  const i = Math.round((((d % 360) + 360) % 360) / 45) % 8;
  return en ? `${DIRS_EN[i]} wind` : DIRS[i] + '風';
};
// km/h → Beaufort, the way Taiwan says wind.
export function beaufort(kmh) {
  if (kmh == null) return null;
  const limits = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  const i = limits.findIndex(l => kmh < l);
  return i === -1 ? 12 : i;
}

// The kind of weather for a condition (Google's codes; CWA's text when
// that's all there is): the app's pictures (icons.mjs) are drawn by kind.
export function conditionKind(code, text = '', day = true) {
  const c = String(code || '').toUpperCase();
  const t = String(text || '');
  const dn = day ? 'day' : 'night';
  if (/THUNDER/.test(c) || /雷/.test(t)) return 'storm';
  if (/SNOW|HAIL|SLEET/.test(c) || /雪|冰雹/.test(t)) return 'snow';
  if (/HEAVY_RAIN|RAIN_SHOWERS|SHOWERS/.test(c) || /大雨|豪雨|陣雨/.test(t)) return 'rain';
  if (/RAIN|DRIZZLE/.test(c) || /雨/.test(t)) return `drizzle-${dn}`;
  if (/FOG|HAZE|MIST/.test(c) || /霧|霾/.test(t)) return 'fog';
  if (/WIND/.test(c)) return 'wind';
  if (/^CLOUDY|OVERCAST|MOSTLY_CLOUDY/.test(c) || /^陰/.test(t)) return 'cloud';
  if (/PARTLY|MOSTLY_CLEAR|MOSTLY_SUNNY/.test(c) || /多雲/.test(t)) return `part-${dn}`;
  if (/CLEAR|SUNNY/.test(c) || /晴/.test(t)) return `clear-${dn}`;
  return `part-${dn}`;
}
// The same as an emoji (for notices, which are plain text).
const EMOJI = { storm: '⛈️', snow: '🌨️', rain: '🌧️', 'drizzle-day': '🌦️', 'drizzle-night': '🌧️', fog: '🌫️', wind: '💨', cloud: '☁️', 'part-day': '⛅', 'part-night': '☁️', 'clear-day': '☀️', 'clear-night': '🌙' };
export const conditionIcon = (code, text = '', day = true) => EMOJI[conditionKind(code, text, day)];

const MOON = {
  NEW_MOON: ['新月', '🌑', 'New moon'], WAXING_CRESCENT: ['眉月', '🌒', 'Waxing crescent'], FIRST_QUARTER: ['上弦月', '🌓', 'First quarter'], WAXING_GIBBOUS: ['盈凸月', '🌔', 'Waxing gibbous'],
  FULL_MOON: ['滿月', '🌕', 'Full moon'], WANING_GIBBOUS: ['虧凸月', '🌖', 'Waning gibbous'], LAST_QUARTER: ['下弦月', '🌗', 'Last quarter'], WANING_CRESCENT: ['殘月', '🌘', 'Waning crescent']
};
// [name, emoji] in the reader's language.
export const moonPhase = p => (MOON[p] ? [W(MOON[p][0], MOON[p][2]), MOON[p][1]] : null);


export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// "5 分鐘前", for the data's age.
export function ago(ms, now) {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return W('剛剛', 'just now');
  if (m < 60) return W(`${m} 分鐘前`, `${m} min ago`);
  const h = Math.round(m / 60);
  return h < 24 ? W(`${h} 小時前`, `${h} h ago`) : W(`${Math.round(h / 24)} 天前`, `${Math.round(h / 24)} d ago`);
}

// A condition's words in the reader's language: Google's (or CWA's) Chinese,
// or in English from Google's code (PARTLY_CLOUDY: Partly cloudy); the
// forecast is read once in Chinese for everyone (its cost), so English is made here.
const CONDITION_EN = { 晴: 'Clear', 多雲: 'Partly cloudy', 陰: 'Cloudy', 雨: 'Rain', 陣雨: 'Showers', 雷: 'Thunderstorms', 霧: 'Fog' };
// Google's longer names, cut to a word or two so they sit on one line.
const CONDITION_SHORT = {
  SCATTERED_THUNDERSTORMS: 'T-storms', LIGHT_THUNDERSTORM_RAIN: 'Light T-storm', HEAVY_THUNDERSTORM: 'Heavy T-storm',
  RAIN_PERIODICALLY_HEAVY: 'Heavy at times', LIGHT_TO_MODERATE_RAIN: 'Rain', MODERATE_TO_HEAVY_RAIN: 'Heavy rain',
  CHANCE_OF_SHOWERS: 'Maybe showers', SCATTERED_SHOWERS: 'Showers', LIGHT_RAIN_SHOWERS: 'Light showers', HEAVY_RAIN_SHOWERS: 'Heavy showers',
  WINDY_AND_RAINY: 'Wind and rain', CHANCE_OF_SNOW_SHOWERS: 'Maybe snow', SCATTERED_SNOW_SHOWERS: 'Snow showers', LIGHT_SNOW_SHOWERS: 'Light snow',
  HEAVY_SNOW_SHOWERS: 'Heavy snow', LIGHT_TO_MODERATE_SNOW: 'Snow', MODERATE_TO_HEAVY_SNOW: 'Heavy snow', SNOW_PERIODICALLY_HEAVY: 'Heavy snow',
  RAIN_AND_SNOW: 'Rain and snow', HAIL_SHOWERS: 'Hail', WINDY_AND_SNOWY: 'Wind and snow'
};
export function conditionText(code, text = '') {
  if (!en) return text;
  const c = String(code || '');
  if (CONDITION_SHORT[c]) return CONDITION_SHORT[c];
  if (c && c !== 'TYPE_UNSPECIFIED') {
    const words = c.toLowerCase().replace(/_/g, ' ');
    return words[0].toUpperCase() + words.slice(1);
  }
  const hit = Object.keys(CONDITION_EN).find(k => String(text).includes(k));
  return hit ? CONDITION_EN[hit] : text;
}
// Taiwan's air quality levels (MOENV's words) in English.
const AQI_EN = { 良好: 'Good', 普通: 'Moderate', 對敏感族群不健康: 'Unhealthy for some', 對所有族群不健康: 'Unhealthy', 非常不健康: 'Very unhealthy', 危害: 'Hazardous' };
export const aqiLevel = level => (en ? AQI_EN[String(level || '').trim()] || level || '' : level || '');
