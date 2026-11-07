// T1149 (ROADMAP F1): the taxonomy tagging eval. The metrics on known cases
// (a perfect tagger, an empty one, R-precision against plain P@5, the
// lenient tree match, the threshold), and the adapter end to end on the seed
// gold set with the today's-tags baseline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { score, neighbours } from '../scripts/eval/taxonomy/metrics.mjs';
import { validateResult } from '../scripts/eval/lib/results.mjs';
import { run } from '../scripts/eval/adapters/taxonomy.mjs';

const tax = {
  setting: { facet: 'setting', parent: null },
  'set.coast': { facet: 'setting', parent: 'setting' },
  'set.beach': { facet: 'setting', parent: 'set.coast' },
  'set.cove': { facet: 'setting', parent: 'set.beach' },
  'set.lake': { facet: 'setting', parent: 'setting' },
  activity: { facet: 'activity', parent: null },
  'act.hiking': { facet: 'activity', parent: 'activity' },
  'act.sea-swimming': { facet: 'activity', parent: 'activity' },
};
const P = (...tags) => tags.map((tag, i) => ({ tag, score: 1 - i / 10 }));

test('a perfect tagger scores 1 and an empty one 0', () => {
  const gold = [{ item_id: 'a', labels: ['set.beach', 'act.sea-swimming'] }, { item_id: 'b', labels: ['set.lake'] }];
  const m = score({ gold, predictions: { a: P('set.beach', 'act.sea-swimming'), b: P('set.lake') }, taxonomy: tax });
  for (const k of ['rp_at_5', 'r_at_10', 'mrr', 'micro_f1', 'macro_f1']) assert.equal(m[k], 1, k);
  assert.equal(m.p_at_5, 0.3, 'plain P@5 punishes items with fewer than 5 gold tags');
  const z = score({ gold, predictions: {}, taxonomy: tax });
  for (const k of ['p_at_5', 'rp_at_5', 'r_at_10', 'mrr', 'micro_f1']) assert.equal(z[k], 0, k);
});

test('rank, threshold and the lenient tree match', () => {
  const gold = [{ item_id: 'a', labels: ['set.cove', 'act.hiking'] }];
  const preds = { a: [{ tag: 'set.lake', score: 0.9 }, { tag: 'set.beach', score: 0.6 }, { tag: 'act.hiking', score: 0.3 }] };
  const m = score({ gold, predictions: preds, taxonomy: tax });
  assert.equal(m.rp_at_5, 0.5);
  assert.equal(m.mrr, 0.3333);
  assert.equal(m.micro_precision, 0.3333);
  assert.ok(m.lenient_micro_f1 > m.micro_f1, 'set.beach is the parent of set.cove');
  const t = score({ gold, predictions: preds, taxonomy: tax, threshold: 0.5 });
  assert.equal(t.micro_recall, 0, 'act.hiking is under the threshold');
  assert.deepEqual([...neighbours(tax, 'set.beach')].sort(), ['set.beach', 'set.coast', 'set.cove']);
});

test('items without gold are skipped, unknown gold ids are reported', () => {
  const m = score({ gold: [{ item_id: 'a', labels: [] }, { item_id: 'b', labels: ['set.nope'] }], predictions: {}, taxonomy: tax });
  assert.equal(m.n_items, 1);
  assert.deepEqual(m.unknown_gold_labels, ['set.nope']);
});

test('the adapter runs on the seed gold with the baseline, and scores a predictions file', async () => {
  const r = await run({});
  assert.deepEqual(validateResult(r), []);
  assert.equal(r.status, 'pass');
  assert.equal(r.kind, 'classification');
  assert.ok(r.metrics.n_items >= 10);
  assert.ok(r.metrics.rp_at_5 > 0 && r.metrics.rp_at_5 < 1);
  assert.match(r.notes[0], /seed set/);
  const dir = mkdtempSync(join(tmpdir(), 'tax-eval-'));
  try {
    const f = join(dir, 'p.json');
    writeFileSync(f, JSON.stringify({ name: 'nothing', threshold: null, items: {} }));
    const z = await run({ predictions: f });
    assert.equal(z.metrics.micro_f1, 0);
    assert.equal(z.status, 'pass', 'scores are not gated yet');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
