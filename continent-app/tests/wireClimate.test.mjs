// D20 (wave 1, V-8): the wire climate compaction keeps heat, fire and risk
// when pipeline/heat_fire.py wrote them, and adds nothing when absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactClimate } from '../scripts/lib/wireClimate.mjs';

const months = Array.from({ length: 12 }, (_, i) => ({
  t_high: 10 + i, t_low: 2 + i, precip_mm: 40, comfort: 70,
}));

test('compactClimate keeps heat, fire and risk', () => {
  const risk = { src: 'climate', fire_basis: 'dryheat', asof: '2026-11-22' };
  const out = compactClimate({ months, summary: { best_months: [5] }, heat: [7, 8], fire: [8], risk });
  assert.equal(out.m.length, 12);
  assert.deepEqual(out.m[0], [10, 2, 40, 70]);
  assert.deepEqual(out.best, [5]);
  assert.deepEqual(out.heat, [7, 8]);
  assert.deepEqual(out.fire, [8]);
  assert.deepEqual(out.risk, risk);
});

test('compactClimate keeps an empty heat list but drops absent keys', () => {
  const out = compactClimate({ months, heat: [] });
  assert.deepEqual(out.heat, []);
  const bare = compactClimate({ months });
  for (const k of ['heat', 'fire', 'risk', 'rd', 'wind', 'elev']) assert.ok(!(k in bare), k);
});
