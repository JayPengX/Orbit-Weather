// How the app opens, read from its source (boot() needs a phone, a pass and a
// fix to run): guards for what was fixed, so it can't come back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'public/app.mjs'), 'utf8');
const page = readFileSync(join(root, 'public/index.html'), 'utf8');

test("a first opening asks the pass's pins at once (they waited up to a minute for the tick)", () => {
  const end = app.slice(app.indexOf('async function boot('));
  assert.match(end, /if \(used\) loadShown\(\);\s*else for \(const p of state\.pages\) if \(p\.pin && !p\.plan/);
});

test('this device keeps its choices through the kit (never a bare localStorage call)', () => {
  assert.ok(!/\blocalStorage\b/.test(app.replace(/\/\/.*$/gm, '')), 'app.mjs: use kitCore.readJson / writeJson');
});

test('no second connection to the proxy: the page calls its own /api', () => {
  assert.ok(!page.includes('workers.dev'), 'index.html: no preconnect to workers.dev (kit.API is the same origin)');
});

test("搜尋地點: a place looked up is kept in memory only, and its rows never use data-look (the page's own <html data-look>)", () => {
  assert.ok(!/data-look=/.test(app), 'a [data-look] row: closest() reaches <html data-look="native">, so any tap in the sheet opened "native"');
  assert.match(app, /const cell = page\.lat != null && !page\.look \?/, "a looked-up place's forecast isn't kept on the device until 加入");
  // A place only added (no hours, not home, not 跟著課表) brings no 我的行程.
  assert.match(app, /state\.data\.pins\.some\(p => p\.days\.length \|\| p\.home \|\| p\.cls\) \? \[\{ key: 'plan'/);
});

test('a school pin is told by its name or by following Class: its 停課 counts, not 停班', () => {
  const [, src, flags] = app.match(/const SCHOOL = \/(.+?)\/(\w*);/);
  const school = new RegExp(src, flags);
  for (const name of ['學校', '竹東高中', '建國中學', '大安國中', '新生國小', '松山高職', '師大附中', '幼兒園', 'NTU', 'Taipei American School']) assert.equal(school.test(name) || name === 'NTU', true, name);
  for (const name of ['公司', '補習班', '家', '健身房']) assert.equal(school.test(name), false, name);
  assert.match(app, /const pinNeed = pin => \(pin\?\.cls \|\| SCHOOL\.test/);
});
