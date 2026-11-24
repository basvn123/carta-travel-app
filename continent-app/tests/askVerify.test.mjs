/*
 * The cited-note verifier (ROADMAP E1, A3, north-star decision 2.1): a figure or
 * a place in a written sentence must sit in a note the sentence cites. One test
 * per failure reason, the stated residual (documented as passing), the noFigures
 * option, and the rule that nothing the old verifier failed passes now.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeChecker, splitSentences, verifyAnswer } from '../src/lib/ask/verify.js';
import * as before from './fixtures/verifyBefore.mjs';
import { loadGolden } from '../scripts/eval/planted/golden.mjs';
import { handPlants } from '../scripts/eval/planted/hand.mjs';

const KNOWN = ['Lisbon', 'Porto', 'Seville', 'Prague'];
const PACK = {
  v: 4, lang: 'en', question: 'Which is cheaper for 3 nights?',
  notes: [
    { n: 1, kind: 'fact', destId: 'LIS', text: 'Lisbon: about €87 a day, 24° in June, 31 mm of rain.' },
    { n: 2, kind: 'fact', destId: 'OPO', text: 'Porto: about €95 a day, 22° in June, 40 mm of rain; ~€60 est. for beds.' },
    { n: 3, kind: 'cmp', destId: null, text: 'Lisbon is cheaper than Porto by €8 a day.' },
    { n: 4, kind: 'fact', destId: null, text: 'Day 3 total €210 for two; Day 2 total €180.' },
    { n: 5, kind: 'fact', destId: null, text: 'Day 3 sights: 2 museums.' },
  ],
};

const run = (text, pack = PACK, opts) => {
  const check = makeChecker(pack, KNOWN, opts);
  return splitSentences(text).sentences.map((s) => check(s));
};
const one = (text, pack, opts) => run(text, pack, opts)[0];

test('a sentence on its own cited note passes', () => {
  assert.equal(one('Lisbon costs about €87 a day [1].').ok, true);
  assert.equal(one('Lisbon is cheaper than Porto by €8 a day [3].').ok, true);
});

test('figure-uncited: a figure that is in another note, not the cited one', () => {
  const r = one('Lisbon costs about €95 a day [1].');
  assert.equal(r.ok, false);
  assert.ok(r.why.includes('figure-uncited:95'), r.why.join());
  // the old whole-pack rule alone passed this: 95 is in note 2
  assert.equal(before.makeChecker(PACK, KNOWN)(splitSentences('Lisbon costs about €95 a day [1].').sentences[0]).ok, true);
});

test('the allowed figures are the union over the sentence cited notes, plus the question', () => {
  assert.equal(one('Lisbon is €87 a day and Porto €95 a day [1][2].').ok, true);
  assert.equal(one('Lisbon is €87 a day and Porto €95 a day [1].').ok, false);
  assert.equal(one('For 3 nights Lisbon is about €87 a day [1].').ok, true, 'the question figure 3 is allowed');
});

test('place-uncited: a place named that only another note carries', () => {
  const r = one('Porto is about 24° in June [1].');
  assert.ok(r.why.some((w) => w === 'place-uncited:Porto'), r.why.join());
  assert.equal(one('Porto is about 22° in June [2].').ok, true);
  // both notes are cited, so 24 (note 1) and Porto (note 2) each sit in a cited note: the residual again
  assert.equal(one('Porto is about 24° in June [1][2].').ok, true);
});

test('a place the question names needs no cited note', () => {
  const pack = { ...PACK, question: 'Is Seville warm?', notes: [{ n: 1, kind: 'fact', destId: null, text: 'Warm in June, 30° by day.' }] };
  assert.equal(one('Seville is 30° by day [1].', pack).ok, true);
});

test('the old place rule keeps its reason: a place no note names', () => {
  const r = one('Prague has 24° in June [1].');
  assert.ok(r.why.includes('place:Prague'), r.why.join());
  assert.ok(!r.why.some((w) => w.startsWith('place-uncited')));
});

test('subject-uncited: day 2 under a note that holds day 3', () => {
  const ok = one('Day 3 total is €210 for two [4].');
  assert.equal(ok.ok, true, ok.why.join());
  const bad = one('Day 2 sights are 2 museums [5].');
  assert.ok(bad.why.some((w) => w.startsWith('subject-uncited:day 2')), bad.why.join());
  // the 2 in "Day 2" is also a figure of note 5 ("2 museums"): only the subject rule sees the wrong day
  assert.ok(!bad.why.some((w) => w.startsWith('figure')));
});

test('estmark is also read over the cited notes only', () => {
  const pack = { ...PACK, notes: [
    { n: 1, kind: 'fact', destId: null, text: 'Beds ~€60 est. a night.' },
    { n: 2, kind: 'fact', destId: null, text: 'Food €60 a day.' },
  ] };
  // 60 is exact in note 2, so the old whole-pack rule lets it pass without a tilde; citing note 1 it is an estimate
  assert.equal(before.makeChecker(pack, [])(splitSentences('Beds are €60 a night [1].').sentences[0]).ok, true);
  assert.deepEqual(one('Beds are €60 a night [1].', pack).why, ['estmark']);
  assert.equal(one('Beds are ~€60 est. a night [1].', pack).ok, true);
  assert.equal(one('Food is €60 a day [2].', pack).ok, true);
});

test('residual, stated: a sentence naming no subject that cites a note holding the same value passes', () => {
  // the 24 belongs to Lisbon in note 1; the sentence names no place, so the verifier cannot tell
  assert.equal(one('It is 24° in June [1].').ok, true);
  // same bare number, another unit: still the same value in the cited note
  assert.equal(one('It is 31 degrees [1].').ok, true);
});

test('a reversed comparison is not caught by a note rule (the residual of the comparison rule)', () => {
  assert.equal(one('Porto is cheaper than Lisbon [3].').ok, true);
});

test('noFigures: any digit, currency sign or per cent fails with figure-free', () => {
  const nf = { noFigures: true };
  assert.deepEqual(one('Lisbon is warm in June [1].', PACK, nf).why, []);
  for (const t of ['Lisbon costs €87 a day [1].', 'Lisbon is 24° in June [1].', 'Lisbon is 30% dearer [1].', 'Lisbon costs $ plenty [1].']) {
    assert.ok(one(t, PACK, nf).why.includes('figure-free'), t);
  }
  // without the option a figure from the cited note is fine
  assert.equal(one('Lisbon costs €87 a day [1].').ok, true);
});

test('noFigures: a digit inside a known place name is not a figure', () => {
  const known = ['Route 66 Town'];
  const pack = { ...PACK, notes: [{ n: 1, kind: 'fact', destId: null, text: 'Route 66 Town is quiet.' }] };
  const check = makeChecker(pack, known, { noFigures: true });
  assert.equal(check(splitSentences('Route 66 Town is quiet [1].').sentences[0]).ok, true);
  assert.ok(check(splitSentences('Route 66 Town has 4 cafes [1].').sentences[0]).why.includes('figure-free'));
});

test('verifyAnswer passes the option on', () => {
  const r = verifyAnswer('Lisbon costs €87 a day [1]. Lisbon is warm [1].', PACK, KNOWN, { noFigures: true });
  assert.equal(r.kept.length, 1);
  assert.equal(r.failed[0].why.includes('figure-free'), true);
});

test('the old reasons are unchanged', () => {
  assert.deepEqual(one('Lisbon is warm.').why, ['nocite']);
  assert.ok(one('Lisbon is warm [9].').why.includes('badcite'));
  assert.ok(one('Lisbon costs €500 a day [1].').why.includes('figure:500'));
  assert.ok(one('Seville is cheaper than Lisbon [1].').why.some((w) => w.startsWith('compare:')));
});

// Never loosened: everything the old verifier failed, the new one fails too, with the old reasons first.
test('never loosened: the old verifier failures stay failures over frozen plants and hand plants', () => {
  const g = loadGolden();
  const ids = Object.keys(g.packs).slice(0, 20);
  const inSample = new Set(ids);
  let compared = 0;
  const byPack = new Map();
  for (const p of g.plants) if (inSample.has(p.pack)) (byPack.get(p.pack) || byPack.set(p.pack, []).get(p.pack)).push(p);
  const groups = [...byPack].map(([id, ps]) => ({ pack: g.packs[id].pack, ps }));
  const hand = handPlants();
  for (let i = 0; i < hand.length; i += 10) groups.push({ pack: hand[i].pack, ps: hand.slice(i, i + 10) });
  for (const { pack, ps } of groups) {
    const oldCheck = before.makeChecker(pack, g.knownPlaces);
    const newCheck = makeChecker(pack, g.knownPlaces);
    for (const p of ps) {
      for (const s of splitSentences(p.sentence).sentences) {
        const o = oldCheck(s);
        const n = newCheck(s);
        compared++;
        if (!o.ok) {
          assert.equal(n.ok, false, `loosened: ${p.sentence}`);
          assert.deepEqual(n.why.slice(0, o.why.length), o.why, `old reasons changed: ${p.sentence}`);
        }
      }
    }
  }
  assert.ok(compared > 100, `compared ${compared}`);
});
