// The app's logic without a browser: where to look, the cache, the curve,
// the labels, the sun.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cellOf, chooseSource, isFresh, loadState, saveState, getPosition, permissionState, fetchForecast, placeName, FRESH_MS } from '../public/lib/api.mjs';
import { curveSvg, tempScale, linePath, COL } from '../public/lib/chart.mjs';
import { clock, dateOf, dayLabel, uvLevel, windDir, beaufort, conditionIcon, theme, escapeHtml, ago, moonPhase } from '../public/lib/format.mjs';
import { sunTimes, sunProgress } from '../public/lib/sun.mjs';
import { todayCard, curveCard, daysCard, airCard, sunCard, extrasCard, nightTest } from '../public/lib/view.mjs';

const NOW = Date.parse('2026-10-02T11:46:00Z'); // 19:46 in Taipei
const memStore = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

test('where to look: a picked place, the device when allowed, else the network', () => {
  assert.equal(chooseSource({ pick: { lat: 1, lon: 2 }, permission: 'granted' }), 'pick');
  assert.equal(chooseSource({ permission: 'granted' }), 'gps');
  assert.equal(chooseSource({ permission: 'prompt' }), 'ip', 'never prompts on its own');
  assert.equal(chooseSource({ permission: 'unknown' }), 'ip');
  assert.equal(chooseSource({ permission: 'prompt', wantGps: true }), 'gps', 'asked for once with the button');
  assert.equal(chooseSource({ permission: 'denied', wantGps: true }), 'ip');
});

test('the same cell under 15 minutes needs no fetch', () => {
  assert.equal(cellOf(25.0339, 121.5645), '25.03,121.56');
  const s = { forecast: {}, cell: '25.03,121.56', fetchedAt: NOW };
  assert.equal(isFresh(s, '25.03,121.56', NOW + FRESH_MS - 1), true);
  assert.equal(isFresh(s, '25.03,121.56', NOW + FRESH_MS + 1), false);
  assert.equal(isFresh(s, '25.04,121.56', NOW), false);
  assert.equal(isFresh({}, '25.03,121.56', NOW), false);
});

test('the device state survives bad storage', () => {
  const st = memStore();
  assert.deepEqual(loadState(st), {});
  saveState(st, { cell: 'x' });
  assert.deepEqual(loadState(st), { cell: 'x' });
  st.setItem('orbit-weather:v1', '{bad');
  assert.deepEqual(loadState(st), {});
  assert.deepEqual(loadState(null), {});
  const throwing = { getItem() { throw new Error('private mode'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadState(throwing), {});
  saveState(throwing, {});
});

test('position and permission, whatever the browser does', async () => {
  const ok = { geolocation: { getCurrentPosition: (yes, no, opts) => (assert.equal(opts.enableHighAccuracy, false), yes({ coords: { latitude: 25, longitude: 121.5 } })) } };
  assert.deepEqual(await getPosition(ok), { lat: 25, lon: 121.5 });
  const denied = { geolocation: { getCurrentPosition: (yes, no) => no({ code: 1 }) } };
  assert.deepEqual(await getPosition(denied), { error: 'denied' });
  const slow = { geolocation: { getCurrentPosition: (yes, no) => no({ code: 3 }) } };
  assert.deepEqual(await getPosition(slow), { error: 'timeout' });
  assert.deepEqual(await getPosition({}), { error: 'unsupported' });
  assert.equal(await permissionState({ permissions: { query: async () => ({ state: 'granted' }) } }), 'granted');
  assert.equal(await permissionState({ permissions: { query: async () => { throw new TypeError('no'); } } }), 'unknown');
  assert.equal(await permissionState({}), 'unknown');
});

test('fetching: by place or by network', async () => {
  const urls = [];
  const f = async url => (urls.push(url), { ok: true, json: async () => ({ ok: 1 }) });
  await fetchForecast({ lat: 25.03412, lon: 121.56456 }, f, 'https://p');
  await fetchForecast({ auto: true }, f, 'https://p');
  assert.deepEqual(urls, ['https://p/weather?lat=25.0341&lon=121.5646', 'https://p/weather?auto=1']);
  await assert.rejects(fetchForecast({ auto: true }, async () => ({ ok: false, status: 429 }), 'https://p'), e => e.status === 429);
  assert.equal(placeName({ place: { town: '信義區' } }, {}), '信義區');
  assert.equal(placeName({ place: null, located: { city: 'Tokyo' } }, {}), 'Tokyo');
  assert.equal(placeName({}, { pick: { town: '大安區' } }), '大安區');
});

const hours = Array.from({ length: 48 }, (_, i) => ({
  t: Date.parse('2026-10-02T11:00:00Z') + i * 3_600_000,
  temp: 25 + Math.sin(i / 4) * 3,
  feels: 27 + Math.sin(i / 4) * 3,
  uv: i % 24 > 14 && i % 24 < 20 ? 6 : 0,
  pop: i === 5 ? 70 : 10,
  day: i % 24 > 10 && i % 24 < 23,
  condition: { code: 'CLOUDY', text: '陰' },
  wind: { dir: 70, speed: 10, gust: 20 },
  humidity: 90
}));

test('the curve: a column an hour, a tap target each, now marked', () => {
  const { svg, width } = curveSvg(hours, { now: NOW, tz: 'Asia/Taipei' });
  assert.equal(width, 48 * COL);
  assert.equal((svg.match(/class="hit"/g) || []).length, 48);
  assert.match(svg, /class="now"/);
  assert.match(svg, /現在/);
  assert.match(svg, />70%</);
  assert.ok((svg.match(/class="uv"/g) || []).length > 0);
  assert.ok((svg.match(/class="night"/g) || []).length > 0);
  assert.equal(curveSvg([], {}).svg, '');
  const flat = tempScale([{ temp: 25, feels: 25 }]);
  assert.ok(flat.hi - flat.lo >= 6);
  assert.equal(linePath([{ x: 0, y: 1 }, { x: 10, y: null }, { x: 20, y: 3 }]), 'M0,1M20,3');
});

test('labels in Taipei time and Taiwan levels', () => {
  assert.equal(clock(NOW, 'Asia/Taipei'), '19:46');
  assert.equal(dateOf(Date.parse('2026-10-02T16:30:00Z'), 'Asia/Taipei'), '2026-10-03');
  assert.equal(dayLabel('2026-10-02', NOW), '今天');
  assert.equal(dayLabel('2026-10-03', NOW), '明天');
  assert.equal(dayLabel('2026-10-05', NOW), '週一');
  assert.deepEqual([0, 3, 6, 8, 11].map(uvLevel), ['低', '中', '高', '過量', '危險']);
  assert.equal(windDir(71), '東風');
  assert.equal(windDir(0), '北風');
  assert.equal(beaufort(10), 2);
  assert.equal(conditionIcon('CLEAR', '', false), '🌙');
  assert.equal(conditionIcon(null, '短暫陣雨'), '🌧️');
  assert.equal(conditionIcon('SCATTERED_THUNDERSTORMS'), '⛈️');
  assert.equal(theme({ code: 'LIGHT_RAIN' }, true), 'rain');
  assert.equal(theme({ code: 'CLEAR' }, false), 'night');
  assert.equal(escapeHtml('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
  assert.equal(ago(NOW - 5 * 60_000, NOW), '5 分鐘前');
  assert.deepEqual(moonPhase('FULL_MOON'), ['滿月', '🌕']);
});

test('sunrise and sunset worked out match the forecast within minutes', () => {
  // Google's for Taipei 101 on 2026-10-03: 05:46:28 and 17:38:55.
  const s = sunTimes('2026-10-03', 25.034, 121.565);
  assert.ok(Math.abs(s.sunrise - 1790977588378) < 3 * 60_000, clock(s.sunrise));
  assert.ok(Math.abs(s.sunset - 1791020335951) < 3 * 60_000, clock(s.sunset));
  assert.equal(sunProgress(s, s.sunrise - 1), null);
  assert.equal(sunProgress(s, s.sunset), 1);
  assert.equal(sunTimes('2026-06-21', 89, 0), null);
});

// A forecast as /weather answers it (the shape from Shared-Proxy's weather.js).
const forecast = {
  cell: '25.03,121.57', at: NOW - 120_000, tz: 'Asia/Taipei', lat: 25.03, lon: 121.57, partial: false,
  place: { county: '臺北市', town: '信義區' }, located: { by: 'device' },
  now: { temp: 27.7, feels: 27, humidity: 94, uv: 0, day: false, condition: { code: 'CLOUDY', text: '陰' }, wind: { dir: 71, speed: 10, gust: 21 }, pressure: 1016, rain1h: 3, rainToday: 3 },
  hours,
  days: Array.from({ length: 10 }, (_, i) => ({ date: dateOf(NOW + i * 86_400_000), hi: 30 - i % 3, lo: 23, pop: i * 10, uvMax: 5, day: { condition: { code: 'PARTLY_CLOUDY', text: '局部多雲' }, pop: 20 }, night: { condition: { code: 'LIGHT_RAIN', text: '小雨' }, pop: 30 }, sunrise: Date.parse('2026-10-01T21:46:00Z') + i * 86_400_000, sunset: Date.parse('2026-10-02T09:40:00Z') + i * 86_400_000, moon: { phase: 'WANING_GIBBOUS' } })),
  air: { aqi: 39, level: '良好', pm25: 7, pm10: 12, station: { name: '松山', km: 2.2 }, forecast: { tomorrow: { aqi: 55, level: '普通' } } },
  alerts: [{ title: '大雨特報', from: NOW - 3_600_000, to: NOW + 3_600_000 }],
  advice: [{ kind: 'umbrella', level: 'maybe', text: '可帶摺疊傘：13:00 降雨機率 41%' }, { kind: 'week', level: 'info', text: '本週最佳：10-07' }]
};

test('the screen: every card, one truth, nothing unescaped', () => {
  const html = [
    todayCard(forecast, { place: '信義區<script>', now: NOW }),
    curveCard(forecast, { now: NOW, lat: 25.03, lon: 121.57 }),
    daysCard(forecast, { now: NOW, open: forecast.days[1].date }),
    airCard(forecast),
    sunCard(forecast, { now: NOW, lat: 25.03, lon: 121.57 }),
    extrasCard(forecast)
  ].join('');
  assert.match(html, /28°/);
  assert.match(html, /大雨特報/);
  assert.match(html, /可帶摺疊傘|13:00 降雨機率 41%/);
  assert.match(html, /松山測站/);
  assert.match(html, /黃金時刻/);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /day-detail/);
  for (const w of ['Google', 'CWA', '氣象署', 'MOENV', '環境部']) assert.ok(!html.includes(w), w);
});

test('night: the forecast flag, else the sun', () => {
  const isNight = nightTest(forecast, 25.03, 121.57);
  assert.equal(isNight({ t: NOW, day: false }), true);
  assert.equal(isNight({ t: Date.parse('2026-10-03T04:00:00Z') }), false, 'noon in Taipei');
  assert.equal(isNight({ t: Date.parse('2026-10-03T15:00:00Z') }), true, '23:00 in Taipei');
});

import { buildNotices, deviceId, needsResend, needsHomeScreen, sendNotices, DAYS } from '../public/lib/notify.mjs';
import { radarCard, settingsSheet } from '../public/lib/view.mjs';

test('notices: a brief each morning and a rain watch each day, for where the app was opened', () => {
  const now = new Date(2026, 9, 2, 19, 46).getTime(); // device time
  const items = buildNotices({ lat: 25.034123, lon: 121.565432, prefs: { brief: '06:30', rain: true }, now });
  const briefs = items.filter(x => x.kind === 'brief');
  const rains = items.filter(x => x.kind === 'rain');
  assert.equal(briefs.length, DAYS);
  assert.equal(rains.length, DAYS);
  assert.equal(new Date(briefs[0].at).getDate(), 3, 'tomorrow morning first (today is past)');
  assert.equal(new Date(briefs[0].at).getHours(), 6);
  assert.equal(new Date(briefs[0].at).getMinutes(), 30);
  assert.deepEqual(briefs[0].check, { weather: { lat: 25.0341, lon: 121.5654, kind: 'brief' } });
  assert.equal(rains[0].at, now + 60_000, 'today until 21:00 still open: from now');
  assert.equal(new Date(rains[1].at).getHours(), 7);
  assert.equal(new Date(rains[1].until).getHours(), 21);
  assert.ok(items.every((x, i) => i === 0 || items[i - 1].at <= x.at), 'in time order');
  // Morning: today's rain watch starts now, not at 07:00.
  const nine = new Date(2026, 9, 2, 9, 0).getTime();
  const r2 = buildNotices({ lat: 25, lon: 121, prefs: { rain: true }, now: nine });
  assert.equal(r2[0].at, nine + 60_000);
  assert.deepEqual(buildNotices({ lat: null, lon: 121, prefs: { rain: true }, now }), []);
  assert.deepEqual(buildNotices({ lat: 25, lon: 121, prefs: {}, now }), []);
});

test('a device id, made once', () => {
  const st = {};
  const id = deviceId(st, n => new Uint8Array(n).fill(255));
  assert.match(id, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(deviceId(st), id);
});

test('the list is sent again for a new place or after half a day', async () => {
  const now = Date.now();
  assert.equal(needsResend({ notify: { rain: true }, sentCell: 'a', sentAt: now }, 'a', now), false);
  assert.equal(needsResend({ notify: { rain: true }, sentCell: 'a', sentAt: now }, 'b', now), true);
  assert.equal(needsResend({ notify: { rain: true }, sentCell: 'a', sentAt: now - 13 * 3_600_000 }, 'a', now), true);
  assert.equal(needsResend({ notify: {} }, 'b', now), false);
  const calls = [];
  await sendNotices({ dev: 'A'.repeat(22) }, [{ at: 1 }], { base: 'https://p', fetchFn: async (u, o) => (calls.push([u, JSON.parse(o.body)]), { ok: true, json: async () => ({ ok: true }) }) });
  assert.deepEqual(calls, [[`https://p/push/schedule?dev=${'A'.repeat(22)}`, { items: [{ at: 1 }] }]]);
  assert.equal(needsHomeScreen({ navigator: { userAgent: 'iPhone', standalone: false }, matchMedia: () => ({ matches: false }) }), true);
  assert.equal(needsHomeScreen({ navigator: { userAgent: 'iPhone', standalone: true } }), false);
});

test('radar only in Taiwan, loaded only when opened; settings say what they do', () => {
  assert.equal(radarCard({ place: null }, { now: NOW }), '');
  assert.ok(!radarCard({ place: { town: 'x' } }, { now: NOW }).includes('<img'));
  assert.match(radarCard({ place: { town: 'x' } }, { now: NOW, open: true }), /CV1_TW_1000\.png\?t=\d+/);
  const s = settingsSheet({ notify: { brief: '06:30' } }, { supported: true, homeScreen: false });
  assert.match(s, /data-set="brief" checked/);
  assert.match(s, /value="06:30"/);
  assert.match(settingsSheet({}, { supported: true, homeScreen: true }), /加入主畫面/);
});

test('the headline shows when the forecast has one', () => {
  assert.match(todayCard({ ...forecast, headline: '現在陰，明天最高 28°。' }, { place: 'x', now: NOW }), /class="headline">現在陰，明天最高 28°。/);
});
