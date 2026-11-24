/*
 * The E-plant gate (ROADMAP E1, A3): it passes on today's verifier and FAILS on a seeded
 * regression, the old verifier (the self-test pattern of decision 7.1 rule 7). Runs on the
 * first 25 packs only so npm test stays quick; `node scripts/eval/run.mjs plant` scores all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../scripts/eval/adapters/plant.mjs';
import { validateResult } from '../scripts/eval/lib/results.mjs';

test('the plant gate passes on the cited-note verifier and keeps the residual apart', async () => {
  const r = await run({ packLimit: 25 });
  assert.deepEqual(validateResult(r), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.gate.failures));
  assert.equal(r.metrics['drop.all'], 1);
  assert.equal(r.metrics['plants.malformed'], 0);
  assert.equal(r.inputs.hand, 100);
});

test('the plant gate fails when the verifier is the old one (a seeded regression)', async () => {
  const r = await run({ seedDrop: true, packLimit: 25 });
  assert.equal(r.status, 'fail');
  assert.ok(r.gate.failures.some((x) => x.key.startsWith('generated.cross-note')));
  assert.ok(r.gate.failures.some((x) => x.key === 'hand.unknown-venue'));
});
