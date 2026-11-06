// T1097: the beach strip reads sea_temp from a wire built by the pipeline from a
// recorded ERDDAP response (tests/fixtures/beaches_sea_temp.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seaByMonth } from '../src/lib/waterFacts.js';

const wire = JSON.parse(readFileSync(new URL('./fixtures/beaches_sea_temp.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(wire.beaches.map((b) => [b.id, b]));

test('a fixture-built beach row gives twelve figures and its three warmest months', () => {
  const r = seaByMonth(byId['it-test-bay-Q1']);
  assert.equal(r.sea.length, 12);
  assert.equal(r.peakI, 7);                       // August
  assert.deepEqual([...r.warmest].sort((a, b) => a - b), [6, 7, 8]);
  assert.ok(r.sea.every((v) => v > 5 && v < 32));
});

test('a beach with no water cell, or a broken series, draws no strip', () => {
  assert.equal(seaByMonth(byId['fr-inland-Q3']), null);
  assert.equal(seaByMonth({ sea_temp: [1, 2, 3] }), null);
  assert.equal(seaByMonth({ sea_temp: [...Array(11).fill(15), null] }), null);
  assert.equal(seaByMonth({ sea_temp: Array(12).fill('x') }), null);
  assert.equal(seaByMonth(null), null);
});

test('numeric strings are accepted as figures', () => {
  assert.equal(seaByMonth({ sea_temp: Array(12).fill('18.5') }).sea[0], 18.5);
});
