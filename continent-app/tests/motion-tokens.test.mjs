// T1124: every duration and easing in the stylesheets reads a motion token,
// and no script asks for a smooth scroll without going through lib/motion.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('design-lint reports no new motion-literal', () => {
  const out = execFileSync('node', ['scripts/ci/design-lint.mjs'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /, 0 new/);
});

test('design-lint seeded fixture still catches motion-literal', () => {
  const out = execFileSync('node', ['scripts/ci/design-lint.mjs', '--self-test'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /self-test ok/);
});

test('the reduced-motion floor and the token set exist', () => {
  const base = fs.readFileSync(path.join(root, 'src/styles/02-base.css'), 'utf8');
  assert.match(base, /prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before, \*::after\s*\{[^}]*animation-duration: 0\.01ms !important/);
  const tokens = fs.readFileSync(path.join(root, 'src/styles/01-tokens.css'), 'utf8');
  for (const t of ['--dur-1', '--dur-2', '--dur-3', '--dur-4', '--ease-out', '--ease-in-out', '--dur-spin', '--dur-drift']) {
    assert.ok(tokens.includes(`${t}:`), t);
  }
});

test('no script scrolls with a literal smooth behavior', () => {
  const bad = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|jsx)$/.test(e.name) && !p.endsWith('lib/motion.js') && /behavior:\s*['"]smooth['"]/.test(fs.readFileSync(p, 'utf8'))) bad.push(p);
  } };
  walk(path.join(root, 'src'));
  assert.deepEqual(bad, []);
});
