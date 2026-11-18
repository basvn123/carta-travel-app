/* G12 Style Studio: the wizard's draft rules (src/browse/styles/studioSteps.js). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, STAY_STEPS, EXPLORE_STEPS, applyTemplate, draftToSave, stepPlace, togglePick, toggleWay } from '../src/browse/styles/studioSteps.js';
import { draftFromTemplate, emptyDraft } from '../src/lib/travelStyles.js';
import { en } from '../src/i18n/en.js';

test('ten steps in two parts of four and six', () => {
  assert.equal(STEPS.length, 10);
  assert.deepEqual(STAY_STEPS, ['name', 'spend', 'way', 'priority']);
  assert.equal(EXPLORE_STEPS.length, 6);
  assert.deepEqual(stepPlace('way'), { part: 'stay', n: 3, of: 4 });
  assert.deepEqual(stepPlace('days'), { part: 'explore', n: 6, of: 6 });
});

test('a template fills only the steps not answered yet', () => {
  const d = { ...emptyDraft(), stay: 'dorm', explore: { ...emptyDraft().explore, shapes: ['road'] } };
  const tpl = draftFromTemplate('family');
  const out = applyTemplate(d, tpl, new Set(['spend', 'shapes']));
  assert.equal(out.who.kind, 'family');
  assert.equal(out.stay, 'dorm', 'the answered bed stays');
  assert.deepEqual(out.explore.shapes, ['road'], 'the answered shape stays');
  assert.equal(out.days.pace, tpl.days.pace, 'an unanswered step takes the template');
  assert.equal(out.nameKey, tpl.nameKey);
});

test('the first way picked is the one Explore prices; none is any', () => {
  let d = { ...emptyDraft(), ways: [], way: 'any' };
  d = toggleWay(d, 'train');
  d = toggleWay(d, 'plane');
  assert.deepEqual([d.way, d.ways], ['train', ['train', 'plane']]);
  d = toggleWay(d, 'train');
  assert.deepEqual([d.way, d.ways], ['plane', ['plane']]);
  d = toggleWay(d, 'plane');
  assert.deepEqual([d.way, d.ways], ['any', []]);
});

test('likes stop at three', () => {
  assert.deepEqual(togglePick(['a', 'b', 'c'], 'd', 3), ['a', 'b', 'c']);
  assert.deepEqual(togglePick(['a', 'b'], 'a', 3), ['b']);
});

test('an empty name saves as the who template name, never "My style"', () => {
  const out = draftToSave({ ...emptyDraft(), name: '  ', nameKey: '' });
  assert.equal(out.nameKey, `styles.t.${out.who.kind}`);
  assert.ok(en[out.nameKey]);
  assert.equal(draftToSave({ ...emptyDraft(), name: 'Ours' }).nameKey, '');
});

test('every step has its question and short name in English', () => {
  for (const s of STEPS) assert.ok(en[`studio.s.${s}`], s);
  for (const s of [...EXPLORE_STEPS, 'who', 'spend', 'way', 'priority']) assert.ok(en[`studio.q.${s}`], s);
  for (const s of EXPLORE_STEPS) assert.ok(en[`studio.why.${s}`], s);
});

test('studio copy keeps the house rules', () => {
  const banned = /\b(seamless|unlock|effortless|elevate|leverage|empower|curated|simply|just|easy)\b/i;
  for (const [k, v] of Object.entries(en).filter(([k]) => k.startsWith('studio.'))) {
    assert.ok(!/[–—·•€]/.test(v), `${k}: ${v}`);
    assert.ok(!banned.test(v), `${k}: ${v}`);
  }
});
