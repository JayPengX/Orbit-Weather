// The page in English (the reader's language, the kit's detectLang): run in
// a process of its own with a phone set to English, since the language is
// read once as the modules load.
import test from 'node:test';
import assert from 'node:assert/strict';

// Just enough of a browser for the kit to load: anything asked of the
// document answers something harmless.
const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === 'length' ? 0 : k === Symbol.iterator ? function* () {} : any()), apply: () => any(), construct: () => any() });
globalThis.document = any();
globalThis.localStorage = { getItem: k => (k === 'quadra.lang' ? 'en' : null), setItem() {}, removeItem() {} };

const { en } = await import('../public/lib/lang.mjs');
const { pageHtml, adviceCards } = await import('../public/lib/cards.mjs');
const { routeForecast } = await import('../public/lib/plan.mjs');
const { cleanPin } = await import('../public/lib/pins.mjs');
const { forecast, tpe, H } = await import('./fixture.mjs');

const home = cleanPin({ id: 'phome', name: '家', lat: 25.03, lon: 121.56, days: [], home: true });
const sch = cleanPin({ id: 'pschool', name: '學校', lat: 24.8, lon: 120.97, days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00' });
const at10 = tpe('2026-10-05T10:00:00');
const shift = (base, wetAt) => ({ ...forecast, at: at10 - 60_000, hours: forecast.hours.map((h, i) => ({ ...h, t: tpe('2026-10-05T00:00:00') + i * H, temp: base + (i % 24 > 9 && i % 24 < 16 ? 6 : 0), pop: i === wetAt ? 70 : 10 })), days: forecast.days.map((d, i) => ({ ...d, date: `2026-10-${String(5 + i).padStart(2, '0')}` })) });

test('in English', () => assert.equal(en, true));

test("my route in English: its own sentence and tiles shown, a Chinese pin name and all (they're the reader's own words)", () => {
  const fc = { phome: shift(22, 30), pschool: shift(25, 15) };
  const f = routeForecast([home, sch], k => fc[k] || null, at10);
  assert.match(f.headline, /^In 學校; 17:00 to 家/);
  const html = pageHtml(f, { key: 'plan', plan: true, pin: sch, place: { town: '東區' } }, { now: at10 });
  assert.match(html, /<p class="wx-say">In 學校; 17:00 to 家/, 'the route\'s sentence, not hidden for its Chinese names');
  assert.match(html, /k-move[^]*?17:00 to 家/, 'the move to 家 kept');
  assert.match(html, /k-umbrella[^]*?Bring one, 15:00 70%/);
});

test("the proxy's advice in English; what can't be read is left out, never half Chinese", () => {
  const f = { ...forecast, advice: [
    { kind: 'umbrella', level: 'none', text: '帶傘：不太會下雨' },
    { kind: 'sleep', level: 'cold', text: '睡覺：今晚 -2°，蓋厚被' },
    { kind: 'temp', level: 'yes', text: '降溫：明早 -1°，低 6°' },
    { kind: 'sleep', level: 'none', text: '睡覺：今晚 20°，打開窗戶' },
    { kind: 'run', level: 'good', text: '跑步：明天 6–8時 18°' }
  ] };
  const html = adviceCards(f, { now: tpe('2026-10-02T08:00:00') });
  assert.match(html, /Unlikely today/);
  assert.match(html, /Tonight -2°, thick blanket/);
  assert.match(html, /Tomorrow morning -1°, 6° colder/);
  assert.match(html, /Tomorrow 6:00–8:00 18°/);
  assert.doesNotMatch(html, /打開窗戶|今晚/, 'an unknown phrase drops its tile');
  // The proxy's own sentence (Chinese) isn't shown in English; its numbers are.
  const page = pageHtml(forecast, { key: 'here', place: { town: '信義區' } }, { now: tpe('2026-10-02T19:46:00') });
  assert.doesNotMatch(page, /wx-say/);
  assert.match(page, /Feels 27° · Rain 10% · Humidity 94%/);
});
