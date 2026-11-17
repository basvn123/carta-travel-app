// ROADMAP I7, app feel on a phone: the bottom nav folds while a list scrolls
// down and comes back on the way up, and every iPhone launch screen named in
// index.html exists in public/splash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialFold, nextFold, FOLD_AFTER, UNFOLD_AFTER, SETTLE_MS, MIN_TRAVEL } from '../src/hooks/useCompactNav.js';
import { SCREENS, fileName } from '../scripts/make_splash.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const list = { id: 'list' };
const TRAVEL = 2000;

// Scroll one scroller through a series of positions, a frame apart.
function run(tops, { el = list, travel = TRAVEL, gap = 16, from = initialFold(), start = 1000 } = {}) {
  let s = from; let last = tops[0]; let now = start;
  for (const top of tops.slice(1)) {
    now += gap;
    s = nextFold(s, { el, top, delta: top - last, travel, now });
    last = top;
  }
  return s;
}

test('a scroll down past the threshold folds the bar', () => {
  assert.equal(run([100, 100 + FOLD_AFTER - 1]).compact, false);
  assert.equal(run([100, 120, 140, 160]).compact, true);
});

test('a scroll back up brings the names back', () => {
  const folded = run([100, 200]);
  assert.equal(folded.compact, true);
  // Inside the settle window nothing changes, so a clamped scrollTop at the
  // end of a list cannot bounce the bar.
  assert.equal(run([200, 150], { from: folded, start: 1016 }).compact, true);
  const later = 1016 + SETTLE_MS;
  assert.equal(run([400, 400 - UNFOLD_AFTER + 1], { from: folded, start: later }).compact, true);
  assert.equal(run([400, 400 - UNFOLD_AFTER], { from: folded, start: later }).compact, false);
});

test('the top of a list always shows the names', () => {
  const folded = run([100, 200]);
  assert.equal(run([200, 4], { from: folded, gap: 1 }).compact, false);
});

test('a list that barely scrolls never folds the bar', () => {
  assert.equal(run([10, 100], { travel: MIN_TRAVEL - 1 }).compact, false);
});

test('a different scroller starts counting again', () => {
  const half = run([100, 130]);
  const other = { id: 'other' };
  assert.equal(nextFold(half, { el: other, top: 130, delta: 30, travel: TRAVEL, now: 5000 }).compact, false);
});

test('a horizontal scroll (no vertical change) does nothing', () => {
  const s = initialFold();
  assert.deepEqual(nextFold({ ...s, el: list }, { el: list, top: 300, delta: 0, travel: TRAVEL, now: 1 }), { ...s, el: list });
});

test('every launch screen in index.html exists, one per iPhone screen', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const hrefs = [...html.matchAll(/rel="apple-touch-startup-image" href="\/splash\/([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs.sort(), SCREENS.map(fileName).sort());
  for (const f of hrefs) {
    const p = path.join(root, 'public', 'splash', f);
    assert.ok(fs.existsSync(p), f);
    const size = fs.statSync(p).size;
    assert.ok(size > 1000 && size < 200_000, `${f} is ${size} bytes`);
  }
});
