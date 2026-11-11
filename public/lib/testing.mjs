// Orbit Weather's own switches in the kit's 測試工具 (hidden until unlocked:
// Orbit Pass › seven taps on 除錯紀錄). Each is read where the state is
// decided, as globalThis.ORBIT_TEST?.flags?.<name>; the kit's clock, place
// and network switches work here as everywhere. Only what's drawn changes:
// nothing is kept on the device or the Pass, nothing more is asked of the Worker.
//   typhoon: official | chance   the page's county closed today (人事行政總處's word), or a 72% chance
//   radar:   soon | now          the radar's shower due in about 20 minutes, or raining now
//   airBad                       AQI 168 and the mask / windows advice
//   extreme: heat | cold         a heat or a cold snap's numbers and advice
//   forecastFail                 every forecast read fails (無法更新 over the last copy)
import { W } from '#kit/lang.mjs';
import { dateOf } from './format.mjs';

const flags = () => globalThis.ORBIT_TEST?.flags || {};

// A forecast as the switches have it (a copy; the one kept is untouched). No switch: the same object.
export function testForecast(f, page, now = Date.now()) {
  const on = flags();
  if (!f || !(on.typhoon || on.radar || on.airBad || on.extreme)) return f;
  const g = { ...f };
  const advice = (kind, row) => (g.advice = [...(g.advice || []).filter(a => a.kind !== kind), row]);
  const today = dateOf(now, f.tz);
  if (on.typhoon) {
    // (dayOffSec shows it only on a copy under 3 hours old.)
    g.at = Math.max(Number(f.at) || 0, now - 60_000);
    g.dayOff = on.typhoon === 'chance'
      ? { date: today, name: '山陀兒', nameEn: 'KRATHON', chance: 72, why: { land: true, gust: 10, wind: 7, mm: 120, nearClosed: 3 } }
      : { date: today, name: '山陀兒', nameEn: 'KRATHON', official: { lines: [{ text: '今天停止上班、停止上課。', off: 'all', at: now - 40 * 60_000 }] } };
  }
  if (on.radar) {
    // Five-minute steps from a minute ago (the kit's rain-now.mjs reads them).
    const rate = on.radar === 'now' ? [3, 4, 6, 8, 5, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 1, 3, 6, 12, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    g.at = Math.max(Number(f.at) || 0, now - 60_000);
    g.radar = { at: Math.floor(now / 60_000) * 60_000 - 60_000, step: 5, rate };
  }
  if (on.airBad && f.air) {
    g.air = { ...f.air, aqi: 168, level: '對所有族群不健康', pm25: 82 };
    advice('mask', { kind: 'mask', level: 'bad', text: '口罩：空氣很差，AQI 168' });
    advice('window', { kind: 'window', level: 'bad', text: '開窗：空氣差，關窗' });
  }
  if (on.extreme === 'heat' || on.extreme === 'cold') {
    const hot = on.extreme === 'heat';
    if (f.now) g.now = { ...f.now, temp: hot ? 35.4 : 8.2, feels: hot ? 39 : 5 };
    if (f.days?.length) g.days = [{ ...f.days[0], hi: hot ? 36 : 12, lo: hot ? 29 : 6, feelsHi: hot ? 40 : 10, feelsLo: hot ? 31 : 3 }, ...f.days.slice(1)];
    if (hot) advice('heat', { kind: 'heat', level: 'hot', text: '炎熱：體感 39°，多喝水' });
    else advice('temp', { kind: 'temp', level: 'yes', text: '降溫：明早 6°，低 9°' });
  }
  return g;
}

if (typeof document !== 'undefined') {
  (globalThis.ORBIT_TEST_TOOLS ||= []).push(
    {
      app: 'weather',
      title: W('颱風停班停課', 'Typhoon day off'),
      sub: W('這個地點的縣市今天停班停課，或停班停課機率', 'This place’s county closed today, or the chance of it'),
      flag: 'typhoon',
      options: [
        { id: 'official', label: W('已公布', 'Announced') },
        { id: 'chance', label: W('機率 72%', '72% chance') }
      ]
    },
    {
      app: 'weather',
      title: W('雷達：快下雨了', 'Radar: rain coming'),
      sub: W('雷達看到約 20 分鐘後下雨，或正在下', 'The radar sees rain in about 20 minutes, or raining now'),
      flag: 'radar',
      options: [
        { id: 'soon', label: W('約 20 分鐘後', 'In ~20 min') },
        { id: 'now', label: W('正在下', 'Raining now') }
      ]
    },
    { app: 'weather', title: W('空氣品質警示', 'Air quality alert'), sub: W('AQI 168，口罩和關窗的建議', 'AQI 168, the mask and windows advice'), flag: 'airBad' },
    {
      app: 'weather',
      title: W('炎熱／寒流', 'Heat / cold snap'),
      sub: W('體感 39° 的炎熱，或明早 6° 的降溫', 'Feels like 39°, or 6° tomorrow morning'),
      flag: 'extreme',
      options: [
        { id: 'heat', label: W('炎熱', 'Heat') },
        { id: 'cold', label: W('寒流', 'Cold') }
      ]
    },
    { app: 'weather', title: W('預報讀取失敗', 'Forecast fails'), sub: W('每次讀預報都失敗：看「無法更新」和舊資料', 'Every forecast read fails: the error over the last copy'), flag: 'forecastFail' }
  );
}
