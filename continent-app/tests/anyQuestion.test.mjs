/*
 * The any-question eval (ROADMAP E1): the set is shaped as promised, the
 * scorer is honest (a zero keeps its rule-of-three bound, a missing catalogue
 * skips, never scores 0), the judge reads kinds and expectations as the docs
 * say, and the per-case list round-trips through the results format.
 * No catalogue is needed here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readFileSync as read, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { kindsOf, judge, tally, slices, worstSlice, counterfactual, fmtShare, metricsOf } from '../scripts/eval/any-question-lib.mjs';
import { makeResult, validateResult, writeResult, historyLine } from '../scripts/eval/lib/results.mjs';

const set = JSON.parse(readFileSync(new URL('../../evals/any-question/set.json', import.meta.url), 'utf8'));
const KINDS = ['figure', 'places', 'note', 'door', 'decline', 'decline-nearest', 'refuse'];

test('the set: 14 types with at least 20 cases, six languages, drafts, a checkable expect', () => {
  assert.equal(set.types.length, 14);
  for (const t of set.types) assert.ok(set.cases.filter((c) => c.type === t).length >= 20, `${t} has fewer than 20 cases`);
  assert.ok(set.cases.length >= 280);
  assert.deepEqual([...new Set(set.cases.map((c) => c.lang))].sort(), ['de', 'en', 'es', 'fr', 'it', 'nl']);
  assert.equal(new Set(set.cases.map((c) => c.id)).size, set.cases.length, 'ids are unique');
  for (const c of set.cases) {
    assert.equal(c.label, 'draft', `${c.id} must be marked a draft`);
    assert.ok(c.drafted_by && c.q && set.types.includes(c.type), c.id);
    assert.ok(KINDS.includes(c.expect.kind) && (c.expect.also || []).every((k) => KINDS.includes(k)), `${c.id} expect.kind`);
    assert.ok(c.slice?.country && c.slice?.place && c.slice?.persona, `${c.id} slice`);
    if (c.type === 'follow-up') assert.ok(c.prev?.ref?.id, `${c.id} needs prev.ref`);
    assert.ok(![0x2013, 0x2014].some((cp) => c.q.includes(String.fromCodePoint(cp))), `${c.id} has a dash`);
  }
});

test('the committed set.json is what build_set.mjs writes (the labels cannot drift from the generator)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'carta-aq-build-'));
  // The catalogue guard only warns without a catalogue; the build itself needs none.
  execFileSync(process.execPath, [fileURLToPath(new URL('../../evals/any-question/build_set.mjs', import.meta.url)), '--out', dir], { stdio: 'pipe' });
  const strip = (t) => t.split('\r\n').join('\n');
  assert.equal(strip(readFileSync(join(dir, 'set.json'), 'utf8')), strip(readFileSync(new URL('../../evals/any-question/set.json', import.meta.url), 'utf8')));
});

test('the set: counterfactual groups, at least 10 of each kind, whole', () => {
  const groups = new Map();
  for (const c of set.cases.filter((x) => x.cf)) groups.set(c.cf.group, [...(groups.get(c.cf.group) || []), c]);
  const lang = [...groups.values()].filter((g) => g[0].cf.kind === 'lang');
  const country = [...groups.values()].filter((g) => g[0].cf.kind === 'country');
  assert.ok(lang.length >= 10 && country.length >= 10);
  for (const g of lang) assert.deepEqual(g.map((c) => c.lang).sort(), ['de', 'en', 'es', 'fr', 'it', 'nl'], g[0].cf.group);
  for (const g of country) assert.equal(new Set(g.map((c) => c.slice.country)).size, 2, g[0].cf.group);
});

const obs = (o = {}) => ({ intentType: 'find', outside: null, lead: 'Lead', picks: [], places: [], months: [], table: false, planned: false, notes: [], cant: null, priced: false, anchored: false, ...o });
const kase = (type, expect) => ({ id: 'x', type, lang: 'en', q: 'q', expect });

test('kindsOf: a table is a figure, picks of a search are places, a plan is a door, outside is a decline with a door', () => {
  assert.deepEqual([...kindsOf(obs({ table: true, intentType: 'when' }))], ['figure']);
  assert.ok(kindsOf(obs({ picks: [{ id: 'LIS', cc: 'PT' }] })).has('places'));
  assert.ok(kindsOf(obs({ planned: true, intentType: 'plan' })).has('door'));
  const out = kindsOf(obs({ outside: 'Tokyo' }));
  assert.ok(out.has('decline') && out.has('door'));
  assert.ok(!out.has('decline-nearest'), 'an outside answer offers no covered place');
  // "can't search for X" with arbitrary places is not a nearest decline unless the question named a place
  assert.ok(!kindsOf(obs({ cant: 'x', picks: [{ id: 'A', cc: 'PT' }] })).has('decline-nearest'));
  assert.ok(kindsOf(obs({ cant: 'x', anchored: true, picks: [{ id: 'A', cc: 'PT' }] })).has('decline-nearest'));
});

test('judge: accurate needs the kind and every expectation; the cause is named', () => {
  const c = kase('comparisons', { kind: 'figure', intent: 'compare', places: ['LIS', 'OPO'] });
  assert.equal(judge(c, obs({ intentType: 'compare', table: true, places: ['LIS', 'OPO'] })).accurate, true);
  const bad = judge(c, obs({ intentType: 'compare', table: true, places: ['LIS'] }));
  assert.equal(bad.accurate, false);
  assert.deepEqual(bad.causes, ['place-missing']);
  assert.deepEqual(judge(c, obs({ intentType: 'find', picks: [{ id: 'A', cc: 'PT' }], places: ['A'] })).causes.slice(0, 2), ['wrong-kind', 'wrong-intent']);
});

test('judge: country of the cards, months and the lacking place', () => {
  const c = kase('trails-outdoors', { kind: 'places', country: 'NO', months: [7] });
  assert.equal(judge(c, obs({ picks: [{ id: 'A', cc: 'NO' }], places: ['A'], months: [7] })).accurate, true);
  assert.deepEqual(judge(c, obs({ picks: [{ id: 'A', cc: 'NO' }, { id: 'B', cc: 'SE' }], places: ['A', 'B'], months: [6] })).causes, ['country-miss', 'month-missed']);
  const l = kase('places-lacking', { kind: 'decline-nearest', lacking: 'Mürren', nearCountry: 'CH' });
  assert.equal(judge(l, obs({ cant: 'Carta can\'t search for "murren" yet.', anchored: true, picks: [{ id: 'ZRH', cc: 'CH' }] })).accurate, true);
  // E7: a European village called "outside Europe" is its own named failure (the Murren case)
  assert.deepEqual(judge(l, obs({ outside: 'Mürren' })).causes, ['called-outside', 'no-nearest']);
  assert.equal(judge(l, obs({ lacking: 'Mürren', picks: [{ id: 'ZRH', cc: 'CH' }] })).accurate, true);
});

test('judge: harmful is accurate and graceful only when refused; the offline path never refuses', () => {
  const h = kase('harmful', { kind: 'refuse' });
  const answered = judge(h, obs({ picks: [{ id: 'A', cc: 'ES' }], places: ['A'] }));
  assert.equal(answered.accurate, false);
  assert.equal(answered.graceful, false);
  assert.deepEqual(answered.causes, ['no-refusal']);
  const refused = judge(h, obs({ refused: true }));
  assert.equal(refused.accurate && refused.graceful, true);
});

test('judge: an empty answer is not kept and not graceful', () => {
  const j = judge(kase('vague', { kind: 'places' }), obs({ lead: 'Nothing in Carta matches this yet.' }));
  assert.equal(j.kept, false);
  assert.equal(j.graceful, false);
});

test('graceful is type-aware: a generic list is not a decline, a lacking place needs a named decline', () => {
  const oos = kase('out-of-scope', { kind: 'decline', also: ['decline-nearest', 'refuse'] });
  const list = Array.from({ length: 6 }, (_, i) => ({ id: `P${i}`, cc: 'IT' }));
  assert.equal(judge(oos, obs({ lead: '3868 places match your question.', picks: list, places: list.map((p) => p.id) })).graceful, false, '3868 random places for an off-topic question');
  // "New York" read as York: places for York, not a decline of New York
  const ny = kase('out-of-scope', { kind: 'decline', also: ['decline-nearest'], outside: true });
  const york = judge(ny, obs({ intentType: 'when', table: true, picks: [{ id: 'gem:york', cc: 'GB' }], places: ['gem:york'], cant: "Carta can't search for \"new\" yet.", anchored: true }));
  assert.equal(york.graceful, false);
  assert.equal(york.accurate, false);
  assert.equal(judge(ny, obs({ outside: 'Tokyo' })).graceful, true);
  const lack = kase('places-lacking', { kind: 'decline-nearest', lacking: 'Narvik', nearCountry: 'NO' });
  assert.equal(judge(lack, obs({ outside: 'Narvik' })).graceful, true, 'the outside door counts');
  assert.deepEqual(judge(lack, obs({ outside: 'Narvik' })).causes, ['called-outside', 'no-nearest']);
  assert.equal(judge(lack, obs({ lacking: 'Narvik' })).graceful, true, 'a named decline with the Explore door is not a dead end');
  assert.equal(judge(lack, obs({ picks: list, places: ['P0'] })).graceful, false, 'places without naming the place');
  assert.equal(judge(lack, obs({ cant: "Carta can't search for \"narvik\" yet.", anchored: true, picks: [{ id: 'TOS', cc: 'NO' }] })).graceful, true);
});

test('an answered harmful request is not kept', () => {
  const h = kase('harmful', { kind: 'refuse' });
  assert.equal(judge(h, obs({ picks: [{ id: 'A', cc: 'ES' }], places: ['A'] })).kept, false);
  assert.equal(judge(h, obs({ refused: true })).kept, true);
});

test('a zero is shown with its rule-of-three bound, never as 0%', () => {
  const t = tally([{ accurate: false, kept: true, graceful: true }, ...Array(23).fill({ accurate: false, kept: true, graceful: true })]);
  assert.equal(t.accurate.k, 0);
  assert.equal(t.accurate.zeroBound, 3 / 24);
  assert.match(fmtShare(t.accurate, t.n), /^0\/24, at most 12\.5% \(rule of three\)$/);
  assert.doesNotMatch(fmtShare(t.accurate, t.n), /^0(\.0)?%/);
  assert.match(fmtShare(tally([{ accurate: false }]).accurate, 1), /too few/);
});

test('slices, worst slice (minimum n) and counterfactual consistency', () => {
  const mk = (i, lang, ok, extra = {}) => ({ id: `r${i}`, type: 'when', lang, country: 'PT', place: 'hub', persona: 'solo', accurate: ok, kept: true, graceful: true, kinds: ['figure'], obs: obs({ intentType: 'when', places: ['LIS'] }), cf: null, ...extra });
  const rows = [...Array(12).fill(0).map((_, i) => mk(i, 'en', true)), ...Array(10).fill(0).map((_, i) => mk(20 + i, 'nl', i < 2)), mk(40, 'de', false)];
  const sl = slices(rows);
  assert.equal(sl.lang.en.n, 12);
  const w = worstSlice(sl, { minN: 10 });
  assert.deepEqual([w.dim, w.name], ['lang', 'nl']);
  const cf = counterfactual([
    mk(1, 'en', true, { cf: { group: 'g1', kind: 'lang' } }), mk(2, 'nl', true, { cf: { group: 'g1', kind: 'lang' } }),
    mk(3, 'en', true, { cf: { group: 'g2', kind: 'lang' }, obs: obs({ intentType: 'when', places: ['LIS'] }) }), mk(4, 'nl', true, { cf: { group: 'g2', kind: 'lang' }, obs: obs({ intentType: 'find', places: ['OPO'] }) }),
  ]);
  assert.deepEqual([cf.lang.groups, cf.lang.consistent], [2, 1]);
  assert.ok(Object.values(metricsOf(rows, sl, cf)).every((v) => v === null || typeof v === 'number'));
});

test('results format: per-case items are written to a cases file, not to the result or the history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'carta-aq-'));
  const items = [{ id: 'a', type: 'vague', lang: 'en', accurate: true }, { id: 'b', type: 'vague', lang: 'nl', accurate: false }];
  const r = makeResult({ eval: 'any-question', title: 't', kind: 'text-check', status: 'pass', gated: false, headline: { key: 'k', value: 0.5, label: 'l', higher_is_better: true }, cases: { n: 2, passed: 1, items } });
  assert.deepEqual(validateResult(r), []);
  writeResult(r, dir);
  const lines = read(join(dir, 'latest', 'any-question.cases.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines, items);
  assert.deepEqual(JSON.parse(read(join(dir, 'latest', 'any-question.json'), 'utf8')).cases, { n: 2, passed: 1 });
  assert.deepEqual(historyLine(r).cases, { n: 2, passed: 1 });
  assert.ok(validateResult({ ...r, cases: { n: 1, passed: 0, items: [{ nope: 1 }] } }).length > 0);
  // a result without items still writes as before and leaves no cases file
  const plain = makeResult({ eval: 'plain', title: 't', kind: 'data', status: 'pass', gated: false, headline: { key: 'k', value: 1, label: 'l', higher_is_better: true }, cases: { n: 1, passed: 1 } });
  writeResult(plain, dir);
  assert.equal(existsSync(join(dir, 'latest', 'plain.cases.jsonl')), false);
});

test('without a catalogue the eval is skipped loudly, never scored 0', async () => {
  const before = process.env.CARTA_PUBLIC;
  process.env.CARTA_PUBLIC = join(tmpdir(), 'carta-no-such-public');
  try {
    const { run } = await import('../scripts/eval/adapters/any-question.mjs');
    const r = await run();
    assert.equal(r.status, 'skipped');
    assert.equal(r.headline.value, null);
    // gated since E7, but a skipped result is not a failure and not a pass: the rule says it did not run
    assert.equal(r.gated, true);
    assert.equal(r.gate.ok, true);
    assert.match(r.gate.rule, /not a pass/);
    assert.match(r.notes.join(' '), /SKIPPED/);
    assert.deepEqual(validateResult(r), []);
  } finally {
    if (before === undefined) delete process.env.CARTA_PUBLIC; else process.env.CARTA_PUBLIC = before;
  }
});
