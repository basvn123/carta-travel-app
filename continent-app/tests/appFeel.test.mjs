// App feel on a phone: the bottom nav keeps its names while a list scrolls
// (G12 round 2, owner O2: the ROADMAP I7 fold to icons is gone), and every
// iPhone launch screen named in index.html exists in public/splash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENS, fileName } from '../scripts/make_splash.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the bottom nav keeps its names while scrolling (O2)', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/hooks/useCompactNav.js')), false);
  assert.doesNotMatch(read('src/components/BottomNav.jsx'), /useCompactNav\(/);
  const css = read('src/styles/60-v6-shell.css');
  assert.doesNotMatch(css, /nav-compact/);
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
