// One number, one meaning; an old copy never read as now; the pins kept
// across devices; the rules each said once (format.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync, existsSync } from 'node:fs';
import { H, tpe, NOW, forecast } from './fixture.mjs';
const pageHtml = (f, page, opts) => nowHtml(f, page, opts) + weekHtml(f, page, opts);
import { nowHtml, weekHtml, daysCols, daysList, dayPop, dayTips, daySheet, infoCard } from '../public/lib/cards.mjs';
import { readout } from '../public/lib/graph.mjs';
import { rainLevel, wearFor, outFeel, aqiName, aqiColor, moonName, updatedText, staleText, hereNote } from '../public/lib/format.mjs';
import { cleanPin, mergeData, emptyData, encodeData, decodeData } from '../public/lib/pins.mjs';
// PASS_SYNC=kit runs these against the kit's shared module instead of this app's own copy (the fallback).
const { passSync } = await import('#kit/pass-sync.mjs');
import { adviceEn } from '../public/lib/advice-en.mjs';
import { routeForecast } from '../public/lib/plan.mjs';

// Today from midnight: rain this morning (gone by evening), dry tonight.
const today = (now = NOW) => {
  const start = tpe('2026-10-02T00:00:00');
  const hours = Array.from({ length: 72 }, (_, i) => {
    const t = start + i * H;
    const hr = i % 24;
    return { t, temp: 24, feels: 25, pop: i === 8 ? 90 : 10, mm: i === 8 ? 5 : 0, uv: i < 24 && hr >= 10 && hr <= 14 ? 9 : 0, thunder: i === 8 ? 80 : 0, condition: { code: 'CLOUDY', text: '陰' }, wind: { gust: i === 9 ? 70 : 10 }, humidity: 80, pressure: 1010 + i };
  });
  // The forecast's day says 90%: its whole day, the morning's rain in it.
  const days = forecast.days.map((d, i) => (i ? d : { ...d, pop: 90 }));
  return { ...forecast, at: now - 2 * 60_000, hours, days };
};

test("the 10-day row's today says what the graphs say: the hours still ahead, not the morning's gone rain", () => {
  const f = today();
  const ahead = Math.max(...f.hours.filter(h => h.t + H > NOW && h.t < tpe('2026-10-03T00:00:00')).map(h => h.pop));
  assert.equal(ahead, 10);
  assert.equal(dayPop(f, f.days[0], NOW), 10);
  assert.equal(daysCols(f, NOW)[0].pop, 10, 'the 10-day graph');
  const row = daysList(f, { now: NOW, key: 'here' }).split('<button class="wx-day"')[1];
  assert.match(row, /<b>10%<\/b>/, 'the 10-day row: ' + row.match(/wx-dpop[^]*?<\/b>/)?.[0]);
  // Another day: its own whole day.
  assert.equal(dayPop(f, f.days[1], NOW), f.days[1].pop);
  // Nothing left of today (the last hour gone): the day's own.
  assert.equal(dayPop({ ...f, hours: [] }, f.days[0], NOW), 90);
});

test("today's sheet advises on what's ahead: no umbrella, sun, storm or gust for hours already gone", () => {
  const f = today();
  const tips = Object.fromEntries(dayTips(f, '2026-10-02', NOW).map(t => [t.k, t]));
  assert.equal(tips.umbrella.text, '不用帶', 'the 08時 rain is over');
  assert.equal(tips.sun, undefined, 'the sun is down');
  assert.equal(tips.thunder, undefined);
  assert.equal(tips.wind, undefined);
  assert.notEqual(tips.laundry.lv, 'bad', 'laundry by the hours ahead');
  // The same day seen that morning: all of it.
  const morning = Object.fromEntries(dayTips(f, '2026-10-02', tpe('2026-10-02T06:30:00')).map(t => [t.k, t]));
  assert.equal(morning.umbrella.text, '要帶，8時 90%');
  assert.match(morning.sun.text, /UV 9$/);
  assert.ok(morning.thunder && morning.wind);
  // Another day: all its hours, as before.
  assert.ok(dayTips(f, '2026-10-03', NOW).length);
});

test('an old copy is never read as now: the details read the hour now, not its first hours', () => {
  const f = { ...today(), at: NOW - 5 * H };
  const html = infoCard(f, { now: NOW, page: { place: { town: '信義區', county: '臺北市' } } });
  // 19:00's thunder is 0 (08:00's 80 long gone), the pressure trend from 19:00 to 22:00.
  assert.match(html, /雷雨機率<\/span><\/span><span class="q-ritem-value">0%<\/span>/);
  assert.doesNotMatch(html, /80%/);
  assert.match(html, /<small>5 小時前<\/small>|更新於 5 小時前/);
  // The stale chip and the age line: one wording each, the tick's too.
  assert.equal(updatedText(NOW - 5 * 60_000, NOW), '更新於 5 分鐘前');
  assert.equal(staleText(NOW - 2 * H, NOW), '2 小時前的資料');
  assert.match(pageHtml(f, { key: 'here', place: { town: '信義區' } }, { now: NOW }), /wx-old[^]*2 小時前的資料|5 小時前的資料/);
});

test('a day with no temperatures has no charts to read (nothing to put a finger on)', () => {
  const f = { ...forecast, hours: forecast.hours.map(h => ({ ...h, temp: null, feels: null })) };
  const html = daySheet(f, '2026-10-03', { now: NOW });
  assert.doesNotMatch(html, /wx-dayg-plot/);
  assert.match(html, /沒有逐時預報/);
});

test('the rules said once: rain, clothes, air, the moon', () => {
  assert.deepEqual([0, 29, 30, 49, 50, 100, null].map(rainLevel), ['none', 'none', 'maybe', 'maybe', 'yes', 'yes', 'none']);
  assert.deepEqual([-3, 14.9, 15, 19.9, 20, 25.9, 26, 40].map(v => wearFor(v).code), ['coat', 'coat', 'jacket', 'jacket', 'sleeves', 'sleeves', 'light', 'light']);
  assert.equal(outFeel(18, 27), 21);
  assert.deepEqual([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301, 999].map(aqiName), ['良好', '良好', '普通', '普通', '對敏感族群不健康', '對敏感族群不健康', '對所有族群不健康', '對所有族群不健康', '非常不健康', '非常不健康', '危害', '危害']);
  // The names and the colours change at the same AQI.
  for (const a of [50, 51, 100, 101, 150, 151, 200, 201, 300, 301]) assert.equal(aqiName(a) === aqiName(a - 1), aqiColor(a) === aqiColor(a - 1), String(a));
  assert.equal(aqiName(null), '');
  assert.equal(moonName('FULL_MOON'), '滿月');
  assert.equal(moonName('nope'), null);
  // A read-out with no chance known says a dash, not "–%".
  assert.equal(readout('rain', { t: NOW, pop: null }, 'Asia/Taipei'), '週五 19:46 · –');
  assert.equal(readout('air', { label: '明天', date: '2026-10-03', aqi: 120 }, 'Asia/Taipei'), '明天 10/3 · AQI 120 對敏感族群不健康');
});

test('two devices each marking a home: one home, the one marked last', () => {
  const a = { ...emptyData(), pins: [cleanPin({ id: 'pa', name: '家', lat: 25, lon: 121.5, home: true, t: 10 })], t: 10 };
  const b = { ...emptyData(), pins: [cleanPin({ id: 'pb', name: '新家', lat: 24.8, lon: 121, home: true, t: 20 })], t: 20 };
  const m = mergeData(a, b, NOW);
  assert.deepEqual(m.pins.map(p => [p.id, p.home]), [['pa', false], ['pb', true]]);
  assert.deepEqual(mergeData(b, a, NOW).pins.filter(p => p.home).map(p => p.id), ['pb']);
});

// The Worker as far as one app's payload goes (eco.js): one live session.
function worker() {
  const w = { payload: '', live: null, writes: 0 };
  w.session = name => {
    const ls = {};
    const q = {
      active: false,
      on: (ev, fn) => ((ls[ev] ||= []).push(fn), q),
      set: live => q.active !== live && ((q.active = live), (ls.active || []).forEach(fn => fn(live))),
      claim: () => ((w.live = name), q.set(true), { payload: w.payload }),
      read: async () => (q.set(w.live === name), { payload: w.payload }),
      write: async ({ payload }) => {
        if (!q.active || w.live !== name) throw (q.set(false), Object.assign(new Error('not live'), { code: 'ECO_SESSION_MOVED' }));
        w.writes++;
        w.payload = payload;
      }
    };
    return q;
  };
  return w;
}
function phone(w, name) {
  const q = w.session(name);
  const box = { data: emptyData() };
  const doc = { visibilityState: 'visible', fns: [], addEventListener: (e, fn) => doc.fns.push(fn) };
  const sync = passSync(q, { decode: decodeData, encode: () => encodeData(box.data), apply: theirs => (box.data = mergeData(box.data, theirs)) });
  return {
    box,
    sync,
    open: async () => (await sync.first(q.claim(), { local: box.data.pins.length > 0 }), sync.watch(doc), sync.sync()),
    pin: async (id, t) => ((box.data = { ...box.data, pins: [...box.data.pins, cleanPin({ id, lat: 25, lon: 121.5, t })], t }), sync.changed(), sync.sync()),
    back: async () => ((w.live = name), doc.fns.forEach(fn => fn()), sync.sync())
  };
}

test("a pin made on another device isn't written over when this one comes back (it used to write its own on every return)", async () => {
  const w = worker();
  const a = phone(w, 'A');
  const b = phone(w, 'B');
  await a.open();
  await a.pin('pschool', 1);
  await b.open();
  assert.deepEqual(b.box.data.pins.map(p => p.id), ['pschool']);
  await b.pin('pgym', 2);
  // Back on A (it still believes it's live): the pass read before anything is written.
  await a.back();
  assert.deepEqual(a.box.data.pins.map(p => p.id), ['pschool', 'pgym']);
  await a.pin('phome', 3);
  assert.deepEqual(decodeData(w.payload).pins.map(p => p.id), ['pschool', 'pgym', 'phome']);
  // A copy this version can't read (a newer one's): never written over.
  w.payload = 'w2:{}';
  const c = phone(w, 'C');
  c.box.data.pins = [cleanPin({ id: 'pc', lat: 25, lon: 121.5, t: 9 })];
  await c.open();
  await c.pin('pd', 10);
  assert.equal(w.payload, 'w2:{}');
});

test('the route page: no emoji, no source names, the route\'s own advice', () => {
  const home = cleanPin({ id: 'phome', name: '家', lat: 25.03, lon: 121.56, days: [], home: true });
  const sch = cleanPin({ id: 'pschool', name: '學校', lat: 24.8, lon: 120.97, days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00' });
  const at10 = tpe('2026-10-05T10:00:00');
  const shift = (f, base) => ({ ...f, at: at10 - 60_000, hours: f.hours.map((h, i) => ({ ...h, t: tpe('2026-10-05T00:00:00') + i * H, temp: base, pop: i === 15 ? 70 : 10 })), days: f.days.map((d, i) => ({ ...d, date: `2026-10-${String(5 + i).padStart(2, '0')}` })) });
  const fc = { phome: shift(forecast, 22), pschool: shift(forecast, 26), here: shift(forecast, 24) };
  const f = routeForecast([home, sch], k => fc[k] || null, at10);
  const html = pageHtml(f, { key: 'plan', plan: true, pin: sch, place: { town: '東區' } }, { now: at10 });
  assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'no emoji: ' + (html.match(/\p{Extended_Pictographic}/u) || [])[0]);
  for (const s of ['Google', 'CWA', '氣象署', 'MOENV', '環境部']) assert.ok(!html.includes(s), s);
  assert.match(html, /k-move/);
  assert.ok(f.advice.filter(a => ['umbrella', 'wear', 'move'].includes(a.kind)).every(a => a.own));
});

// Every sentence the proxy writes, turned into English or left out: made by
// the proxy's own advice (Orbit-Core weather.js, beside this repo when it's
// there) over many forecasts, hot and freezing, wet and dry.
const proxyFile = (() => {
  try {
    const f = `${realpathSync(new URL('../.kit', import.meta.url))}/../weather.js`;
    return existsSync(f) ? f : null;
  } catch {
    return null;
  }
})();
test("the proxy's advice in English: every sentence it writes reads", { skip: !proxyFile && 'Orbit-Core/weather.js not beside this repo' }, async () => {
  const { advise } = await import(proxyFile);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const SHOWN = ['umbrella', 'commute', 'wear', 'sun', 'run', 'laundry', 'sleep', 'window', 'mask', 'heat', 'carwash', 'weekend', 'humid', 'temp', 'wind', 'thunder', 'fog'];
  const missed = new Map();
  let seen = 0;
  for (let k = 0; k < 400; k++) {
    const base = -6 + rnd() * 44;
    const now = tpe('2026-10-02T05:00:00') + Math.floor(rnd() * 72) * H + Math.floor(rnd() * 60) * 60_000;
    const hours = Array.from({ length: 240 }, (_, i) => {
      const t = tpe('2026-10-02T00:00:00') + i * H;
      const hr = i % 24;
      const temp = base + Math.sin(((hr - 9) / 24) * 2 * Math.PI) * 6 + (rnd() - 0.5) * 2;
      return { t, temp, feels: temp + (rnd() - 0.3) * 4, pop: Math.round(rnd() ** 2 * 100), mm: rnd() * 3, uv: hr > 6 && hr < 17 ? Math.round(rnd() * 12) : 0, thunder: Math.round(rnd() ** 3 * 100), humidity: Math.round(60 + rnd() * 40), vis: rnd() < 0.05 ? Math.round(rnd() * 10) / 10 : 20, wind: { gust: rnd() * 80 }, condition: { code: 'CLOUDY' } };
    });
    const days = Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(2 + i).padStart(2, '0')}`, hi: base + 6, lo: base - 6 + (rnd() - 0.5) * 12, feelsHi: base + 8, feelsLo: base - 7, pop: Math.round(rnd() * 100), uvMax: Math.round(rnd() * 12), day: { condition: { code: ['CLEAR', 'PARTLY_CLOUDY', 'CLOUDY', 'RAIN'][Math.floor(rnd() * 4)] } } }));
    const air = rnd() < 0.8 ? { aqi: Math.round(rnd() * 220), pm25: Math.round(rnd() * 60), forecast: { days: days.slice(0, 3).map(d => ({ date: d.date, aqi: Math.round(rnd() * 200) })) } } : null;
    for (const a of advise({ tz: 'Asia/Taipei', hours, days, air }, now)) {
      if (!SHOWN.includes(a.kind)) continue;
      seen++;
      const text = a.text.replace(/^[^：]+：/, '');
      const out = adviceEn(text);
      if (out == null || /[一-鿿]/.test(out)) missed.set(text.replace(/-?\d+(\.\d+)?/g, '#'), text);
    }
  }
  assert.ok(seen > 2000, String(seen));
  assert.deepEqual([...missed.values()], [], 'sentences left in Chinese');
});

test('under 目前位置: a rough fix, and a name that could not be read, kept through a sharper fix', () => {
  assert.equal(hereNote(30, false), '');
  assert.equal(hereNote(2000, false), '大約位置');
  assert.equal(hereNote(30, true), '地名暫時讀不到');
  assert.equal(hereNote(2000, true), '大約位置 · 地名暫時讀不到');
});

import { rainSoon } from '../public/lib/soon.mjs';
test('rain starting soon: a wet hour within 2 hours of a dry one, from fresh numbers only', () => {
  const now = tpe('2026-10-02T14:20:00');
  const f = pops => ({ at: now - 60_000, hours: pops.map((pop, i) => ({ t: tpe('2026-10-02T14:00:00') + i * H, pop })) });
  assert.deepEqual(rainSoon(f([10, 70, 80, 90]), now), { kind: 'start', at: tpe('2026-10-02T15:00:00'), mins: 40, pop: 70 });
  assert.equal(rainSoon(f([10, 40, 20, 90]), now), null, '3 hours out and 40% are not a heads-up');
  assert.equal(rainSoon(f([10, 10, 70]), now)?.mins, 100, '(within 2 hours of now: 16:00 is 100 min away)');
  assert.equal(rainSoon(f([10, 10, 10, 70]), now), null, '17:00 is past the 2 hours');
  assert.deepEqual(rainSoon(f([60, 70, 20, 10]), now), { kind: 'stop', at: tpe('2026-10-02T16:00:00'), mins: 100, pop: 60 }, 'raining now, easing by 16:00');
  assert.equal(rainSoon(f([60, 70, 50, 90]), now), null, 'still wet all the way: nothing to announce');
  assert.equal(rainSoon({ ...f([10, 70]), at: now - 40 * 60_000 }, now), null, 'an old copy is not now');
  assert.equal(rainSoon(f([10, 70]), tpe('2026-10-02T13:20:00')), null, 'hours that begin after now, with a gap before them: not read as dry now');
});

test('the 位置 tile names the place the header shows, and the Today sheet labels the day\'s highs', () => {
  for (const place of [{ town: '信義區', county: '臺北市' }, { county: '臺北市' }]) {
    const page = { key: 'here', place };
    const title = nowHtml(forecast, page, { now: NOW, cards: [] }).match(/class="wx-title"[^>]*><span>([^<]*)<\/span>/)[1];
    const tile = infoCard(forecast, { now: NOW, page }).match(/位置<\/span>(?:<small>[^<]*<\/small>)?<\/span><span class="q-ritem-value">([^<]*)<\/span>/)[1];
    assert.equal(tile, title);
  }
  const sheet = daySheet(forecast, '2026-10-03', { now: NOW, lat: 25.03, lon: 121.57 });
  assert.match(sheet, /<span>空氣最高<\/span>/);
  assert.match(sheet, /<span>紫外線最高<\/span>/);
});
