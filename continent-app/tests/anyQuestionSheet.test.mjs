/*
 * The owner's verification sheet for the drafted any-question labels
 * (ROADMAP E1, docs/owner/ai.md AI-11): a seeded sample, a CSV that
 * round-trips, and the kappa between the draft and the owner.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sample, sheetCsv, parseCsv, scoreSheet } from '../scripts/eval/any-question-sheet.mjs';

const set = JSON.parse(readFileSync(new URL('../../evals/any-question/set.json', import.meta.url), 'utf8'));

test('the sample is 50 cases, the same each time, spread over the 14 types', () => {
  const a = sample(set.cases, 50, 1);
  assert.equal(a.length, 50);
  assert.deepEqual(a.map((c) => c.id), sample(set.cases, 50, 1).map((c) => c.id));
  assert.equal(new Set(a.map((c) => c.type)).size, 14);
});

test('the sheet round-trips quotes and commas', () => {
  const rows = parseCsv(sheetCsv([{ id: 'x', type: 'vague', lang: 'en', q: 'A "quiet", cheap place', expect: { kind: 'places', also: ['door'], country: 'PT' } }]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].question, 'A "quiet", cheap place');
  assert.equal(rows[0].draft_kind, 'places');
  assert.equal(rows[0].owner_kind, '');
});

test('scoreSheet: empty owner_kind is agreement; kappa is computed; a bad kind is refused', () => {
  const mk = (kind, owner) => ({ id: 'i', draft_kind: kind, owner_kind: owner });
  const rows = [...Array(20).fill(0).map(() => mk('figure', '')), ...Array(20).fill(0).map(() => mk('places', '')), mk('figure', 'places'), mk('places', 'figure')];
  const r = scoreSheet(rows);
  assert.equal(r.n, 42);
  assert.equal(r.agreed, 40);
  assert.ok(r.kappa.kappa > 0.85);
  assert.throws(() => scoreSheet([mk('figure', 'banana')]), /owner_kind/);
});
