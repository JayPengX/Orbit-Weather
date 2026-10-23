// The app's logic without a browser: pins and their hours, the pass's copy,
// the notices' plan, the graphs, the page, the proxy calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPin, pinActiveAt, activePin, scheduleText, encodeData, decodeData, mergeData, emptyData, planNotices, taipeiClock, newPinId } from '../public/lib/pins.mjs';
import { uvGraph, rainGraph, airGraph, dayCharts, readout, CHART_W } from '../public/lib/graph.mjs';
import { nowHtml, weekHtml, adviceSheet, airCols, airCard, rainCard, rainSummary, daySheet, dayTips, hoursFrom, colsFor, uvCols, uvDays, daysCols, metricSheet, adviceCards, offGroups, dayOffSec } from '../public/lib/cards.mjs';
import { cellOf, loadLocal, saveLocal, isFresh, fetchForecast, fetchWhere, placeLines, getPosition, permissionState, FRESH_MS, RECHECK_MS, dataAge } from '../public/lib/api.mjs';
import { clock, dateOf, dayLabel, weekday, uvLevel, windDir, conditionKind } from '../public/lib/format.mjs';
import { sunTimes } from '../public/lib/sun.mjs';

import { H, tpe, NOW, hours, forecast } from './fixture.mjs';
// A place's two tabs, 今天 then 預報, as one page of text.
const pageHtml = (f, page, opts) => nowHtml(f, page, opts) + weekHtml(f, page, opts);
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

test('charts: fitted to the card (no sideways scroll), the tabs\' ranges', () => {
  const shown = hoursFrom(forecast, NOW);
  // Day tabs: at 19:46, 今晚 runs to 07:00 (the night and the way out); 明天 is all of Saturday.
  const r24 = colsFor('rain', forecast, NOW, 'd0');
  assert.equal(r24.length, 12, '19:00 to 06:00');
  assert.equal(dateOf(r24[r24.length - 1].t), '2026-10-03');
  const tomorrow = colsFor('rain', forecast, NOW, 'd1');
  assert.equal(tomorrow.length, 24);
  assert.equal(tomorrow[0].t, tpe('2026-10-03T00:00:00'));
  assert.equal(colsFor('rain', forecast, tpe('2026-10-03T11:20:00'), 'd0').length, 13, 'by day: now to midnight');
  assert.equal(colsFor('rain', forecast, NOW, '24').length, 12, 'an old saved tab (24 小時) opens 今晚');
  assert.match(rainCard(forecast, { now: NOW, ranges: {} }), />今晚<[^]*>明天<[^]*>10 天</);
  assert.match(rainCard(forecast, { now: tpe('2026-10-03T11:20:00'), ranges: {} }), />今天</);
  assert.ok(!rainCard(forecast, { now: NOW, ranges: { rain: 'd1' } }).includes('>現在<'), 'tomorrow starts at 0時, not 現在');
  const rain = rainGraph(r24, { tz: 'Asia/Taipei' });
  assert.equal((rain.match(/<svg/g) || []).length, 1);
  assert.match(rain, new RegExp(`viewBox="0 0 ${CHART_W} `), 'a fixed width, scaled to the card');
  assert.ok(!/width="\d{4}/.test(rain), 'nothing thousands of pixels wide');
  assert.equal((rain.match(/class="ch-bar"/g) || []).length, 12, 'a bar an hour');
  assert.match(rain, /data-pw="310"[^]*class="ch-ax" x="340"[^>]*>100%</, 'the scale in the gutter beside the plot');
  for (const [, x] of rain.matchAll(/class="ch-val" x="([\d.]+)"/g)) assert.ok(Number(x) <= 310, 'labels inside the plot');
  // Two dry days: no graph, the words.
  const dryCols = r24.map(h => ({ ...h, pop: 0, mm: 0 }));
  assert.match(rainGraph(dryCols, { tz: 'Asia/Taipei' }), /class="wx-dry"[^]*不會下雨/);
  assert.ok(!rainGraph(dryCols, { tz: 'Asia/Taipei' }).includes('<svg class="ch"'));
  assert.match(uvGraph(colsFor('uv', forecast, NOW + 12 * H, 'd0'), { tz: 'Asia/Taipei', now: NOW + 12 * H }), /class="ch-area"[^]*mask=/, 'UV: a line, its fill fading');
  assert.match(rain, />70%</, 'the peak labelled');
  assert.match(rain, /class="ch-bar" d="[^"]*" fill="#a9d3fb"/, 'a dry hour pale');
  assert.ok(!rain.includes('fill="#a9d3fb"/><text class="ch-val" x="142'), 'the wet hour deeper: coloured by its amount');
  assert.match(rain, />現在</);
  assert.match(rain, />10\/3 週六</, 'the date at the day change');
  // 10 days: a bar each.
  const d10 = colsFor('rain', forecast, NOW, '10d');
  assert.equal(d10.length, 10);
  assert.equal((rainGraph(d10, { tz: 'Asia/Taipei', daily: true }).match(/class="ch-bar"/g) || []).length, 10);
  // A missing value: no bar there; a line breaks.
  const gap = rainGraph(shown.slice(5, 11).map((h, i) => ({ ...h, pop: i === 3 ? null : h.pop })), { tz: 'Asia/Taipei' });
  assert.equal((gap.match(/class="ch-bar"/g) || []).length, 5);
  const uvGap = uvGraph(colsFor('uv', forecast, NOW, 'd0').map((h, i) => ({ ...h, uv: i === 5 ? null : h.uv })), { tz: 'Asia/Taipei', now: NOW });
  assert.equal((uvGap.match(/class="ch-line"/g) || []).length, 2);
  // UV: the next daylight day, the one after, or the 10 days' peaks.
  const days = uvDays(forecast, NOW);
  assert.equal(days[0].date, '2026-10-03', 'tonight: tomorrow\'s daylight first');
  assert.equal(colsFor('uv', forecast, NOW, 'd0').length, 13);
  assert.equal(colsFor('uv', forecast, NOW, 'd1')[0].t, tpe('2026-10-04T06:00:00'));
  assert.match(uvGraph(colsFor('uv', forecast, NOW, 'd0'), { tz: 'Asia/Taipei', now: NOW }), />7</);
  assert.equal(uvCols(shown, 'Asia/Taipei').length % 13, 0);
  // Air: now, then the forecast days; no history.
  const cols = airCols(forecast, NOW);
  assert.deepEqual(cols.map(c => c.label), ['現在', '今天', '明天', '週日']);
  assert.equal((airGraph(cols, { tz: 'Asia/Taipei' }).match(/class="ch-bar"/g) || []).length, 4);
  // Its hourly forecast, where there is one: 今晚 / 明天 as a line, 每天 as the bars.
  assert.equal(airCard(forecast, { now: NOW }).includes('data-range="air:'), false, 'no hours: the days alone, no tabs');
  const withHours = { ...forecast, air: { ...forecast.air, hourly: Array.from({ length: 60 }, (_, i) => ({ t: tpe('2026-10-02T19:00:00') + i * H, aqi: 40 + i, pm25: 8 })) } };
  assert.match(airCard(withHours, { now: NOW, ranges: {} }), />今晚<[^]*>明天<[^]*>每天</);
  assert.equal(colsFor('air', withHours, NOW, 'd1').length, 24);
  assert.match(airCard(withHours, { now: NOW, ranges: {} }), /class="ch-line"/);
  assert.equal((airCard(withHours, { now: NOW, ranges: { air: 'days' } }).match(/class="ch-bar"/g) || []).length, 4);
  assert.equal(readout('rain', shown[5], 'Asia/Taipei'), '週六 00:00 · 70% · 2.4 mm');
  assert.equal(readout('rain', { ...shown[5], place: '學校' }, 'Asia/Taipei'), '週六 00:00 · 學校 · 70% · 2.4 mm');
  assert.equal(readout('air', cols[2], 'Asia/Taipei'), '明天 10/3 · AQI 55 普通');
  assert.equal(readout('uv', daysCols(forecast, NOW)[1], 'Asia/Taipei'), '明天 10/3 · UV 7');
  assert.equal(readout('uv', null), '');
  const day = dayCharts(shown.filter(h => dateOf(h.t) === '2026-10-03'), { tz: 'Asia/Taipei', aqi: [] });
  assert.match(day, /class="ch-tline"/);
  assert.match(day, /最高 \d+°/, 'the day\'s high and low marked');
  assert.equal((day.match(/<svg class="ch/g) || []).length, 3, 'temperature, rain, UV');
  assert.match(day, /<i class="ch-xh" hidden>/, 'no crosshair until a finger is on it');
  // One frame: the scale in a gutter on the right, the lines never under it.
  assert.match(day, /data-pw="310"/);
  for (const [, x] of day.matchAll(/class="ch-val ch-big" x="([\d.]+)"/g)) assert.ok(Number(x) <= 310, 'the high and low inside the plot, never under the scale');
  // A dry day: no rain chart, the header says so.
  const dryHours = shown.filter(h => dateOf(h.t) === '2026-10-04').map(h => ({ ...h, pop: 0, mm: 0 }));
  const dry = dayCharts(dryHours, { tz: 'Asia/Taipei' });
  assert.ok(!dry.includes('ch-dayrain'), 'no flat line at 0%');
  assert.match(dry, /不會下雨/);
  assert.match(dayCharts(dryHours.map((h, i) => ({ ...h, pop: i === 3 ? 5 : 0 })), { tz: 'Asia/Taipei' }), /最高 5%/);
});

test('the page, top to bottom, one truth, nothing unescaped', () => {
  const page = { key: 'here', pin: null, place: { county: '臺北市', town: '信義區<b>', village: '西村里' }, lat: 25.034, lon: 121.565 };
  const html = pageHtml(forecast, page, { now: NOW });
  // 今天: the sky, the days, the panels, the advice (预報 has the indicators and the days again). 更多資訊 is today's sheet's.
  const order = ['wx-hero', '10 天預報', 'data-metric="rain"', 'data-metric="uv"', 'data-metric="air"', '建議'].map(k => html.indexOf(k));
  assert.ok(!html.includes('更多資訊'), 'the details are in today\'s sheet');
  assert.ok(!html.includes('<svg class="ch"'), 'no big graphs on the page: small cards, the graph in a sheet');
  assert.equal((html.match(/class="wx-spark"/g) || []).length, 6);
  assert.ok(order.every(i => i >= 0), JSON.stringify(order));
  assert.ok(order.every((x, i) => !i || order[i - 1] < x), 'in the asked order');
  assert.match(html, /信義區&#60;b&#62;/);
  assert.ok(!html.includes('西村里'), 'no 村里 anywhere');
  assert.match(html, /最高 <b>30°<\/b>[^]*最低 <b>23°<\/b>/);
  assert.match(html, /體感 <b>27°<\/b>/);
  assert.match(html, /濕度[^]*?94<small>%<\/small>/, 'humidity is a stat card');
  assert.doesNotMatch(html, /wx-say/, 'no sentence over the hours: the cards say it');
  // No warning banner (the owner, 2026-10-10: rarely useful, and in the way).
  assert.doesNotMatch(html, /大雨特報|wx-alert/);
  // Advice: today, and the week with a mark a day.
  // Advice: the day's tiles (tomorrow's in the evening), then the week's table.
  assert.match(html, /明天的建議/, 'in the evening, the advice is for tomorrow');
  assert.match(html, /k-umbrella"><span class="q-tile wx-life-icon"[^>]*><svg class="wx-g"[^]*?<\/svg><\/span><span class="q-ritem-text"><span class="q-ritem-title">雨傘<\/span><small>13:00 降雨機率 41%<\/small>/);
  const first = html.split('<div class="q-rowcard wx-lifegrid">')[1].split('</div></div>')[0].split('wx-life lv-').length - 1;
  assert.ok(first <= 4, 'four tiles at most, the rest behind 更多建議');
  const many = adviceCards({ ...forecast, advice: Array.from({ length: 7 }, (_, i) => ({ kind: ['umbrella', 'wear', 'sun', 'run', 'laundry', 'sleep', 'thunder'][i], level: i === 6 ? 'yes' : 'none', text: `x：${i}` })) }, { now: NOW });
  assert.match(many, /data-act="advice"[^>]*>全部</, 'the rest behind 全部');
  assert.equal((adviceSheet({ ...forecast, advice: Array.from({ length: 7 }, (_, i) => ({ kind: ['umbrella', 'wear', 'sun', 'run', 'laundry', 'sleep', 'thunder'][i], level: 'none', text: `x：${i}` })) }, { now: NOW }).match(/wx-life lv-/g) || []).length, 7, 'every one in its sheet');
  assert.ok(many.indexOf('k-thunder') < many.indexOf('k-umbrella'), 'a warning first');
  assert.ok(!/wx-weekgrid/.test(html), 'no week table: each day\'s advice is in its sheet');
  // The top opens today; under it the next 24 hours, every 3.
  assert.match(html, /<section class="wx-hero [^"]*" role="button" tabindex="0" data-day="2026-10-02" data-page="here"/);
  assert.equal((html.match(/class="wx-hr[ "]/g) || []).length, 8);
  assert.match(html, /<span class="wx-hr-t">現在<\/span>/);
  assert.match(html, /is-newday"[^]*?<span class="wx-hr-t">明天1時<\/span>/, 'the new day named');
  // The app's own pictures, never emoji.
  assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'no emoji: ' + (html.match(/\p{Extended_Pictographic}/u) || [])[0]);
  // The 10 days: each day's rain chance.
  assert.equal((html.match(/class="wx-dpop"/g) || []).length, 20);
  assert.ok(!html.includes('西村里<b>'), 'the name escaped everywhere');
  for (const w of ['Google', 'CWA', '氣象署', 'MOENV', '環境部', 'radar', '雷達']) assert.ok(!html.includes(w), w);
  // A pin's page: its name first, its hours.
  const pinPage = pageHtml(forecast, { key: 'pschool', pin: school, place: { county: '臺北市', town: '大安區', village: '龍泉里' } }, { now: NOW });
  assert.match(pinPage, /class="wx-title"[^>]*><span>學校<\/span>/);
  assert.match(pinPage, /class="wx-eyebrow"><svg class="wx-g"[^]*?<span>大安區 · 臺北市<\/span>/);
  // No forecast yet: the top and a spinner, or the error with a retry.
  assert.match(pageHtml(null, page, { now: NOW }), /正在取得天氣/);
  assert.match(pageHtml(null, { ...page, error: '暫時無法取得天氣' }, { now: NOW }), /data-act="retry"/);
  assert.equal(rainSummary(hours, 'Asia/Taipei', NOW), '明天 0時起 70%');
});

test('a day\'s sheet: its numbers, its charts, its own advice', () => {
  const html = daySheet(forecast, '2026-10-03', { now: NOW, lat: 25.03, lon: 121.57 });
  assert.match(html, /明天 10\/3 週六/);
  assert.match(html, /ch-daytemp/);
  assert.match(html, /<b>全天<\/b>/, 'the day\'s summary until a finger reads an hour');
  assert.match(html, /這天的建議/);
  assert.match(html, /k-umbrella/);
  assert.match(html, /k-run/);
  assert.match(html, /k-laundry/);
  assert.match(html, /日出 \/ 日落/);
  assert.match(daySheet({ ...forecast, hours: [] }, '2026-10-09', { now: NOW }), /沒有逐時預報/);
  // The day's advice from its own hours.
  const tips = Object.fromEntries(dayTips(forecast, '2026-10-03', NOW).map(t => [t.k, t]));
  assert.equal(tips.umbrella.text, '不用帶', 'the 70% is at midnight, not in the day');
  assert.match(tips.run.text, /^\d+–\d+時 \d+°$/);
  assert.match(tips.sun.text, /UV 7$/);
  assert.equal(tips.laundry.text, '適合', '10%, partly cloudy');
});

test('the forecast in lines: the first answer at once, the whole one when it comes on the same request', async () => {
  const enc = new TextEncoder();
  let push;
  const body = new ReadableStream({ start: c => (push = c) });
  const res = new Response(body, { status: 200 });
  const asked = fetchForecast({ lat: 25.03, lon: 121.56 }, 'T', async () => res);
  push.enqueue(enc.encode('{"at":1,"more":true,"hours":[1]}\n{"at":2,'));
  const { f, rest } = await asked;
  assert.deepEqual(f, { at: 1, more: true, hours: [1] });
  let whole = null;
  rest.then(g => (whole = g));
  await new Promise(r => setTimeout(r, 10));
  assert.equal(whole, null, 'not before it has come');
  push.enqueue(enc.encode('"hours":[1,2]}\n'));
  push.close();
  assert.deepEqual(await rest, { at: 2, hours: [1, 2] });
  // A proxy that sends one answer (no line after it): no rest.
  const one = await fetchForecast({ auto: true }, 'T', async () => new Response('{"at":3}'));
  assert.deepEqual(one.f, { at: 3 });
  assert.equal(await one.rest, null);
});

test('proxy calls carry the session; the device keeps a few places', async () => {
  const urls = [];
  const f = async u => (urls.push(u), { ok: true, json: async () => ({}) });
  await fetchForecast({ lat: 25.03412, lon: 121.56456 }, 'TOKEN', f);
  await fetchForecast({ auto: true }, 'T', f);
  await fetchWhere(25.034123, 121.565432, 'T', f);
  assert.deepEqual(urls.map(u => u.replace('https://orbit-workers-proxy.pengzjay.workers.dev', '')), ['/weather?lat=25.0341&lon=121.5646&lines=1&qt=TOKEN', '/weather?auto=1&lines=1&qt=T', '/weather/where?lat=25.03412&lon=121.56543&qt=T']);
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
  // Freshness is the numbers' age: an old copy the proxy was refreshing isn't fresh…
  assert.equal(dataAge({ at: NOW, f: { at: NOW - 2 * 3_600_000 } }, NOW), 2 * 3_600_000);
  assert.equal(isFresh({ at: NOW, f: { at: NOW - 2 * 3_600_000 } }, NOW + RECHECK_MS + 1), false);
  // …but isn't asked for again within RECHECK_MS.
  assert.equal(isFresh({ at: NOW, f: { at: NOW - 2 * 3_600_000 } }, NOW + RECHECK_MS - 1), true);
  assert.equal(cellOf(25.0339, 121.5645), '25.03,121.56');
  assert.deepEqual(placeLines({ county: '臺北市', town: '信義區', village: '西村里' }), { main: '信義區', sub: '臺北市' }, 'no 村里, even from an old copy');
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
  assert.equal(conditionKind('CLEAR', '', false), 'clear-night');
  const s = sunTimes('2026-10-03', 25.034, 121.565);
  assert.ok(Math.abs(s.sunrise - 1790977588378) < 3 * 60_000);
});

test('the cards: the owner\'s order and the hidden ones, kept on the pass, the newer copy wins', () => {
  const d = { ...emptyData(), t: 5, cards: ['days', 'metrics', 'nonsense'], hidden: ['info', 'bogus'] };
  const back = decodeData(encodeData(d));
  assert.deepEqual(back.cards, ['days', 'metrics', 'advice', 'info'], 'unknown dropped, missing ones added at the end');
  assert.deepEqual(back.hidden, ['info']);
  assert.deepEqual(decodeData('w1:' + JSON.stringify({ pins: [], brief: '06:30', t: 1, gone: {} })).cards, ['metrics', 'advice', 'days', 'info']);
  const older = { ...emptyData(), t: 1 };
  assert.deepEqual(mergeData(older, back).cards, back.cards);
  assert.deepEqual(mergeData(back, older).hidden, ['info']);
  // The page follows them.
  const html = pageHtml(forecast, { key: 'here', pin: null, place: { county: '臺北市', town: '信義區' } }, { now: NOW, cards: back.cards, hidden: back.hidden });
  assert.ok(html.indexOf('10 天預報') < html.indexOf('wx-metrics'), 'days before the metrics');
  assert.ok(html.indexOf('wx-hero') < html.indexOf('10 天預報'), 'the top stays on top');
  assert.ok(!nowHtml(forecast, { key: 'here', pin: null, place: { town: '信義區' } }, { now: NOW, cards: back.cards, hidden: ['advice'] }).includes('建議'), 'advice hidden');
});

test('the day sheet: its read-out (the days around it are the app’s strip)', () => {
  const html = daySheet(forecast, '2026-10-03', { now: NOW, lat: 25.03, lon: 121.57 });
  assert.match(html, /class="wx-scrub"/);
});

// ---- 我的行程 ----
import { stitch, segments, planTips, routeForecast, adviceSpan } from '../public/lib/plan.mjs';
import { placeAt } from '../public/lib/pins.mjs';

test('my route: each hour from where I am — school on weekdays 07–17, home otherwise', () => {
  const home = cleanPin({ id: 'phome', name: '家', lat: 25.03, lon: 121.56, county: '臺北市', town: '信義區', days: [], home: true });
  const sch = cleanPin({ id: 'pschool2', name: '學校', lat: 24.8, lon: 120.97, county: '新竹市', town: '東區', days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00' });
  const pins = [home, sch];
  assert.equal(home.home, true);
  // Monday 10/5 09:00 at school; Saturday at home; Monday 18:00 home.
  assert.equal(placeAt(pins, tpe('2026-10-05T09:00:00')).id, 'pschool2');
  assert.equal(placeAt(pins, tpe('2026-10-03T09:00:00')).id, 'phome');
  assert.equal(placeAt(pins, tpe('2026-10-05T18:00:00')).id, 'phome');
  assert.equal(placeAt([sch], tpe('2026-10-05T18:00:00')), null, 'no home pin: the device\'s place');
  // Two forecasts: the school's hotter and wetter in the afternoon.
  const mk = (base, popAt) => ({ tz: 'Asia/Taipei', now: { temp: base, feels: base }, hours: Array.from({ length: 240 }, (_, i) => { const t = tpe('2026-10-02T19:00:00') + i * H; const hr = (19 + i) % 24; return { t, temp: base + (hr > 9 && hr < 16 ? 6 : 0), feels: base + (hr > 9 && hr < 16 ? 7 : 0), pop: popAt(hr), uv: hr > 9 && hr < 15 ? 6 : 0, condition: { code: 'CLOUDY', text: '陰' } }; }), days: Array.from({ length: 10 }, (_, i) => ({ date: dateOf(tpe('2026-10-02T12:00:00') + i * 86_400_000), hi: base + 6, lo: base, pop: 20, uvMax: 6, day: { condition: { code: 'CLOUDY', text: '陰' } } })) });
  const fc = { phome: mk(22, () => 10), pschool2: mk(25, hr => (hr === 15 ? 70 : 20)) };
  const forecastFor = key => fc[key] || null;
  const monday7 = tpe('2026-10-05T06:00:00');
  const list = stitch(pins, forecastFor, monday7, 16);
  assert.deepEqual(segments(list).map(s => [s.key, s.hours.length]), [['phome', 1], ['pschool2', 10], ['phome', 5]]);
  assert.equal(list[9].h.pop, 70, '15時 at school');
  const { tips, span } = planTips(pins, forecastFor, monday7);
  assert.equal(span.word, '今天');
  const k = Object.fromEntries(tips.map(t => [t.kind, t]));
  assert.equal(k.umbrella.text, '要帶，15時 70%');
  assert.match(k.wear.text, /，帶件外套$/);
  assert.equal(k.sun.text, '10時 UV 6');
  assert.deepEqual(tips.filter(t => t.kind === 'move').map(t => t.text.split('，')[0]), ['07:00 到學校', '17:00 到家']);
  assert.match(k.diff.text, /^\d+時學校熱 \d°$/);
  // After 21時: tomorrow's.
  assert.equal(adviceSpan(tpe('2026-10-05T21:30:00')).word, '明天');
  // One forecast for the route, the same shape as a city's: each hour the
  // city you're in then.
  const at10 = tpe('2026-10-05T10:00:00');
  const f = routeForecast(pins, forecastFor, at10);
  assert.equal(f.hours[0].place, '學校');
  assert.equal(f.hours[5].pop, 70, '15時 at school');
  assert.equal(f.hours.find(h => h.t === tpe('2026-10-05T18:00:00')).place, '家');
  assert.equal(f.hours.find(h => h.t === tpe('2026-10-05T18:00:00')).temp, 22);
  assert.match(f.headline, /^現在在學校；17:00 到家/);
  const monday = f.days.find(d => d.date === '2026-10-05');
  assert.deepEqual(monday.places, ['學校', '家']);
  assert.equal(monday.hi, 31, 'the high from the hours where you are');
  assert.equal(f.advice.find(a => a.kind === 'umbrella').text, '雨傘：要帶，15時 70%');
  assert.equal(f.advice.find(a => a.kind === 'umbrella').week.days.length > 0, true);
  // The regular page draws it, the route's title on top, the places on the graphs.
  const html = pageHtml(f, { key: 'plan', plan: true, pin: sch, place: { town: '東區' } }, { now: at10 });
  assert.match(html, /<span>我的行程<\/span>/);
  assert.match(html, /現在在 學校 · 東區/);
  assert.match(html, /data-metric="rain"/);
  assert.match(metricSheet('rain', f, { now: at10, key: 'plan', ranges: {} }), /class="ch-place"[^>]*>家</, 'the big graph names the city where you move');
  assert.ok(!/更多資訊/.test(html), 'not what doesn\'t matter on the move');
  assert.match(html, /學校·家/, 'a day\'s places in the 10 days');
  assert.equal(routeForecast(pins, () => null, at10), null, 'nothing until the place you\'re in has loaded');
});

test("my route follows the phone when it's elsewhere: here for now, the pins after", () => {
  const home = cleanPin({ id: 'phome', name: '家', lat: 25.03, lon: 121.56, county: '臺北市', town: '信義區', days: [], home: true });
  const sch = cleanPin({ id: 'pschool3', name: '學校', lat: 24.8, lon: 120.97, county: '新竹市', town: '東區', days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00' });
  const pins = [home, sch];
  const mk = base => ({ tz: 'Asia/Taipei', now: { temp: base }, hours: Array.from({ length: 48 }, (_, i) => ({ t: tpe('2026-10-05T00:00:00') + i * H, temp: base })), days: [] });
  const fc = { phome: mk(22), pschool3: mk(25), here: mk(30) };
  const at10 = tpe('2026-10-05T10:00:00');
  // The plan says school; the phone says somewhere else until noon.
  const f = routeForecast(pins, k => fc[k] || null, at10, { until: tpe('2026-10-05T12:00:00') });
  assert.equal(f.hours[0].place, '目前位置');
  assert.equal(f.hours[0].temp, 30);
  assert.equal(f.hours.find(h => h.t === tpe('2026-10-05T13:00:00')).place, '學校', 'the plan again after');
  assert.match(f.headline, /^現在在目前位置/);
  // Without it, the plan as before.
  assert.equal(routeForecast(pins, k => fc[k] || null, at10).hours[0].place, '學校');
});

test('notices follow the route: home outside the pins\' hours', () => {
  const home = cleanPin({ id: 'phome', name: '家', lat: 25.03, lon: 121.56, days: [], home: true });
  const sch = cleanPin({ id: 'pschool2', name: '學校', lat: 24.8, lon: 120.97, days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00' });
  const items = planNotices({ pins: [home, sch], here: { lat: 22.6, lon: 120.3 }, now: tpe('2026-10-04T12:00:00'), days: 2 });
  const brief = items.find(x => x.kind === 'brief');
  assert.equal(brief.title, '家 今天天氣', 'the brief at 06:30 Monday: home');
  assert.equal(brief.check.weather.lat, 25.03);
  const monday = items.filter(x => x.kind === 'rain' && x.tag.startsWith('rain:2026-10-05'));
  assert.deepEqual(monday.map(x => x.tag.split(':')[2]), ['pschool2', 'phome'], 'school 07–17, then home');
  assert.ok(!items.some(x => x.check.weather.lat === 22.6), 'never the device\'s place when there\'s a home');
});

test('the app\'s own pictures: a weather picture for each kind, glyphs, the moon as it is', async () => {
  const { wxArt, conditionArt, glyph, moonArt, ICON_DEFS } = await import('../public/lib/icons.mjs');
  const { conditionKind } = await import('../public/lib/format.mjs');
  assert.equal(conditionKind('THUNDERSTORM'), 'storm');
  assert.equal(conditionKind('', '陣雨'), 'rain');
  assert.equal(conditionKind('LIGHT_RAIN', '', false), 'drizzle-night');
  assert.equal(conditionKind('PARTLY_CLOUDY', '', true), 'part-day');
  assert.equal(conditionKind('CLEAR', '', false), 'clear-night');
  for (const k of ['clear-day', 'clear-night', 'part-day', 'part-night', 'cloud', 'drizzle-day', 'drizzle-night', 'rain', 'storm', 'snow', 'fog', 'wind']) {
    const svg = wxArt(k);
    assert.match(svg, /^<svg class="wx-art-i" viewBox="0 0 64 64"/, k);
    // Every gradient a picture uses is defined once for the page.
    for (const [, id] of svg.matchAll(/url\(#([\w-]+)\)/g)) assert.ok(ICON_DEFS.includes(`id="${id}"`), `${k}: ${id}`);
  }
  assert.match(conditionArt('THUNDERSTORM', ''), /wxi-bolt/);
  assert.match(glyph('umbrella'), /stroke="currentColor"/);
  assert.match(glyph('nope'), /<svg/, 'an unknown name still draws something');
  assert.match(moonArt('FULL_MOON'), /<circle cx="12" cy="12" r="9" fill="#f6e3a8"/);
  assert.ok(!/f6e3a8/.test(moonArt('NEW_MOON')), 'nothing lit at new moon');
  assert.match(moonArt('FIRST_QUARTER'), /M12 3A9 9 0 0 1 12 21/, 'the right half lit, waxing');
});

test("a weekday pin (school) is off on a national holiday: no 到學校 hours or rain watch there; an every-day pin stays", async () => {
  const { cleanPin, pinActiveAt, placeAt, planNotices, useHolidays } = await import('../public/lib/pins.mjs');
  const { twHoliday } = await import('#kit/holidays.mjs');
  const school = cleanPin({ id: 'pschool', name: '學校', lat: 24.8, lon: 121.0, days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00', t: 1 });
  const gym = cleanPin({ id: 'pgym', name: '健身房', lat: 24.81, lon: 121.01, days: [0, 1, 2, 3, 4, 5, 6], from: '07:00', to: '17:00', t: 1 });
  const fri = Date.parse('2026-10-09T10:00:00+08:00'); // 國慶日補假
  const mon = Date.parse('2026-10-12T10:00:00+08:00');
  useHolidays(date => Boolean(twHoliday(date)));
  assert.equal(pinActiveAt(school, fri), false);
  assert.equal(pinActiveAt(school, mon), true);
  assert.equal(pinActiveAt(gym, fri), true);
  assert.equal(placeAt([school], fri), null);
  const rain = planNotices({ pins: [school], now: Date.parse('2026-10-09T05:00:00+08:00'), days: 1, briefOn: false, here: { lat: 25, lon: 121.5 } }).filter(x => x.kind === 'rain');
  assert.ok(rain.every(x => !x.tag.includes('pschool')));
  useHolidays(null);
  assert.equal(pinActiveAt(school, fri), true);
});

test('a phone that would ask for its place again is left on the last one, 定位 on the page to ask', async () => {
  const { heroHtml: topArea } = await import('../public/lib/cards.mjs');
  const html = topArea(null, { page: { key: 'here', place: { county: '臺北市', town: '信義區' }, note: '上次的位置', askable: true }, now: Date.now() });
  assert.match(html, /上次的位置/);
  assert.match(html, /data-locate/);
  assert.doesNotMatch(topArea(null, { page: { key: 'here', place: { county: '臺北市', town: '信義區' } }, now: Date.now() }), /data-locate/);
});

test('an old forecast says so at the top: its now faded, 更新中 or 無法更新 in the 更新於 line', async () => {
  const { heroHtml: topArea } = await import('../public/lib/cards.mjs');
  const now = Date.parse(forecast.now?.time || '2026-10-08T12:00:00+08:00') || Date.now();
  const page = { key: 'here', place: { county: '臺北市', town: '信義區' } };
  const fresh = topArea({ ...forecast, at: now - 5 * 60_000 }, { page, now });
  assert.doesNotMatch(fresh, /wx-stale/);
  const old = topArea({ ...forecast, at: now - 2 * 3_600_000 }, { page, now });
  assert.match(old, /wx-hero[^"]*wx-old/);
  assert.match(old, /2 小時前的資料/);
  assert.match(topArea({ ...forecast, at: now - 2 * 3_600_000 }, { page: { ...page, error: 'x' }, now }), /無法更新/);
});

test('the advice in English: the proxy sentences turn over, the unreadable drop', async () => {
  const { adviceEn } = await import('../public/lib/advice-en.mjs');
  assert.equal(adviceEn('15時 60% 會下雨'), 'Rain 60% at 15:00');
  assert.equal(adviceEn('10–14時 UV 7 高'), 'UV 7 high, 10–14h');
  assert.equal(adviceEn('早上 40%，傍晚乾爽'), 'AM 40%, PM dry');
  assert.equal(adviceEn('週六較好，28°'), 'Sat is better, 28°');
  assert.equal(adviceEn('今晚 27°，開除濕'), 'Tonight 27°, dehumidifier on');
  assert.equal(adviceEn('Bring one, 15:00 60%'), 'Bring one, 15:00 60%');
  assert.equal(adviceEn('一句沒見過的話'), null);
});

test('the rain watch follows a pin that runs past midnight: its evening and its next morning, inside 07–21', () => {
  const night = cleanPin({ id: 'pnight', name: '夜班', lat: 24.8, lon: 120.97, days: [1, 2, 3, 4, 5], from: '18:00', to: '09:00' });
  const here = { lat: 22.6, lon: 120.3 };
  // Wednesday 2026-10-07: 07–09 is Tuesday's shift ending, 18–21 is this evening's start.
  const rain = planNotices({ pins: [night], now: tpe('2026-10-07T00:30:00'), days: 1, briefOn: false, here }).filter(x => x.kind === 'rain');
  const mine = rain.filter(x => x.tag.includes(':pnight')).map(x => [x.at, x.until]);
  assert.deepEqual(mine, [[tpe('2026-10-07T07:00:00'), tpe('2026-10-07T09:00:00')], [tpe('2026-10-07T18:00:00'), tpe('2026-10-07T21:00:00')]]);
  const away = rain.filter(x => x.tag.endsWith(':here')).map(x => [x.at, x.until]);
  assert.deepEqual(away, [[tpe('2026-10-07T09:00:00'), tpe('2026-10-07T18:00:00')]]);
});

test('typhoon notices: one row a place, its name short, the day and hour of each', () => {
  const g = offGroups([
    { text: '尖石鄉玉峰國民小學:今天下午04:00起停止上班、停止上課', off: 'all' },
    { text: '尖石鄉玉峰國民小學:明天停止上班、停止上課', off: 'all' },
    { text: '五峰鄉桃山國民小學:明天停止上課', off: 'class' },
    { text: '綠島鄉:今天下午停止上班、停止上課', off: 'all' },
    { text: '明天停止上班、停止上課', off: 'all' }
  ]);
  assert.deepEqual(g.map(x => x.place), ['尖石鄉 玉峰國小', '五峰鄉 桃山國小', '綠島鄉', '']);
  assert.deepEqual(g[0].notes.map(n => [n.day, n.hour]), [['today', '16:00'], ['tomorrow', '']]);
  assert.equal(g[1].off, 'class');
  assert.equal(g[2].notes[0].when, '今天下午');
});

test('typhoon: once the county has decided, its row alone', () => {
  const f = { at: NOW, tz: 'Asia/Taipei', place: { county: '新竹縣' }, dayOff: { name: '薔琵', date: dateOf(NOW + 24 * H, 'Asia/Taipei'), official: { at: NOW, lines: [{ text: '明天停止上班、停止上課', off: 'all' }, { text: '尖石鄉玉峰國民小學:今天下午04:00起停止上班、停止上課', off: 'all' }] } } };
  const html = dayOffSec(f, NOW);
  assert.match(html, /新竹縣/);
  assert.doesNotMatch(html, /玉峰/);
});

test('a weekday school pin is off on a typhoon 停課 day there', async () => {
  const { keepDayOff } = await import('#kit/dayoff.mjs');
  const { useHolidays, pinActiveAt } = await import('../public/lib/pins.mjs');
  const { dayOffOn } = await import('#kit/dayoff.mjs');
  useHolidays((date, pin) => Boolean(pin && dayOffOn(date, { county: pin.county, town: pin.town }, /校/.test(pin.name) ? 'class' : 'work')));
  const pin = { id: 'pschool', name: '學校', lat: 24.8, lon: 121, county: '新竹縣', town: '竹東鎮', days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00' };
  const fri10 = Date.parse('2026-10-23T10:00:00+08:00');
  assert.equal(pinActiveAt(pin, fri10), true);
  keepDayOff({ county: '新竹縣', town: '竹東鎮' }, { '2026-10-23': { work: { off: true, from: null }, class: { off: true, from: null } } });
  assert.equal(pinActiveAt(pin, fri10), false);
  useHolidays(() => false);
});

test('typhoon notices: when each was announced, yesterday said so, unknown left out', () => {
  const now = Date.parse('2026-10-23T13:00:00+08:00');
  const f = { at: now, tz: 'Asia/Taipei', place: { county: '新竹縣' }, dayOff: { name: '薔琵', date: '2026-10-27', chance: 5, why: {}, local: { lines: [{ text: '今天停止上班、停止上課', off: 'all', at: Date.parse('2026-10-22T19:11:00+08:00') }, { text: '綠島鄉:今天停止上班、停止上課', off: 'all', at: null }] } } };
  const html = dayOffSec(f, now);
  assert.match(html, /週二停班停課機率/);
  assert.match(html, /昨天 19:11 公布/);
  assert.doesNotMatch(html, /綠島鄉[^<]*<\/span><small[^>]*>[^<]*公布/);
});
