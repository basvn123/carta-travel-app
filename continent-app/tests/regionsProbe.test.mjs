// The region probe (ROADMAP E7, E1; wave 3b): ordinary questions that name a region Carta covers must not be
// declined, called outside Europe or refused; the lacking and outside names must stay so. The questions are
// evals/any-question/regions.json, written before scope.js was fixed. It needs the shipped catalogue
// (public/ or CARTA_PUBLIC): without one it skips loudly, never passes silently. The gazetteer is optional:
// without it the committed slice in evals/any-question/towns.json stands in (as the any-question eval does).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogueAvailable } from '../scripts/eval/ask-eval.mjs';
import { probe, REGIONS_PATH, THRESHOLD } from '../scripts/eval/regions-probe.mjs';

const set = JSON.parse(readFileSync(REGIONS_PATH, 'utf8'));

test('the region probe is shaped as promised: 80 ordinary, 15 lacking, 10 outside, the judge ten, six languages', () => {
  assert.ok(set.ordinary.length >= 80);
  assert.equal(set.lacking.length, 15);
  assert.equal(set.outside.length, 10);
  assert.equal(set.judge10.length, 10);
  assert.deepEqual([...new Set(set.ordinary.map((c) => c.lang))].sort(), ['de', 'en', 'es', 'fr', 'it', 'nl']);
  for (const c of [...set.ordinary, ...set.lacking, ...set.outside, ...set.judge10]) assert.ok(c.q && !/[–—]/.test(c.q), c.q);
});

test('covered regions are answered, lacking places and outside places keep their decline', { timeout: 120000 }, async (t) => {
  if (!catalogueAvailable()) { t.skip('SKIPPED: no shipped catalogue (set CARTA_PUBLIC); the region probe did not run'); return; }
  const r = await probe();
  const fl = r.ordinary.falseLacking;
  assert.ok(fl.k / fl.n <= THRESHOLD, `false lacking ${fl.k} of ${fl.n}: ${JSON.stringify(r.ordinary.fails.falseLacking.map((x) => x.q))}`);
  assert.equal(r.ordinary.falseOutside.k, 0, JSON.stringify(r.ordinary.fails.falseOutside));
  assert.equal(r.ordinary.falseRefusal.k, 0, JSON.stringify(r.ordinary.fails.falseRefusal));
  assert.equal(r.judge10.falseLacking.k, 0, JSON.stringify(r.judge10.fails.falseLacking.map((x) => x.q)));
  assert.equal(r.judge10.falseOutside.k + r.judge10.falseRefusal.k, 0);
  assert.equal(r.lacking.ok.k, r.lacking.n, JSON.stringify(r.lacking.wrong));
  assert.equal(r.outside.ok.k, r.outside.n, JSON.stringify(r.outside.wrong));
});
