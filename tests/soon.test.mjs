// 下雨改搭車's half (Jay 11-10, the family's links): where rain is due, as
// stretches of time, told to the family's notebook for Orbit Transit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wetSpans } from '../public/lib/soon.mjs';

const H = 3_600_000;
const now = Date.UTC(2026, 10, 11, 0, 10);
const hour0 = Date.UTC(2026, 10, 11, 0, 0);
const hours = pops => pops.map((pop, i) => ({ t: hour0 + i * H, pop }));

test('wet hours as merged stretches; nothing past 12 hours or from an old forecast', () => {
  const f = { at: now, hours: hours([10, 60, 70, 20, 55, ...Array(20).fill(80)]) };
  const s = wetSpans(f, now);
  assert.deepEqual(s[0], [hour0 + H, hour0 + 3 * H], 'two wet hours in a row: one stretch');
  assert.deepEqual(s[1][0], hour0 + 4 * H);
  assert.ok(s.at(-1)[1] <= now + 13 * H, 'twelve hours ahead at most');
  assert.deepEqual(wetSpans({ ...f, at: now - 4 * H }, now), [], 'an old forecast says nothing');
  assert.deepEqual(wetSpans({ at: now, hours: hours([10, 20, 5]) }, now), []);
});

test('the radar speaks for what it sees: a shower it tracks, and no wet hour under it', () => {
  // (A shower from 00:20 to 00:40 on the radar; the hours say 00:00–01:00 is wet.)
  const rate = Array.from({ length: 24 }, (_, i) => (i >= 4 && i < 8 ? 3 : 0));
  const f = { at: now, hours: hours([60, 10, 10]), radar: { at: now - 10 * 60_000, step: 5, rate } };
  const s = wetSpans(f, now);
  assert.equal(s.length, 1);
  assert.ok(s[0][0] === now + 10 * 60_000, `starts as the radar says: ${new Date(s[0][0]).toISOString()}`);
  assert.ok(s[0][1] === now + 30 * 60_000, 'ends as the radar says, not at the wet hour’s end');
});
