import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAsk, answerOf, dayOf } from '../public/lib/ask.mjs';

const towns = [['新竹縣', '竹北市', 24.83, 121.01], ['新竹市', '東區', 24.8, 120.97], ['臺南市', '東區', 22.98, 120.22], ['臺北市', '大安區', 25.03, 121.54], ['南投縣', '仁愛鄉', 24.02, 121.13]];
const today = '2026-11-11'; // a Wednesday

test('問天氣: the day a question means', () => {
  assert.equal(dayOf('明天會下雨嗎', today).day, '2026-11-12');
  assert.equal(dayOf('週六天氣', today).day, '2026-11-14');
  assert.equal(dayOf('星期一會冷嗎', today).day, '2026-11-16', 'this week’s Monday is past: the next one');
  assert.equal(dayOf('下週三', today).day, '2026-11-18');
  assert.equal(dayOf('週末', today).day, '2026-11-14');
  assert.equal(dayOf('11/20 天氣', today).day, '2026-11-20');
  assert.equal(dayOf('5號', today).day, '2026-12-05');
  assert.equal(dayOf('會下雨嗎', today).day, today);
});

test('問天氣: the place, the day and what is asked; a place code can’t find left for the AI', () => {
  const a = readAsk('明天竹北會下雨嗎', towns, { today });
  assert.equal(a.place.town, '竹北市');
  assert.equal(a.what, 'rain');
  assert.equal(a.day, '2026-11-12');
  assert.equal(readAsk('台南東區週六熱不熱', towns, { today }).place.county, '臺南市', 'a shared name, the county said');
  assert.equal(readAsk('東區會下雨嗎', towns, { today, here: { lat: 24.8, lon: 121 } }).place.county, '新竹市', 'else the nearest');
  const s = readAsk('週六合歡山會下雪嗎', towns, { today });
  assert.equal(s.place, null);
  assert.equal(s.unknown, '合歡山');
  assert.equal(s.what, 'snow');
  assert.equal(readAsk('明天會下雨嗎', towns, { today }).here, true, 'no place said: where the phone is');
  assert.equal(readAsk('竹北', towns, { today }), null, 'a place alone is a search, not a question');
});

test('問天氣 in English: the same question read on a phone in English', () => {
  const a = readAsk('Will it rain in Zhubei tomorrow?', towns, { today });
  assert.equal(a.place.town, '竹北市');
  assert.equal(a.what, 'rain');
  assert.equal(a.day, '2026-11-12');
  assert.equal(readAsk('Is it hot in East District Tainan on Saturday?', towns, { today }).place.county, '臺南市', 'a shared name, the county said');
  assert.equal(readAsk('Is it hot in East District Tainan on Saturday?', towns, { today }).day, '2026-11-14');
  assert.equal(readAsk('cold in Da\u2019an next Monday?', towns, { today }).day, '2026-11-16');
  const s = readAsk('Will it snow on Hehuan Mountain this weekend?', towns, { today });
  assert.equal(s.place, null);
  assert.equal(s.unknown, 'Hehuan Mountain');
  assert.equal(s.what, 'snow');
  assert.equal(readAsk('Do I need an umbrella today?', towns, { today }).here, true);
  assert.equal(readAsk('Zhubei', towns, { today }), null, 'a place alone is a search');
  assert.equal(readAsk('Hsinchu weather', towns, { today }).place.county, '新竹縣');
});

test('問天氣: the answer is the forecast’s own numbers', () => {
  const f = { tz: 'Asia/Taipei', hours: [], days: [{ date: '2026-11-14', hi: 9.6, lo: 1.2, pop: 60, day: { condition: { code: 'RAIN' } }, night: { condition: { code: 'LIGHT_SNOW' } } }, { date: '2026-11-12', hi: 24, lo: 18, pop: 20, day: { condition: { code: 'CLEAR' } } }] };
  const now = Date.parse('2026-11-11T02:00:00Z');
  const snow = answerOf({ day: '2026-11-14', what: 'snow' }, f, { now, name: '合歡山' });
  assert.match(snow.head, /11\/14 · 合歡山/);
  assert.match(snow.line, /會下雪.*最低 1°.*60%/);
  assert.match(answerOf({ day: '2026-11-12', what: 'rain' }, f, { now }).line, /不太會下雨.*20%/);
  assert.match(answerOf({ day: '2026-11-30', what: 'day' }, f, { now }).line, /10 天/);
});
