// Node check that the k6 scripts parse and that the traffic arithmetic matches the doc.
// k6 itself is not needed: the files are read as text. Run: node --test tests/load/smoke.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(dir, f), 'utf8');

test('every script declares thresholds and a scenario', () => {
  for (const f of ['ask.js', 'flights.js', 'stays.js', 'static.js']) {
    const s = read(f);
    assert.match(s, /thresholds\(/, f);
    assert.match(s, /scenario\(RATE\./, f);
    assert.match(s, /export default function/, f);
  }
});

test('the lib arithmetic gives the documented rates at 100000 MAU', () => {
  const peak = (perMonth) => Math.max(1, Math.ceil((100000 * perMonth / 30) * 0.12 * 5 / 3600));
  assert.equal(peak(6), 4);
  assert.equal(peak(4), 3);
  assert.equal(peak(2), 2);
  assert.equal(peak(16), 9);
  assert.match(read('lib.js'), /ask: 800, flights: 2500, stays: 400, static: 300/);
});

test('no em or en dashes', () => {
  for (const f of ['lib.js', 'ask.js', 'flights.js', 'stays.js', 'static.js', 'all.js']) assert.doesNotMatch(read(f), /[–—]/, f);
});
