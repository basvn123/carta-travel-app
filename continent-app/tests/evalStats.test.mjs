/*
 * The eval statistics (ROADMAP E1, north-star decision 7.1): the planned-n
 * table, determinism by seed, the Wilson interval, the rule of three and the
 * seeded self-test of the non-inferiority gate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, wilson, ruleOfThree, plannedN, pairedBootstrap, nonInferiority, clusterBootstrap, seededSelfTest } from '../scripts/eval/lib/stats.mjs';

test('plannedN reproduces the table of decision 7.1', () => {
  const table = { 0.05: [157, 436], 0.1: [314, 871], 0.15: [470, 1307], 0.2: [627, 1742] };
  for (const [q, [at5, at3]] of Object.entries(table)) {
    assert.equal(plannedN({ q: Number(q), delta: 0.05 }), at5, `q ${q} delta 5`);
    assert.equal(plannedN({ q: Number(q), delta: 0.03 }), at3, `q ${q} delta 3`);
  }
  assert.equal(plannedN({ q: 0.15, delta: 5 }), 470, 'delta given in points');
  assert.throws(() => plannedN({ q: 0 }));
});

test('ruleOfThree is 3 over n', () => {
  assert.equal(ruleOfThree(300), 0.01);
  assert.equal(ruleOfThree(0), null);
});

test('wilson: known values, never a zero-width interval at the edges', () => {
  const w = wilson(50, 100);
  assert.ok(Math.abs(w.lo - 0.4038) < 0.001 && Math.abs(w.hi - 0.5962) < 0.001);
  const z = wilson(0, 20);
  assert.equal(z.p, 0);
  assert.equal(z.lo, 0);
  assert.ok(z.hi > 0.1 && z.hi < 0.2);
  assert.equal(wilson(0, 0).p, null);
});

test('the generator is deterministic by seed', () => {
  const a = mulberry32(5);
  const b = mulberry32(5);
  const xs = Array.from({ length: 5 }, a);
  assert.deepEqual(xs, Array.from({ length: 5 }, b));
  assert.notDeepEqual(xs, Array.from({ length: 5 }, mulberry32(6)));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('pairedBootstrap: same seed, same answer; the mean is the mean difference', () => {
  const old = [1, 1, 0, 1, 0, 1, 1, 0, 1, 1];
  const now = [1, 0, 0, 1, 0, 1, 1, 0, 1, 0];
  const r1 = pairedBootstrap(old, now, { seed: 3 });
  const r2 = pairedBootstrap(old, now, { seed: 3 });
  assert.deepEqual(r1, r2);
  assert.ok(Math.abs(r1.mean - -0.2) < 1e-9);
  assert.ok(r1.lower < r1.mean && r1.mean < r1.upper);
  assert.throws(() => pairedBootstrap([1], [1, 0]));
});

test('seeded self-test: a seeded 10-point loss fails at delta 5, an identical pair passes', () => {
  const t = seededSelfTest({ n: 470, loss: 0.1, delta: 0.05 });
  assert.equal(t.lossFails, true, `lower bound ${t.loss.lower} must be at or below -0.05`);
  assert.equal(t.identicalPasses, true);
  assert.equal(t.ok, true);
  // A 1-point loss is inside the margin and must still pass: the gate is not just always failing.
  assert.equal(seededSelfTest({ n: 470, loss: 0.01, delta: 0.05 }).lossFails, false);
});

test('seeded self-test with mixed gains and losses: a borderline net loss fails on the lower bound, not on the point estimate', () => {
  // 10% of cases lost and 7% gained: the mean difference is about -3 points, inside the 5 point margin,
  // but the interval is wide. Only the 2.5th percentile fails it; a median or the mean would pass it.
  const t = seededSelfTest({ n: 470, loss: 0.1, gain: 0.07, delta: 0.05 });
  assert.ok(t.loss.mean > -0.05, `mean ${t.loss.mean} would pass`);
  assert.ok(t.loss.lower < -0.05, `lower ${t.loss.lower} must fail`);
  assert.equal(t.lossFails, true);
  assert.equal(t.identicalPasses, true);
  assert.ok(t.loss.discordant > 0.15, 'mixed differences');
});

test('nonInferiority reads delta as points or as a share', () => {
  const a = Array(200).fill(1);
  assert.equal(nonInferiority(a, a, { delta: 5 }).delta, 0.05);
  assert.equal(nonInferiority(a, a, { delta: 0.05 }).pass, true);
});

test('clusterBootstrap resamples whole clusters', () => {
  const cases = [];
  for (let c = 0; c < 20; c++) for (let t = 0; t < 3; t++) cases.push({ conv: `c${c}`, ok: c < 15 ? 1 : 0 });
  const r = clusterBootstrap(cases, (x) => x.conv, (x) => x.ok, { seed: 9 });
  assert.equal(r.clusters, 20);
  assert.equal(r.cases, 60);
  assert.equal(r.mean, 0.75);
  assert.ok(r.lower < 0.75 && r.upper > 0.75);
  assert.deepEqual(r, clusterBootstrap(cases, (x) => x.conv, (x) => x.ok, { seed: 9 }));
  assert.equal(clusterBootstrap([], (x) => x, (x) => x).clusters, 0);
});
