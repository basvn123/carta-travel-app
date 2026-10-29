import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datesOptions, nightsOptions, applyNights } from '../src/lib/tripBalance.js';

const stops = [{ destinationId: 'hal', nights: 4 }, { destinationId: 'szg', nights: 3 }];

test('dates that hold the stops ask nothing', () => {
  assert.deepEqual(datesOptions(stops, '2026-11-21', '2026-11-28'), []);
  assert.deepEqual(datesOptions(stops, '', '2026-11-28'), []);
});

test('a longer window offers the extra night to each stop, the last first, then keeping the stops', () => {
  const o = datesOptions(stops, '2026-11-21', '2026-11-29');
  assert.deepEqual(o[0], { kind: 'stop', index: 1, nights: 4 });
  assert.deepEqual(o[1], { kind: 'stop', index: 0, nights: 5 });
  assert.deepEqual(o[2], { kind: 'keep', end: '2026-11-28' });
});

test('a shorter window takes from the longest stay first and never leaves a stop without a night', () => {
  const o = datesOptions(stops, '2026-11-21', '2026-11-25');
  // 4 nights against 7: Hallstatt (4) can give 3 and keep 1; Salzburg (3) cannot
  assert.deepEqual(o, [{ kind: 'stop', index: 0, nights: 1 }, { kind: 'keep', end: '2026-11-28' }]);
});

test('a stop that gets a night inside fixed dates moves the end or takes it from another stop', () => {
  const o = nightsOptions(stops, 0, 5, '2026-11-21', '2026-11-28');
  assert.deepEqual(o, [{ kind: 'end', end: '2026-11-29' }, { kind: 'stop', index: 1, nights: 2 }]);
  const less = nightsOptions(stops, 0, 3, '2026-11-21', '2026-11-28');
  assert.deepEqual(less, [{ kind: 'end', end: '2026-11-27' }, { kind: 'stop', index: 1, nights: 4 }]);
  assert.deepEqual(nightsOptions(stops, 0, 4, '2026-11-21', '2026-11-28'), []);
  assert.deepEqual(nightsOptions(stops, 0, 5, '', ''), []);
});

test('applyNights sets the changed stop and the one the choice names', () => {
  const next = applyNights(stops, { kind: 'stop', index: 1, nights: 2 }, { index: 0, nights: 5 });
  assert.deepEqual(next.map((s) => s.nights), [5, 2]);
  assert.deepEqual(applyNights(stops, { kind: 'keep' }).map((s) => s.nights), [4, 3]);
});
