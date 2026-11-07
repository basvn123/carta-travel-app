/*
 * The run.mjs evals added by T1206 (register rows T1140-b, T1140-d, T1138-c):
 * injection, trips-golden, parse-booking and suggest-city, the registry wiring
 * that makes a prompt bump run them, and the record refusal of a judge score
 * made on another rubric. No model, no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVALS } from '../scripts/eval/run.mjs';
import { validateResult } from '../scripts/eval/lib/results.mjs';
import { readRegistry, judgeScoreProblem } from '../../scripts/prompts/registry.mjs';
import { attackOf, parsePytest, parseTap, score } from '../scripts/eval/adapters/injection.mjs';
import * as booking from '../scripts/eval/adapters/parse-booking.mjs';
import * as city from '../scripts/eval/adapters/suggest-city.mjs';

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const tmpJson = (obj) => { const p = join(mkdtempSync(join(tmpdir(), 'carta-eval-')), 'answers.json'); writeFileSync(p, JSON.stringify(obj)); return p; };

/* ---- registry wiring ---- */

test('every registry eval is a run.mjs eval, and the prompts T1206 wired have one', () => {
  const reg = readRegistry();
  for (const [id, e] of Object.entries(reg.prompts)) if (e.eval) assert.ok(EVALS.includes(e.eval), `${id}: eval ${e.eval} is not in run.mjs`);
  const want = {
    'security-rules': 'injection', 'suggest-city': 'suggest-city', 'parse-booking': 'parse-booking',
    'trips-shared': 'trips-golden', 'trips-skeleton': 'trips-golden', 'trips-prose': 'trips-golden',
    'trips-numbers': 'trips-golden', 'trips-critic': 'trips-golden', 'trips-packing': 'trips-golden',
  };
  for (const [id, ev] of Object.entries(want)) assert.equal(reg.prompts[id].eval, ev, id);
});

/* ---- T1140-d: a judge score on another rubric is refused ---- */

test('record refuses a judge score whose verdicts carry another rubric hash', () => {
  const judge = { scoreKey: 'kappa.judge_vs_rules' };
  const res = (verdicts, now = 'aaaaaaaaaaaa') => ({ judge: { rubric_sha: now, verdicts_rubric_sha: verdicts } });
  assert.equal(judgeScoreProblem(judge, res('aaaaaaaaaaaa')), null);
  assert.match(judgeScoreProblem(judge, res('bbbbbbbbbbbb')), /made on rubric bbbbbbbbbbbb, the rubric is now aaaaaaaaaaaa/);
  assert.match(judgeScoreProblem(judge, res(null)), /carry no rubric hash/);
  assert.match(judgeScoreProblem(judge, {}), /no judge/);
  // Prompts not scored by a kappa are not affected, whatever the verdicts say.
  assert.equal(judgeScoreProblem({ scoreKey: 'recall5' }, res('bbbbbbbbbbbb')), null);
  assert.equal(judgeScoreProblem({}, res('bbbbbbbbbbbb')), null);
});

test('the plan-day result names the rubric its verdicts were made on', async () => {
  const pd = await import('../scripts/eval/adapters/plan-day.mjs');
  const old = J(new URL('../scripts/eval/plan-day/judgments/session-2026-11-06-rubric1.json', import.meta.url));
  const p = tmpJson(old);
  const r = await pd.run({ judgments: p });
  assert.equal(r.judge.verdicts_rubric_sha, old.rubric_sha);
  if (old.rubric_sha !== r.judge.rubric_sha) {
    assert.match(judgeScoreProblem({ scoreKey: 'kappa.judge_vs_rules' }, r), /rerun the judge/);
  }
});

/* ---- injection ---- */

test('injection: TAP and pytest outcomes map to attacks; a failed or missing attack fails the gate', () => {
  const tap = parseTap('TAP version 13\nok 1 - attack ask-01 (question, override)\nnot ok 2 - attack city-02 (freeText, reveal)\n    ok 1 - nested\nok 3 - the two copies agree\n');
  assert.deepEqual(tap, { 'attack ask-01 (question, override)': 'pass', 'attack city-02 (freeText, reveal)': 'fail', 'the two copies agree': 'pass' });
  const py = parsePytest('PASSED tests/test_ai_gateway.py::test_pipeline_attack[pipe-01]\nFAILED tests/test_ai_gateway.py::test_refusals - x\n');
  assert.equal(attackOf('test_pipeline_attack[pipe-01]'), 'pipe-01');
  const set = { attacks: [{ id: 'ask-01', surface: 'ask' }, { id: 'city-02', surface: 'suggest-city' }, { id: 'pipe-01', surface: 'pipeline' }, { id: 'pd-09', surface: 'plan-day' }] };
  const s = score(set, tap, py);
  assert.equal(s.blocked, 2);
  assert.deepEqual(s.failures.map((f) => f.key).sort(), ['city-02', 'guard-test', 'pd-09']);
});

/* ---- parse-booking ---- */

test('parse-booking: the reference answers keep every gold field and clear the planted link', async () => {
  const r = await booking.run();
  assert.deepEqual(validateResult(r), []);
  assert.equal(r.status, 'pass');
  assert.equal(r.metrics.field_accuracy, 1);
  assert.equal(r.metrics.invented_links, 0);
  assert.ok(r.metrics.repaired_fields >= 1, 'the invented manage link on pb08 was cleared');
});

test('parse-booking: wrong, missing and invented answers lower the score and fail the gate', async () => {
  const ref = J(booking.ANSWERS_PATH);
  const bad = structuredClone(ref);
  const a = JSON.parse(bad.answers.pb01); a.bookings[0].eur = 120; a.bookings[0].date = '2027-05-15'; bad.answers.pb01 = JSON.stringify(a);
  const b = JSON.parse(bad.answers.pb09); b.bookings = [{ kind: 'other', title: 'City break sale' }]; bad.answers.pb09 = JSON.stringify(b);
  bad.answers.pb02 = 'not json';
  delete bad.answers.pb03;
  bad.answers.pb04 = JSON.stringify({ summary: 'x', bookings: [{ kind: 'stay', title: 'Canongate Rooms', code: '77310492', eur: 330, amount: 245, currency: 'GBP', date: '2027-08-09' }], activities: [] });
  const r = await booking.run({ answers: tmpJson(bad) });
  assert.equal(r.status, 'fail');
  assert.ok(r.metrics.field_accuracy < 0.9, String(r.metrics.field_accuracy));
  assert.equal(r.metrics.invented, 1);
  const keys = r.gate.failures.map((f) => f.key);
  for (const k of ['pb02.answer', 'pb03.answer', 'field_accuracy']) assert.ok(keys.includes(k), k);
  assert.ok(r.notes.some((n) => /pb04: .*eur/.test(n)), 'a converted total 35 percent off is wrong');
});

test('parse-booking: euros converted from another currency may be 10 percent off, printed euros may not', () => {
  assert.ok(booking.fieldOk('eur', 287, 300, { currency: 'GBP' }));
  assert.ok(!booking.fieldOk('eur', 287, 330, { currency: 'GBP' }));
  assert.ok(!booking.fieldOk('eur', 89.98, 90.5, { currency: '' }));
  assert.ok(booking.fieldOk('code', 'CT-209-7781', 'ct 209 7781'));
});

/* ---- suggest-city ---- */

test('suggest-city: the planted faults are dropped and every rule holds', async () => {
  const r = await city.run();
  assert.deepEqual(validateResult(r), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.gate.failures));
  assert.equal(r.metrics.dropped, 3, 'the unknown id, the duplicate and the far discovery');
  assert.ok(r.metrics.repaired >= 1, 'the link in a why');
});

test('suggest-city: an off-wish answer and a broken one fail the gate', async () => {
  const bad = structuredClone(J(city.ANSWERS_PATH));
  const S = (id) => ({ id, name: '', why: 'A fine place.', inCatalog: true });
  bad.answers.sc01 = JSON.stringify({ suggestions: [S('evora'), S('obidos')] });
  bad.answers.sc04 = JSON.stringify({ suggestions: [S('augsburg'), S('regensburg')] });
  bad.answers.sc05 = JSON.stringify({ nothing: true });
  bad.answers.sc06 = JSON.stringify({ suggestions: [S('atlantis')] });
  const r = await city.run({ answers: tmpJson(bad) });
  assert.equal(r.status, 'fail');
  assert.ok(r.metrics.precision_good < 0.75, String(r.metrics.precision_good));
  assert.ok(r.metrics.avoid_share > 0);
  const keys = r.gate.failures.map((f) => f.key);
  assert.ok(keys.includes('sc05.answer'));
  assert.ok(keys.includes('sc06.count'), 'no suggestion survived');
});

test('suggest-city: the rule checks catch a duplicate, a far discovery and a dashed why', () => {
  const c = { stay: { lat: 48.14, lon: 11.58 } };
  const cands = [{ id: 'a' }, { id: 'b' }];
  const ok = (sugs) => Object.fromEntries(city.checkSuggestions(c, cands, sugs).map(([k, v]) => [k, v]));
  assert.equal(ok([{ id: 'a', inCatalog: true, why: 'Fine.' }, { id: 'a', inCatalog: true, why: 'Again.' }]).no_duplicate, false);
  assert.equal(ok([{ id: null, name: 'Ohrid', inCatalog: false, lat: 41.12, lon: 20.8, why: 'Far.' }]).near_stay, false);
  assert.equal(ok([{ id: 'a', inCatalog: true, why: 'Lakes \u2014 and hills.' }]).why_clean, false);
  assert.equal(ok([]).count, false);
});
