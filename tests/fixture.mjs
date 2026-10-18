// A forecast as /weather answers it (Shared-Proxy weather.js), for the tests.
import { dateOf } from '../public/lib/format.mjs';

export const H = 3_600_000;
export const tpe = s => Date.parse(`${s}+08:00`);
export const NOW = tpe('2026-10-02T19:46:00'); // a Friday evening in Taipei

export const hours = Array.from({ length: 240 }, (_, i) => ({
  t: tpe('2026-10-02T19:00:00') + i * H,
  temp: 25 + Math.sin(i / 4) * 3,
  feels: 27 + Math.sin(i / 4) * 3,
  uv: (i + 19) % 24 > 8 && (i + 19) % 24 < 16 ? 7 : 0,
  pop: i === 5 ? 70 : 10,
  mm: i === 5 ? 2.4 : 0,
  day: (i + 19) % 24 > 5 && (i + 19) % 24 < 18,
  condition: { code: 'CLOUDY', text: '陰' },
  wind: { dir: 70, speed: 10, gust: 20 },
  humidity: 90
}));
export const days = Array.from({ length: 10 }, (_, i) => ({ date: dateOf(NOW + i * 86_400_000), hi: 30 - (i % 3), lo: 23, feelsHi: 33, feelsLo: 25, pop: i * 10, uvMax: 7, day: { condition: { code: 'PARTLY_CLOUDY', text: '局部多雲' }, pop: 20 }, night: { condition: { code: 'LIGHT_RAIN', text: '小雨' }, pop: 30 }, sunrise: tpe('2026-10-02T05:46:00') + i * 86_400_000, sunset: tpe('2026-10-02T17:40:00') + i * 86_400_000, moon: { phase: 'WANING_GIBBOUS' } }));
export const forecast = {
  cell: '25.03,121.57', at: NOW - 120_000, tz: 'Asia/Taipei', lat: 25.03, lon: 121.57, partial: false,
  place: { county: '臺北市', town: '信義區' },
  now: { temp: 27.7, feels: 27, humidity: 94, uv: 0, day: false, condition: { code: 'CLOUDY', text: '陰' }, wind: { dir: 71, speed: 10, gust: 21 }, pressure: 1016, rain1h: 3, rainToday: 3, station: { name: '信義', km: 0.4, temp: 27.7, at: NOW - 40 * 60_000 } },
  hours,
  days,
  air: { aqi: 39, level: '良好', pm25: 7, pm10: 12, o3: 36, station: { name: '松山', km: 2.2 }, history: [{ t: NOW - 3 * H, aqi: 45, pm25: 9 }, { t: NOW - 2 * H, aqi: 41, pm25: 8 }, { t: NOW - H, aqi: 39, pm25: 7 }], forecast: { days: [{ date: '2026-10-02', aqi: 60, level: '普通' }, { date: '2026-10-03', aqi: 55, level: '普通' }, { date: '2026-10-04', aqi: 48, level: '良好' }] } },
  alerts: [{ title: '大雨特報', from: NOW - H, to: NOW + H }],
  headline: '現在陰，22 點前後有機會下雨（39%），明天最高 28°、最低 24°。',
  advice: [{ kind: 'umbrella', level: 'maybe', text: '可帶摺疊傘：13:00 降雨機率 41%', week: { text: '週日要帶傘', days: ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((date, i) => ({ date, mark: i === 1 ? 'yes' : null, v: `${i * 10}%` })) } }, { kind: 'sun', level: '高', text: '防曬：11:00–14:00 UV 7（高）' }, { kind: 'week', level: 'info', text: '本週最佳：10/7（週三）' }]
};

