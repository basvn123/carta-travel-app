// T1148 (ROADMAP F6): the eval platform. The kappa arithmetic, the shared
// results format, the plan-day rule checks against known faults, the
// calibration sample's blindness and the dashboard page. The four evals'
// own numbers are not rerun here (askEval.test.mjs covers Ask; the Python
// evals have their own pytest files).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cohenKappa, band, judgeUse } from '../scripts/eval/lib/kappa.mjs';
import { SCHEMA, flatten, makeResult, validateResult, writeResult, readHistory } from '../scripts/eval/lib/results.mjs';
import {
  CITIES, FAULTS, LABELS_PATH, SAMPLE_KEY_PATH, SAMPLE_PATH, buildCases, checkPlan, loadCases, referencePlan,
} from '../scripts/eval/plan-day/plan-day-lib.mjs';
import { calibrate, run as runPlanDay } from '../scripts/eval/adapters/plan-day.mjs';
import { dashboard, spark, EVALS } from '../scripts/eval/run.mjs';

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rep = (n, pair) => Array.from({ length: n }, () => pair);

test('kappa: textbook 2x2 (po 0.7, pe 0.5, kappa 0.4)', () => {
  const pairs = [...rep(20, ['y', 'y']), ...rep(5, ['y', 'n']), ...rep(10, ['n', 'y']), ...rep(15, ['n', 'n'])];
  const k = cohenKappa(pairs);
  assert.equal(k.n, 50);
  assert.equal(k.po, 0.7);
  assert.equal(k.pe, 0.5);
  assert.equal(k.kappa, 0.4);
  assert.equal(k.band, 'fair');
  assert.ok(k.ci95[0] < 0.4 && k.ci95[1] > 0.4);
});

test('kappa: perfect, chance and undefined cases; missing labels left out', () => {
  assert.equal(cohenKappa([['a', 'a'], ['b', 'b'], ['a', 'a']]).kappa, 1);
  assert.equal(cohenKappa([...rep(5, ['a', 'a']), ...rep(5, ['a', 'b']), ...rep(5, ['b', 'a']), ...rep(5, ['b', 'b'])]).kappa, 0);
  const single = cohenKappa(rep(4, ['pass', 'pass']));
  assert.equal(single.kappa, null);
  assert.match(single.note, /undefined/);
  const gaps = cohenKappa([['a', 'a'], ['b', null], [null, 'a'], ['b', 'b']]);
  assert.equal(gaps.n, 2);
  assert.equal(gaps.missing, 2);
  assert.equal(band(0.65), 'substantial');
  assert.equal(band(-0.1), 'poor');
  assert.equal(judgeUse(0.7), 'may gate');
  assert.equal(judgeUse(0.5), 'advisory');
  assert.equal(judgeUse(0.2), 'do not use');
  assert.equal(judgeUse(null), 'uncalibrated');
});

const good = () => makeResult({
  eval: 'x', title: 'X', kind: 'data', status: 'pass', gated: true, git: 'abc1234',
  headline: { key: 'h', value: 0.9, label: 'share', higher_is_better: true },
  metrics: flatten({ a: { b: 1, c: null }, d: true }),
  gate: { ok: true, rule: 'r', tolerance: 0.02, baseline: null, failures: [] },
});

test('results: the shared format validates and flattens', () => {
  const r = good();
  assert.equal(r.schema, SCHEMA);
  assert.deepEqual(r.metrics, { 'a.b': 1, 'a.c': null, d: 1 });
  assert.deepEqual(validateResult(r), []);
  assert.ok(validateResult({ ...r, kind: 'vibes' }).length);
  assert.ok(validateResult({ ...r, headline: { ...r.headline, value: 1.5 } }).length);
  assert.ok(validateResult({ ...r, metrics: { m: 'high' } }).length);
  assert.ok(validateResult({ ...r, gate: { ok: 'yes' } }).length);
  assert.deepEqual(validateResult({ ...r, status: 'error', headline: { ...r.headline, value: null } }), []);
});

test('results: write, history and the dashboard page', () => {
  const dir = mkdtempSync(join(tmpdir(), 'carta-evals-'));
  try {
    const r = good();
    writeResult({ ...r, eval: 'ask', headline: { ...r.headline, value: 0.5 } }, dir);
    writeResult({ ...r, eval: 'ask', headline: { ...r.headline, value: 0.6 } }, dir);
    assert.equal(readHistory(dir).length, 2);
    assert.equal(J(join(dir, 'latest', 'ask.json')).headline.value, 0.6);
    const md = dashboard(dir);
    assert.match(md, /# Eval results/);
    assert.match(md, /\| X \(`ask`\) \| pass \| yes \|/);
    assert.match(md, /60\.0%/);
    assert.doesNotMatch(md, /[–—]/);
    assert.throws(() => writeResult({ ...r, kind: 'nope' }, dir), /not valid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(spark([0, 1]), '▁█');
  assert.equal(spark([]), '');
  assert.deepEqual(EVALS, ['ask', 'trail-summaries', 'data-quality', 'plan-day', 'taxonomy', 'trails-external', 'truth', 'linking', 'ask-docs', 'injection', 'trips-golden', 'parse-booking', 'suggest-city']);
});

test('plan-day: the committed cases are what the builder makes from the dossiers', () => {
  const set = loadCases();
  assert.equal(set.cases.length, CITIES.length);
  assert.deepEqual(buildCases(), set);
  for (const c of set.cases) {
    assert.ok(c.candidates.length >= 8, `${c.id} has a deck`);
    for (const id of c.answers.named) assert.ok(c.candidates.some((x) => x.id === id));
  }
});

test('plan-day: every reference plan meets every rule', () => {
  for (const c of loadCases().cases) {
    const r = checkPlan(c, referencePlan(c));
    assert.equal(r.verdict, 'pass', `${c.id}: ${r.checks.filter((x) => !x[1]).map((x) => x[2]).join('; ')}`);
  }
});

test('plan-day: the rule checks catch each kind of fault', () => {
  const set = loadCases();
  const c = set.cases.find((x) => x.answers.named.length);
  const ref = referencePlan(c);
  const failed = (plan) => checkPlan(c, plan).checks.filter((x) => !x[1]).map((x) => x[0]);
  assert.ok(failed({ ...ref, stops: ref.stops.filter((s) => !c.answers.named.includes(s.id)) }).includes('named'));
  assert.ok(failed({ ...ref, stops: [...ref.stops, { id: 'h99', name: 'Fake', dwellMin: 30, why: 'Made up by the model.', inCatalog: true }] }).includes('valid'));
  assert.ok(failed({ ...ref, stops: [...ref.stops, ref.stops[0]] }).includes('valid'));
  assert.ok(failed({ ...ref, summary: 'A day — nice' }).includes('text'));
  assert.ok(failed({ ...ref, stops: ref.stops.map((s) => ({ ...s, why: '' })) }).includes('text'));
  assert.ok(failed({ ...ref, stops: ref.stops.slice(0, 1) }).includes('pace'));
  assert.ok(failed({ summary: 'x', stops: [] }).includes('valid'));
  assert.ok(failed(null).includes('valid'));
});

test('plan-day: the calibration sample is blind and balanced', () => {
  const sample = J(SAMPLE_PATH);
  const key = J(SAMPLE_KEY_PATH).key;
  assert.equal(sample.plans.length, 40);
  assert.deepEqual(Object.keys(key).sort(), sample.plans.map((p) => p.planId).sort());
  const text = readFileSync(SAMPLE_PATH, 'utf8');
  for (const v of ['reference', ...FAULTS]) assert.ok(!text.includes(`"${v}"`), `sample.json must not name the variant ${v}`);
  assert.ok(!text.includes('"caseId"'));
  const variants = Object.values(key).map((k) => k.variant);
  assert.equal(variants.filter((v) => v === 'reference').length, 20);
  const labels = J(LABELS_PATH).labels;
  assert.deepEqual(Object.keys(labels).sort(), Object.keys(key).sort());
  for (const v of Object.values(labels)) assert.ok(v === null || v === 'pass' || v === 'fail');
});

test('plan-day: calibration agrees perfectly with itself, and the adapter writes a valid result', async () => {
  const set = loadCases();
  const sample = J(SAMPLE_PATH);
  const key = J(SAMPLE_KEY_PATH).key;
  const first = calibrate({ set, sample, key, labels: {}, judgments: null });
  const asRules = Object.fromEntries(first.rows.map((r) => [r.planId, r.rules]));
  const cal = calibrate({ set, sample, key, labels: asRules, judgments: { verdicts: Object.fromEntries(Object.entries(asRules).map(([k, v]) => [k, { verdict: v }])) } });
  assert.equal(cal.rules_vs_human.kappa, 1);
  assert.equal(cal.judge_vs_human.kappa, 1);
  const passes = first.rows.filter((r) => r.rules === 'pass').length;
  assert.ok(passes >= 15 && passes <= 25, `balanced sample, ${passes} of 40 pass the rules`);
  const r = await runPlanDay();
  assert.deepEqual(validateResult(r), []);
  assert.equal(r.gated, false);
  assert.equal(r.headline.value, 1);
});
