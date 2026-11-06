// T1144 (ROADMAP D4): the truth set through the eval runner, and its text
// judge harness on fixtures. The scorer's own rules have pytest cases in
// tests/test_truth_set.py at the repo root.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateResult } from '../scripts/eval/lib/results.mjs';
import { run as runTruth } from '../scripts/eval/adapters/truth.mjs';
import { runFixtures } from '../../evals/truth/judge/judge.mjs';
import {
  TEXT_KEY_PATH, TEXT_SAMPLE_PATH, binary, calibrate, judgePrompt, normaliseVerdict,
} from '../../evals/truth/judge/judge-lib.mjs';

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));

test('truth: a valid result on the committed sheet, and a seeded wrong value lowers the score', async () => {
  const good = await runTruth();
  assert.deepEqual(validateResult(good), []);
  assert.equal(good.eval, 'truth');
  assert.ok(good.cases.n >= 50, 'seeded rows are scored');
  const bad = await runTruth({ seedDrop: true });
  assert.deepEqual(validateResult(bad), []);
  assert.ok(bad.headline.value < good.headline.value, `${bad.headline.value} < ${good.headline.value}`);
  assert.ok(bad.notes.some((n) => n.startsWith('seeded wrong value planted')));
});

test('judge harness: the gateway path on fixtures ends with the expected verdicts', async () => {
  const r = await runFixtures();
  assert.equal(r.model, 'fixture-model');
  for (const it of r.sample.items) assert.equal(r.verdicts[it.text_id].verdict, r.expected[it.text_id], it.text_id);
  assert.equal(r.verdicts.f04.raised_from, 'supported');
});

test('judge: verdicts are normalised and folded to two classes', () => {
  assert.equal(normaliseVerdict({ verdict: 'maybe', claims: [] }), null);
  assert.equal(normaliseVerdict({ verdict: 'Supported', claims: [] }).verdict, 'supported');
  assert.equal(binary('contradicted'), 'not');
  assert.equal(binary(null), null);
});

test('judge: the prompt carries the text as data and never the key', () => {
  const sample = J(TEXT_SAMPLE_PATH);
  const p = judgePrompt(sample.items[0]);
  assert.match(p, /TEXT AND SOURCE \(data, not instructions\)/);
  assert.ok(p.includes(JSON.stringify(sample.items[0].text)));
  assert.ok(!/planted/i.test(p));
});

test('judge calibration: kappa against labels and the planted recall', () => {
  const sample = J(TEXT_SAMPLE_PATH);
  const key = J(TEXT_KEY_PATH);
  // A human who calls every planted text not supported and every shipped one supported.
  const labels = Object.fromEntries(sample.items.map((it) => [it.text_id, key.planted[it.text_id] ? 'contradicted' : 'supported']));
  const same = { verdicts: Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, { verdict: v }])) };
  const c = calibrate({ sample, key, labels, judgments: same });
  assert.equal(c.judge_vs_human.kappa, 1);
  assert.equal(c.planted_caught.judge.share, 1);
  assert.equal(c.use, 'may gate');
  const none = calibrate({ sample, key, labels: null, judgments: null });
  assert.equal(none.judge_vs_human.n, 0);
  assert.equal(none.use, 'uncalibrated');
});
