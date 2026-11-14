// A swipe between places on 天氣 is the same every time (Jay 2026-11-05: "swipe
// animation is inconsistent and weird, also the animation after swipe ... like
// the size up animation of the temperature"). The temperature pops (the kit's
// data-q-live) only when it changes while its place is on screen, never because
// the place beside had another number; and a swipe always brings the place in
// from its top. The slide itself is the kit's (Orbit-Core tests/kit-day-swipe.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nowHtml } from '../public/lib/pages.mjs';
import { NOW, forecast } from './fixture.mjs';

const liveKey = html => html.match(/class="ot-temp" data-q-live="([^"]+)"/)?.[1];
const here = { key: 'here', pin: null, place: { county: '臺北市', town: '信義區' } };
const school = { key: 'pschool', pin: null, place: { county: '臺北市', town: '大安區' } };

test("the temperature's pop is keyed by its place and its visit, never one key for every place", () => {
  const a = liveKey(nowHtml(forecast, here, { now: NOW, visit: 1 }));
  const b = liveKey(nowHtml(forecast, school, { now: NOW, visit: 2 }));
  const again = liveKey(nowHtml(forecast, here, { now: NOW, visit: 3 }));
  assert.ok(a && b && again);
  assert.notEqual(a, b, 'another place: another key (else its different number pops)');
  assert.notEqual(a, again, 'back to a place: a new visit, so it comes in still');
  // (A refresh of the place on screen keeps its key, so a real change still pops.)
  assert.equal(liveKey(nowHtml(forecast, here, { now: NOW + 60_000, visit: 1 })), a);
});

test('a new place on 天氣 starts a new visit, and a swipe brings it in from the top', () => {
  const app = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /if \(page\.key !== shownKey\) \(\(shownKey = page\.key\), visit\+\+\);/);
  assert.match(app, /skyPage\(forecastOf\(page\), page, \{ now, visit,/);
  const swipe = app.slice(app.indexOf('kitUI.daySwipe($(\'panel-now\')'));
  assert.match(swipe.slice(0, 600), /globalThis\.scrollTo\(0, 0\)/, 'select() leaves the scroll when the tab is the same one');
});
