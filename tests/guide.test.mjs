// Weather's guide (帶我走一遍, kit coach.mjs GUIDES.weather): every step's
// target is something the app still draws, so a redesign that moves a
// button fails here, not on a person's first open (Jay 2026-11-19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { GUIDES } from '#kit/coach.mjs';

const dir = new URL('../public/', import.meta.url);
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(new URL(`${e.name}/`, d)) : /\.(mjs|js|html)$/.test(e.name) ? [readFileSync(new URL(e.name, d), 'utf8')] : []));
const app = walk(dir).join('\n');
const kit = readdirSync(new URL('../.kit/', import.meta.url)).filter(f => f.endsWith('.mjs')).map(f => readFileSync(new URL(`../.kit/${f}`, import.meta.url), 'utf8')).join('\n');

test("every step of Weather's guide points at something the app draws", () => {
  const steps = GUIDES.weather;
  assert.ok(steps?.length, 'Weather has a guide');
  for (const s of steps) {
    const sel = s.tap || s.show;
    if (!sel) continue;
    // Each id, class and attribute value the selector names is in the app's code (or the kit's: its sheets' close button).
    const names = [...sel.matchAll(/#([\w-]+)|\.([\w-]+)|\[[\w-]+="([^"]+)"\]/g)].map(m => m[1] || m[2] || m[3]);
    for (const name of names) assert.ok(app.includes(name) || kit.includes(name), `${sel}: “${name}” is nowhere in the app`);
  }
});
