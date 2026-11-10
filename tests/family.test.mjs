// The family's notebook in Weather (Jay 11-10: Class and Weather together):
// a place that follows Orbit Class's timetable, and 體育課's advice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPin, pinActiveAt, useClassHours, scheduleText } from '../public/lib/pins.mjs';
import { planTips, useClasses } from '../public/lib/plan.mjs';

const at = (day, hm) => Date.parse(`${day}T${hm}:00+08:00`);
const school = cleanPin({ id: 'pschool', name: '學校', lat: 24.8, lon: 121, days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00', cls: true });

test('a place 跟著課表: Class’s hours on the days it told, its own on the rest', () => {
  useClassHours(date => ({ '2026-11-10': { from: '08:10', to: '15:00' }, '2026-11-11': null })[date]);
  assert.equal(school.cls, true);
  assert.equal(scheduleText(school), '跟著課表');
  assert.equal(pinActiveAt(school, at('2026-11-10', '07:35')), true, '40 minutes before the first class');
  assert.equal(pinActiveAt(school, at('2026-11-10', '07:25')), false);
  assert.equal(pinActiveAt(school, at('2026-11-10', '15:15')), true);
  assert.equal(pinActiveAt(school, at('2026-11-10', '15:25')), false, 'gone home');
  assert.equal(pinActiveAt(school, at('2026-11-11', '10:00')), false, 'no classes that day (a day off)');
  assert.equal(pinActiveAt(school, at('2026-11-12', '16:30')), true, 'a day Class didn’t tell: the place’s own hours');
  assert.equal(cleanPin({ ...school, cls: 'yes' }).cls, undefined);
  useClassHours(null);
});

test('體育課 meets rain or heat in 我的行程’s advice; a dry, mild one says nothing', () => {
  const hours = (pop, feels) => Array.from({ length: 24 }, (_, i) => ({ t: at('2026-11-10', '00:00') + i * 3_600_000, pop: i === 14 ? pop : 0, temp: 25, feels: i === 14 ? feels : 25 }));
  const pins = [school];
  useClassHours(() => ({ from: '08:10', to: '15:00' }));
  useClasses(() => [{ n: 6, name: '體育', from: '14:10', to: '15:00', out: true }, { n: 1, name: '國文', from: '08:10', to: '09:00' }]);
  const now = at('2026-11-10', '07:00');
  const pe = f => planTips(pins, () => ({ hours: f }), now).tips.find(t => t.kind === 'pe');
  assert.equal(pe(hours(70, 25)).text, '14:10 體育，雨 70%，可能改室內');
  assert.equal(pe(hours(40, 25)).level, 'maybe');
  assert.match(pe(hours(0, 35)).text, /體感 35°/);
  assert.equal(pe(hours(0, 25)), undefined);
  useClasses(null);
  useClassHours(null);
});
