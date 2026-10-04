import test from 'node:test';
import assert from 'node:assert/strict';
import {
  previewWords, stripCells, cycleLevel, placeExits, bboxCentre, pointCentre,
} from '../src/lib/detailSkeleton.js';

const t = (k) => k;

test('previewWords keeps six words and never ends on a joining word', () => {
  assert.equal(previewWords('Trains run hourly from the main station to the lake.'), 'Trains run hourly from the main');
  assert.equal(previewWords('Bring cash and a card for the boats.'), 'Bring cash and a card');
  assert.equal(previewWords('Short one. Then more.'), 'Short one');
  assert.equal(previewWords(''), '');
});

test('stripCells always gives three cells in a fixed order', () => {
  const full = stripCells({ level: 3, word: 'Hard', type: 'day hike', number: '9.2 km' }, t);
  assert.deepEqual(full.map((c) => c.key), ['diff', 'type', 'num']);
  assert.equal(full[0].level, 3);
  assert.equal(full[1].word, 'Day hike');
  assert.equal(full[2].mono, true);
  const empty = stripCells({}, t);
  assert.equal(empty.length, 3);
  assert.equal(empty[0].level, 0);
  assert.equal(empty[0].word, 'detail.stripUngraded');
  assert.equal(empty[2].word, 'detail.stripUnmeasured');
  assert.equal(empty[2].mono, false);
  assert.equal(stripCells({ level: 9 }, t)[0].level, 5);
});

test('cycleLevel reads climb per kilometre', () => {
  assert.equal(cycleLevel(100, 200), 1);
  assert.equal(cycleLevel(55, 300), 2);
  assert.equal(cycleLevel(50, 600), 3);
  assert.equal(cycleLevel(55, 878), 4);
  assert.equal(cycleLevel(null, 100), 0);
  assert.equal(cycleLevel(40, undefined), 0);
});

test('placeExits picks easier, cheaper and nearby, then fills', () => {
  const me = { id: 'me', lat: 45, lon: 7, lv: 3, stay: 100 };
  const rows = [
    me,
    { id: 'near', lat: 45.01, lon: 7, lv: 3, stay: 100 },
    { id: 'easy', lat: 45.1, lon: 7, lv: 1, stay: 100 },
    { id: 'cheap', lat: 45.2, lon: 7, lv: 4, stay: 60 },
    { id: 'far', lat: 46, lon: 7, lv: 1, stay: 20 },
  ];
  const out = placeExits(me, rows, {
    centre: pointCentre, level: (r) => r.lv, stay: (r) => r.stay,
  });
  assert.deepEqual(out.map((e) => [e.kind, e.row.id]),
    [['easier', 'easy'], ['cheaper', 'cheap'], ['nearby', 'near']]);
  // The easiest place has no easier sibling: the slot is filled with the next closest.
  const flat = placeExits({ ...me, lv: 1 }, rows, {
    centre: pointCentre, level: (r) => r.lv, stay: () => null,
  });
  assert.deepEqual(flat.map((e) => e.kind), ['nearby', 'nearby', 'nearby']);
  assert.equal(flat[0].row.id, 'near');
  // Never the page itself, never more than the country holds.
  assert.equal(placeExits(me, [me], { centre: pointCentre }).length, 0);
});

test('bboxCentre and pointCentre refuse bad input', () => {
  assert.deepEqual(bboxCentre([6, 44, 8, 46]), { lat: 45, lon: 7 });
  assert.equal(bboxCentre([6, 44, 8]), null);
  assert.equal(bboxCentre(null), null);
  assert.equal(pointCentre({ lat: NaN, lon: 1 }), null);
});
