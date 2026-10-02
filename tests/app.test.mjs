// The app's logic without a browser: pins and their hours, the pass's copy,
// the notices' plan, the graphs, the page, the proxy calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPin, pinActiveAt, activePin, scheduleText, encodeData, decodeData, mergeData, emptyData, planNotices, taipeiClock, newPinId } from '../public/lib/pins.mjs';
import { uvGraph, rainGraph, airGraph, dayGraph, readout, axis, COL } from '../public/lib/graph.mjs';
import { pageHtml, airCols, rainSummary, daySheet, hoursFrom } from '../public/lib/cards.mjs';
import { cellOf, loadLocal, saveLocal, isFresh, fetchForecast, fetchWhere, placeLines, getPosition, permissionState, FRESH_MS } from '../public/lib/api.mjs';
import { clock, dateOf, dayLabel, weekday, uvLevel, windDir, conditionIcon, escapeHtml } from '../public/lib/format.mjs';
import { sunTimes } from '../public/lib/sun.mjs';

const H = 3_600_000;
const tpe = s => Date.parse(`${s}+08:00`);
const NOW = tpe('2026-10-02T19:46:00'); // a Friday evening in Taipei
const memStore = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

const school = cleanPin({ id: 'pschool', name: '學校', lat: 25.026, lon: 121.543, county: '臺北市', town: '大安區', village: '龍泉里', days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00', t: 1 });
const night = cleanPin({ id: 'pnight', name: '夜班', lat: 25, lon: 121.5, days: [5], from: '22:00', to: '06:00', t: 1 });

test('a pin is only ever a sane place in Taiwan', () => {
  assert.equal(cleanPin({ id: 'pa', lat: 35.6, lon: 139.7 }), null, 'Tokyo');
  assert.equal(cleanPin({ id: '../x', lat: 25, lon: 121 }), null);
  const p = cleanPin({ id: 'pa', name: '  ', lat: 25.0123456, lon: 121.5, days: [9, 1, 1, 3], from: '25:00' });
  assert.equal(p.name, '釘選地點');
  assert.deepEqual(p.days, [1, 3]);
  assert.equal(p.from, '07:00');
  assert.equal(p.lat, 25.01235);
  assert.match(newPinId(() => 0.5), /^p[a-z0-9]{6}$/);
});

test('which page opens: a pin inside its hours, else here', () => {
  assert.equal(pinActiveAt(school, tpe('2026-10-05T08:00:00')), true, 'Monday 8:00');
  assert.equal(pinActiveAt(school, tpe('2026-10-05T17:00:00')), false, 'until, not including, 17:00');
  assert.equal(pinActiveAt(school, tpe('2026-10-04T10:00:00')), false, 'Sunday');
  assert.equal(pinActiveAt(night, tpe('2026-10-02T23:00:00')), true, 'Friday 23:00');
  assert.equal(pinActiveAt(night, tpe('2026-10-03T05:00:00')), true, 'Saturday 05:00 is still Friday night');
  assert.equal(pinActiveAt(night, tpe('2026-10-03T07:00:00')), false);
  assert.equal(activePin([school, night], tpe('2026-10-05T09:00:00')).id, 'pschool');
  assert.equal(activePin([school, night], NOW), null, 'Friday 19:46: nowhere, the current location');
  assert.equal(activePin([], NOW), null);
  assert.equal(taipeiClock(NOW).day, 5);
  assert.equal(scheduleText(school), '週一至週五 07:00–17:00');
  assert.equal(scheduleText({ days: [] }), '不自動開啟');
  assert.equal(scheduleText({ days: [0, 6], from: '09:00', to: '12:00' }), '週末 09:00–12:00');
});

test('the pass\'s copy: encoded, read back, two copies made one', () => {
  const a = { ...emptyData(), pins: [school], t: 10 };
  const back = decodeData(encodeData(a));
  assert.deepEqual(back.pins, [school]);
  assert.equal(decodeData('junk'), null);
  assert.equal(decodeData('w1:{bad'), null);
  // b renamed school later and added the night pin; a deleted nothing.
  const b = { ...emptyData(), pins: [{ ...school, name: '高中', t: 5 }, night], brief: '07:15', t: 20 };
  const m = mergeData(a, b, NOW);
  assert.deepEqual(m.pins.map(p => p.name), ['高中', '夜班']);
  assert.equal(m.brief, '07:15', 'the newer copy\'s time');
  // A deletion newer than the pin wins, wherever it came from.
  const del = { ...a, pins: [], gone: { pschool: NOW - 1000 }, t: 30 }; // later than b's school (t 5)
  assert.deepEqual(mergeData(del, b, NOW).pins.map(p => p.id), ['pnight']);
  assert.deepEqual(mergeData(null, b, NOW), b);
});

test('notices: the brief where you\'ll be, the rain watch split by the pins\' hours', () => {
  const here = { lat: 25.034, lon: 121.565 };
  const items = planNotices({ pins: [school], brief: '07:30', here, now: NOW });
  const briefs = items.filter(x => x.kind === 'brief');
  assert.equal(briefs.length, 7);
  // Saturday's brief at home, Monday's at school (07:30 is inside 07–17).
  const sat = briefs.find(x => x.tag === 'brief:2026-10-03');
  const mon = briefs.find(x => x.tag === 'brief:2026-10-05');
  assert.equal(sat.at, tpe('2026-10-03T07:30:00'));
  assert.deepEqual(sat.check.weather, { lat: 25.034, lon: 121.565, kind: 'brief' });
  assert.equal(mon.title, '學校 今天天氣');
  assert.equal(mon.hash, 'pin=pschool');
  assert.deepEqual(mon.check.weather, { lat: 25.026, lon: 121.543, kind: 'brief' });
  // Monday's rain watch: at school 07–17, then here 17–21.
  const monRain = items.filter(x => x.kind === 'rain' && x.tag.startsWith('rain:2026-10-05'));
  assert.deepEqual(monRain.map(x => [taipeiClock(x.at).min / 60, taipeiClock(x.until).min / 60, x.check.weather.lat]), [[7, 17, 25.026], [17, 21, 25.034]]);
  // Tonight's (Friday) runs from now to 21:00 here.
  const fri = items.filter(x => x.kind === 'rain' && x.tag.startsWith('rain:2026-10-02'));
  assert.equal(fri.length, 1);
  assert.equal(fri[0].at, NOW + 60_000);
  assert.ok(items.length <= 60);
  assert.ok(items.every((x, i) => !i || items[i - 1].at <= x.at));
  assert.deepEqual(planNotices({ pins: [], here: null, now: NOW }), [], 'nowhere known: nothing');
});

// A forecast as /weather answers it (Shared-Proxy weather.js).
const hours = Array.from({ length: 240 }, (_, i) => ({
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
const days = Array.from({ length: 10 }, (_, i) => ({ date: dateOf(NOW + i * 86_400_000), hi: 30 - (i % 3), lo: 23, feelsHi: 33, feelsLo: 25, pop: i * 10, uvMax: 7, day: { condition: { code: 'PARTLY_CLOUDY', text: '局部多雲' }, pop: 20 }, night: { condition: { code: 'LIGHT_RAIN', text: '小雨' }, pop: 30 }, sunrise: tpe('2026-10-02T05:46:00') + i * 86_400_000, sunset: tpe('2026-10-02T17:40:00') + i * 86_400_000, moon: { phase: 'WANING_GIBBOUS' } }));
const forecast = {
  cell: '25.03,121.57', at: NOW - 120_000, tz: 'Asia/Taipei', lat: 25.03, lon: 121.57, partial: false,
  place: { county: '臺北市', town: '信義區' },
  now: { temp: 27.7, feels: 27, humidity: 94, uv: 0, day: false, condition: { code: 'CLOUDY', text: '陰' }, wind: { dir: 71, speed: 10, gust: 21 }, pressure: 1016, rain1h: 3, rainToday: 3, station: { name: '信義', km: 0.4, temp: 27.7, at: NOW - 40 * 60_000 } },
  hours,
  days,
  air: { aqi: 39, level: '良好', pm25: 7, pm10: 12, o3: 36, station: { name: '松山', km: 2.2 }, history: [{ t: NOW - 3 * H, aqi: 45, pm25: 9 }, { t: NOW - 2 * H, aqi: 41, pm25: 8 }, { t: NOW - H, aqi: 39, pm25: 7 }], forecast: { days: [{ date: '2026-10-02', aqi: 60, level: '普通' }, { date: '2026-10-03', aqi: 55, level: '普通' }, { date: '2026-10-04', aqi: 48, level: '良好' }] } },
  alerts: [{ title: '大雨特報', from: NOW - H, to: NOW + H }],
  headline: '現在陰，22 點前後有機會下雨（39%），明天最高 28°、最低 24°。',
  advice: [{ kind: 'umbrella', level: 'maybe', text: '可帶摺疊傘：13:00 降雨機率 41%' }, { kind: 'sun', level: '高', text: '防曬：11:00–14:00 UV 7（高）' }, { kind: 'week', level: 'info', text: '本週最佳：10/7（週三）' }]
};

test('graphs: a column an hour as far as the data goes, the date under each midnight', () => {
  const shown = hoursFrom(forecast, NOW);
  assert.equal(shown.length, 240);
  const uv = uvGraph(shown, { tz: 'Asia/Taipei', now: NOW });
  assert.equal((uv.match(/class="g-hit"/g) || []).length, 240);
  assert.match(uv, new RegExp(`width="${240 * COL}"`));
  // The first column's date, then each midnight's (10 more), and each noon's.
  assert.equal((uv.match(/class="g-date"/g) || []).length, 11);
  assert.equal((uv.match(/class="g-date g-noon"/g) || []).length, 10);
  assert.match(uv, />10\/2 週五</);
  assert.match(uv, />10\/3 週六</);
  const rain = rainGraph(shown, { tz: 'Asia/Taipei', now: NOW });
  assert.match(rain, />70</);
  assert.match(rain, />2\.4</, 'the amount under the bar');
  const cols = airCols(forecast, NOW);
  assert.deepEqual(cols.map(c => c.forecast ? c.label : c.aqi), [45, 41, 39, '今天', '明天', '週日']);
  const air = airGraph(cols, { tz: 'Asia/Taipei', now: NOW });
  assert.equal((air.match(/class="g-hit"/g) || []).length, 6);
  assert.match(air, />預測 →</);
  assert.match(air, /g-date[^>]*>10\/2 週五/, 'three hours measured: room for the date');
  const one = airGraph([cols[2], ...cols.slice(3)], { tz: 'Asia/Taipei', now: NOW });
  assert.ok(!/g-date[^>]*>10\/2 週五/.test(one), 'one hour measured: no date squeezed in before the forecast');
  assert.equal(readout('rain', shown[5], 'Asia/Taipei'), '10/3 週六 00:00 · 降雨機率 70% · 2.4 mm');
  assert.equal(readout('air', cols[4], 'Asia/Taipei'), '明天（預測） · AQI 55');
  assert.equal(readout('uv', null), '');
  const day = dayGraph(shown.filter(h => dateOf(h.t) === '2026-10-03'), { tz: 'Asia/Taipei', aqi: [] });
  assert.match(day, /g-temp/);
  assert.match(day, /g-feels/);
  assert.match(axis([{ t: tpe('2026-10-03T00:00:00') }], { tz: 'Asia/Taipei', y: 100 }), /0時/);
});

test('the page, top to bottom, one truth, nothing unescaped', () => {
  const page = { key: 'here', pin: null, place: { county: '臺北市', town: '信義區', village: '西村里<b>' }, lat: 25.034, lon: 121.565 };
  const html = pageHtml(forecast, page, { now: NOW });
  const order = ['wx-top', ' uv"', ' rain"', ' air"', '建議', '10 天預報', '更多資訊'].map(k => html.indexOf(k.includes('"') ? `wx-card${k.slice(0, -1)}` : k));
  assert.ok(order.every(i => i >= 0), JSON.stringify(order));
  assert.ok(order.every((x, i) => !i || order[i - 1] < x), 'in the asked order');
  assert.match(html, /信義區 西村里&lt;b&gt;/);
  assert.match(html, /最高<\/span><b>30°<\/b><small>體感 33°/);
  assert.match(html, /大雨特報/);
  assert.match(html, /現在陰，22 點前後/);
  assert.ok(!html.includes('西村里<b>'), 'the name escaped everywhere');
  for (const w of ['Google', 'CWA', '氣象署', 'MOENV', '環境部', 'radar', '雷達']) assert.ok(!html.includes(w), w);
  // A pin's page: its name first, its hours.
  const pinPage = pageHtml(forecast, { key: 'pschool', pin: school, place: { county: '臺北市', town: '大安區', village: '龍泉里' } }, { now: NOW });
  assert.match(pinPage, /📌 學校/);
  assert.match(pinPage, /週一至週五 07:00–17:00/);
  // No forecast yet: the top and a spinner, or the error with a retry.
  assert.match(pageHtml(null, page, { now: NOW }), /正在取得天氣/);
  assert.match(pageHtml(null, { ...page, error: '暫時無法取得天氣' }, { now: NOW }), /data-act="retry"/);
  assert.match(rainSummary(hours, 'Asia/Taipei', NOW), /^明天 00:00 起可能下雨（70%）$/);
});

test('a day\'s sheet: its numbers, and its graph with everything on it', () => {
  const html = daySheet(forecast, '2026-10-03', { now: NOW, lat: 25.03, lon: 121.57 });
  assert.match(html, /明天 10\/3 週六/);
  assert.match(html, /day-graph/);
  assert.match(html, /空氣（預測）/);
  assert.match(html, /日出 \/ 日落/);
  assert.match(daySheet({ ...forecast, hours: [] }, '2026-10-09', { now: NOW }), /沒有逐時資料/);
});

test('proxy calls carry the session; the device keeps a few places', async () => {
  const urls = [];
  const f = async u => (urls.push(u), { ok: true, json: async () => ({}) });
  await fetchForecast({ lat: 25.03412, lon: 121.56456 }, 'TOKEN', f);
  await fetchForecast({ auto: true }, 'T', f);
  await fetchWhere(25.034123, 121.565432, 'T', f);
  assert.deepEqual(urls.map(u => u.replace('https://orbit-workers-proxy.pengzjay.workers.dev', '')), ['/weather?lat=25.0341&lon=121.5646&qt=TOKEN', '/weather?auto=1&qt=T', '/weather/where?lat=25.03412&lon=121.56543&qt=T']);
  await assert.rejects(fetchForecast({ auto: true }, 'T', async () => ({ ok: false, status: 401 })), e => e.status === 401);
  const st = memStore();
  const local = { forecasts: {} };
  for (let i = 0; i < 9; i++) local.forecasts[`c${i}`] = { at: i, f: {} };
  saveLocal(local, st);
  assert.equal(Object.keys(loadLocal(st).forecasts).length, 6);
  assert.deepEqual(Object.keys(loadLocal(st).forecasts).sort(), ['c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
  st.setItem('orbit-weather.v2', '{bad');
  assert.deepEqual(loadLocal(st), { forecasts: {} });
  assert.equal(isFresh({ at: NOW }, NOW + FRESH_MS - 1), true);
  assert.equal(isFresh({ at: NOW }, NOW + FRESH_MS + 1), false);
  assert.equal(cellOf(25.0339, 121.5645), '25.03,121.56');
  assert.deepEqual(placeLines({ county: '臺北市', town: '信義區', village: '西村里' }), { main: '信義區 西村里', sub: '臺北市' });
  assert.deepEqual(placeLines(null), { main: '', sub: '' });
});

test('position and permission, whatever the browser does', async () => {
  const ok = { geolocation: { getCurrentPosition: (yes, no, o) => (assert.equal(o.enableHighAccuracy, true), yes({ coords: { latitude: 25, longitude: 121.5, accuracy: 30 } })) } };
  assert.deepEqual(await getPosition(ok), { lat: 25, lon: 121.5, acc: 30 });
  assert.deepEqual(await getPosition({ geolocation: { getCurrentPosition: (y, n) => n({ code: 1 }) } }), { error: 'denied' });
  assert.deepEqual(await getPosition({}), { error: 'unsupported' });
  assert.equal(await permissionState({ permissions: { query: async () => ({ state: 'granted' }) } }), 'granted');
  assert.equal(await permissionState({}), 'unknown');
});

test('labels in Taipei time and Taiwan levels; the sun worked out', () => {
  assert.equal(clock(NOW, 'Asia/Taipei'), '19:46');
  assert.equal(dayLabel('2026-10-03', NOW), '明天');
  assert.equal(weekday('2026-10-05'), '週一');
  assert.deepEqual([0, 3, 6, 8, 11].map(uvLevel), ['低', '中', '高', '過量', '危險']);
  assert.equal(windDir(71), '東風');
  assert.equal(conditionIcon('CLEAR', '', false), '🌙');
  assert.equal(escapeHtml('<a>'), '&lt;a&gt;');
  const s = sunTimes('2026-10-03', 25.034, 121.565);
  assert.ok(Math.abs(s.sunrise - 1790977588378) < 3 * 60_000);
});
