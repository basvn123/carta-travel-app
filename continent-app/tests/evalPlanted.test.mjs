/*
 * The planted-error generator (ROADMAP E1, decision 7.3 row E-plant): every
 * kind is generated, every plant is well formed, and a seed gives the same
 * plants. Packs here are small hand-made ones, in the shape buildPack returns.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANT_KINDS, figuresOf, plantsFor, plantAll, wellFormed, summarisePlants } from '../scripts/eval/planted/plant.mjs';

const pack = (city, id, a, b, c) => ({
  v: 4, lang: 'en', question: `When to visit ${city}?`,
  notes: [
    { n: 1, kind: 'fact', destId: null, text: `${city} is best in ${a} months.` },
    { n: 2, kind: 'fact', destId: id, text: `${city}: about €${b} a day, 24° in June, 31 mm of rain.` },
    { n: 3, kind: 'cmp', destId: null, text: `${city} is cheaper than Porto by €${c} a day.` },
  ],
  places: [{ id, city, country: 'PT' }, { id: 'OPO', city: 'Porto', country: 'PT' }],
});
const corpus = [pack('Lisbon', 'LIS', 'May to October', 87, 12), pack('Prague', 'PRG', 'April to June', 64, 9), pack('Athens', 'ATH', 'March to May', 98, 15), pack('Seville', 'SVQ', 'March to May', 91, 17)]
  .map((p, i) => ({ id: `g${i}`, pack: p }));

test('figuresOf reads currency, degree and unit figures and skips lone digits', () => {
  assert.deepEqual(figuresOf('about €87 a day, 24° in June, 31 mm, 3 days'), ['€87', '24°', '31 mm']);
});

test('every plant kind is generated over a corpus, each well formed', () => {
  const plants = plantAll(corpus, { seed: 5, perKind: 3 });
  const seen = new Set(plants.map((p) => p.kind));
  for (const k of PLANT_KINDS) assert.ok(seen.has(k), `kind ${k} missing`);
  const byId = new Map(corpus.map((e) => [e.id, e.pack]));
  for (const p of plants) assert.ok(wellFormed(p, byId.get(p.pack)), `not well formed: ${JSON.stringify(p)}`);
});

test('a cross-note plant cites a note that lacks the planted value', () => {
  const plants = plantsFor(corpus[0].pack, { seed: 1, perKind: 6 }).filter((p) => p.kind.startsWith('cross-note'));
  assert.ok(plants.length > 0);
  for (const p of plants) {
    assert.equal(p.expect, 'drop');
    const cited = corpus[0].pack.notes.find((n) => n.n === p.cites[0]);
    assert.ok(!cited.text.replace(/\s/g, '').toLowerCase().includes(p.planted.value.replace(/\s/g, '').toLowerCase()), `${p.planted.value} is in the cited note`);
  }
});

test('a pre-edit plant carries a value that is in no note', () => {
  const plants = plantsFor(corpus[1].pack, { seed: 2, perKind: 4 }).filter((p) => p.kind === 'pre-edit');
  assert.ok(plants.length > 0);
  const all = corpus[1].pack.notes.map((n) => n.text).join(' ');
  for (const p of plants) { assert.ok(!all.includes(p.planted.value)); assert.notEqual(p.planted.value, p.source.was); }
});

test('a value that is also in the cited note is reported as coincident, not as a drop', () => {
  const p = { v: 4, lang: 'en', question: 'x', places: [], notes: [{ n: 1, text: 'Cost is €87 a day.' }, { n: 2, text: 'Also €87 here.' }] };
  const plants = plantsFor(p, { seed: 1, perKind: 5 });
  // the only cross-note figure is in both notes, so no plant is built from it
  assert.equal(plants.filter((x) => x.kind === 'cross-note-figure').length, 0);
  const forged = plantsFor(p, { seed: 1, context: { otherTrip: { figures: ['€87'], note: 'Cost is €87 a day.' } } });
  assert.equal(forged.filter((x) => x.kind === 'other-trip').length, 0, 'a figure the pack holds is not foreign');
  const s = summarisePlants([{ kind: 'pre-edit', expect: 'drop' }, { kind: 'pre-edit', expect: 'coincident' }]);
  assert.equal(s.coincidentShare, 0.5);
});

test('the generator is deterministic for a seed and differs for another', () => {
  const a = plantAll(corpus, { seed: 9, perKind: 2 });
  assert.deepEqual(a, plantAll(corpus, { seed: 9, perKind: 2 }));
  assert.notDeepEqual(a.map((p) => p.sentence), plantAll(corpus, { seed: 10, perKind: 2 }).map((p) => p.sentence));
});
