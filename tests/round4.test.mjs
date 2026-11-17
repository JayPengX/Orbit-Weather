// Found in the 11-17 cross-check: each one a thing a person saw go wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import { H, tpe, forecast } from './fixture.mjs';
import { daySheet, dayPop, daysCols } from '../public/lib/cards.mjs';
import { nowHtml } from '../public/lib/pages.mjs';
import { cleanPin, pinRole } from '../public/lib/pins.mjs';

test("today's day sheet gives the rain chance of the hours ahead, as the 10 days and its own 雨傘 tip do (it said 90% for the morning's shower at 19:46)", () => {
  const now = tpe('2026-10-02T19:46:00');
  const start = tpe('2026-10-02T00:00:00');
  const hours = Array.from({ length: 72 }, (_, i) => ({ t: start + i * H, temp: 24, feels: 25, pop: i === 8 ? 90 : 10, mm: i === 8 ? 5 : 0, uv: 0, condition: { code: 'CLOUDY', text: '陰' }, humidity: 80 }));
  const days = forecast.days.map((d, i) => (i ? d : { ...d, pop: 90 }));
  const f = { ...forecast, at: now - 120_000, hours: hours.filter(h => h.t + H > now), past: hours.filter(h => h.t + H <= now && h.t >= start), days };
  const sheet = daySheet(f, '2026-10-02', { now, lat: 25.03, lon: 121.57 });
  assert.equal(/<span>降雨<\/span><b>([^<]*)<\/b>/.exec(sheet)?.[1], `${dayPop(f, f.days[0], now)}%`);
  assert.equal(dayPop(f, f.days[0], now), daysCols(f, now)[0].pop);
  assert.equal(dayPop(f, f.days[0], now), 10);
});

test('每小時 never draws a sunrise or sunset already gone after 現在 (17:40 日落 at 17:50)', () => {
  const now = tpe('2026-10-02T17:50:00');
  const f = { ...forecast, at: now - 60_000, hours: forecast.hours.map((h, i) => ({ ...h, t: tpe('2026-10-02T17:00:00') + i * H })) };
  const sunset = f.days.find(d => d.date === '2026-10-02').sunset;
  assert.ok(sunset < now && sunset > tpe('2026-10-02T17:00:00'), 'the fixture sets 17:40');
  const hours = nowHtml(f, { key: 'here', place: { town: '信義區' } }, { now }).split('ot-hours')[1];
  const cols = [...hours.matchAll(/<span class="ot-ht">([^<]*)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(cols.slice(0, 2), ['現在', '18時']);
});

test('a place following Class’s timetable is the school to the family, weekdays or none (Class read typhoon 停課 at home’s township)', () => {
  const cls = cleanPin({ id: 'pc', name: '竹東高中', lat: 24.73, lon: 121.09, days: [], cls: true });
  assert.equal(pinRole(cls, true), 'school');
  assert.equal(pinRole(cleanPin({ id: 'pw', name: '公司', lat: 25, lon: 121.5, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }), false), 'work');
  assert.equal(pinRole(cleanPin({ id: 'ps', name: '學校', lat: 25, lon: 121.5, days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00' }), true), 'school');
  assert.equal(pinRole(cleanPin({ id: 'ph', name: '家', lat: 25, lon: 121.5, days: [], home: true }), false), 'home');
  assert.equal(pinRole(cleanPin({ id: 'pg', name: '健身房', lat: 25, lon: 121.5, days: [6], from: '09:00', to: '11:00' }), false), null);
});

test('我的行程 between 17:00 and 21:00: one day’s advice under one title (tomorrow’s thunder sat under 今天’s 雨傘：不用帶, titled 明天的建議)', async () => {
  const { routeForecast } = await import('../public/lib/plan.mjs');
  const now = tpe('2026-11-17T18:10:00');
  const start = tpe('2026-11-17T18:00:00');
  const hours = Array.from({ length: 240 }, (_, i) => {
    const t = start + i * H;
    const hr = (18 + i) % 24;
    const storm = t >= tpe('2026-11-18T00:00:00') && t < tpe('2026-11-19T00:00:00') && hr >= 14 && hr < 16;
    return { t, temp: 24, feels: 25, pop: storm ? 80 : 10, thunder: storm ? 70 : 0, uv: 0, humidity: 70, condition: { code: 'CLOUDY', text: '陰' }, wind: { gust: 10 } };
  });
  const days = Array.from({ length: 10 }, (_, i) => ({ date: `2026-11-${17 + i}`, hi: 26, lo: 22, feelsHi: 27, feelsLo: 24, pop: i === 1 ? 80 : 10, uvMax: 3, day: { condition: { code: 'CLOUDY', text: '陰' } } }));
  // What the proxy sends at 18:10: its advice day is tomorrow (weather.js adviceWindow, from 17:00).
  const week = days.slice(1, 8).map(d => ({ date: d.date, mark: 'good', v: '18時' }));
  const advice = [
    { kind: 'thunder', level: 'yes', text: '雷雨：14–16時可能打雷', why: { from: tpe('2026-11-18T14:00:00') } },
    { kind: 'heat', level: 'hot', text: '炎熱：體感 36°，多喝水', why: { feels: 36 } },
    { kind: 'run', level: 'good', text: '跑步：今天 18–20時 25°', why: {}, week: { text: '', days: week } }
  ];
  const f = { ...forecast, tz: 'Asia/Taipei', at: now - 60_000, hours, days, air: null, advice };
  const home = cleanPin({ id: 'phome', name: '家', lat: 25.03, lon: 121.56, days: [], home: true, t: 1 });
  const school = cleanPin({ id: 'pschool', name: '學校', lat: 24.8, lon: 120.97, days: [1, 2, 3, 4, 5], from: '07:30', to: '17:00', t: 1 });
  const route = routeForecast([home, school], () => f, now);
  const card = nowHtml(route, { key: 'plan', plan: true, pin: home, place: { town: '信義區' } }, { now }).split('ot-advice')[1] || '';
  assert.match(card, /今天的建議/);
  assert.doesNotMatch(card, /雷雨|炎熱/);
  assert.match(card, /跑步/);
  // After 21:00 the route's day is tomorrow too: the proxy's rows come back.
  const late = tpe('2026-11-17T21:10:00');
  const f2 = { ...f, at: late - 60_000, hours: hours.filter(h => h.t + H > late) };
  const card2 = nowHtml(routeForecast([home, school], () => f2, late), { key: 'plan', plan: true, pin: home, place: { town: '信義區' } }, { now: late }).split('ot-advice')[1] || '';
  assert.match(card2, /明天的建議/);
  assert.match(card2, /雷雨/);
});

test('two devices: the settings set last stand, though a place was added later elsewhere (06:30 came back over 07:15)', async () => {
  const { mergeData, emptyData, encodeData, decodeData } = await import('../public/lib/pins.mjs');
  const NOW = Date.parse('2026-11-17T12:00:00+08:00');
  const pin = (id, t) => cleanPin({ id, name: id, lat: 25, lon: 121.5, days: [], t });
  const start = { ...emptyData(), pins: [pin('pschool', NOW - 5e6)], t: NOW - 5e6 };
  // iPad: 早晨天氣 07:15 and 更多資訊 hidden (saveData({ settings: true })).
  const ipad = { ...start, brief: '07:15', hidden: ['info'], t: NOW - 3e6, st: NOW - 3e6 };
  // Phone, offline: a place added later (t newer, settings untouched).
  const phone = { ...start, pins: [...start.pins, pin('pgym', NOW - 1e6)], t: NOW - 1e6 };
  for (const m of [mergeData(phone, ipad, NOW), mergeData(ipad, phone, NOW)]) {
    assert.equal(m.brief, '07:15');
    assert.deepEqual(m.hidden, ['info']);
    assert.deepEqual(m.pins.map(p => p.id).sort(), ['pgym', 'pschool']);
  }
  // `st` rides the payload.
  assert.equal(decodeData(encodeData(ipad)).st, NOW - 3e6);
});

test('two devices: the home is the place made home last, not the one edited last (a rename of the old home took it back)', async () => {
  const { mergeData, emptyData } = await import('../public/lib/pins.mjs');
  const NOW = Date.parse('2026-11-17T12:00:00+08:00');
  const pin = (id, name, home, t, homeT) => cleanPin({ id, name, lat: 25, lon: 121.5, days: [], home, t, homeT });
  const start = { ...emptyData(), pins: [pin('pold', '舊家', true, NOW - 3e6), pin('pnew', '新家', false, NOW - 3e6)], t: NOW - 3e6 };
  // iPad: 新家 made home (homeT now); 舊家 loses home without being stamped as edited.
  const ipad = { ...start, pins: [pin('pold', '舊家', false, NOW - 3e6), pin('pnew', '新家', true, NOW - 2e6, NOW - 2e6)], t: NOW - 2e6 };
  // Phone, not yet synced: renames 舊家.
  const phone = { ...start, pins: [pin('pold', '爸媽家', true, NOW - 1e6), pin('pnew', '新家', false, NOW - 3e6)], t: NOW - 1e6 };
  for (const m of [mergeData(phone, ipad, NOW), mergeData(ipad, phone, NOW)]) {
    assert.deepEqual(m.pins.filter(p => p.home).map(p => p.id), ['pnew']);
    assert.equal(m.pins.find(p => p.id === 'pold').name, '爸媽家');
  }
});

test('two devices settle on one order of the places (each kept its own for good, 我的行程 differing where hours overlap)', async () => {
  const { mergeData, emptyData } = await import('../public/lib/pins.mjs');
  const NOW = Date.parse('2026-11-17T12:00:00+08:00');
  const pin = (id, t) => cleanPin({ id, name: id, lat: 25, lon: 121.5, days: [2], from: '16:00', to: '20:00', t });
  const start = { ...emptyData(), pins: [pin('pschool', NOW - 9e6)], t: NOW - 9e6 };
  let phone = { ...start, pins: [...start.pins, pin('pcram', NOW - 2e6)], t: NOW - 2e6 };
  let ipad = { ...start, pins: [...start.pins, pin('pgym', NOW - 1e6)], t: NOW - 1e6 };
  let pass = ipad;
  for (let i = 0; i < 3; i++) {
    phone = mergeData(phone, pass, NOW);
    pass = phone;
    ipad = mergeData(ipad, pass, NOW);
    pass = ipad;
  }
  assert.deepEqual(phone.pins.map(p => p.id), ipad.pins.map(p => p.id));
});

test('a place deleted on one device stays deleted when the other made another place home meanwhile', async () => {
  const { mergeData, emptyData } = await import('../public/lib/pins.mjs');
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
  // The old home loses home without a new `t` (its stamp outdid the deletion).
  assert.match(app, /if \(clean\.home\) state\.data\.pins = state\.data\.pins\.map\(p => \(p\.id !== clean\.id && p\.home \? \{ \.\.\.p, home: false \} : p\)\);/);
  const NOW = Date.parse('2026-11-17T12:00:00+08:00');
  const pin = (id, home, t, homeT) => cleanPin({ id, name: id, lat: 25, lon: 121.5, days: [], home, t, homeT });
  const ipad = { ...emptyData(), pins: [pin('pnew', false, NOW - 5e6)], gone: { pold: NOW - 3e6 }, t: NOW - 3e6 };
  const phone = { ...emptyData(), pins: [pin('pold', false, NOW - 5e6), pin('pnew', true, NOW - 1e6, NOW - 1e6)], t: NOW - 1e6 };
  assert.deepEqual(mergeData(phone, ipad, NOW).pins.map(p => p.id), ['pnew']);
});
