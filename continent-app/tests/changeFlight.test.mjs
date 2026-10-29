import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightRows } from '../src/planner/trip/changeFlight.js';
import { fitsPrefs, pickLeg } from '../src/lib/flights/flights.js';

const day = {
  checked: '2026-10-29T10:00:00Z',
  flights: [
    { price: 96, airline: 'FR', dep: '06:30', arr: '13:15', stops: 1, min: 405 },
    { price: 120, airline: 'OS', dep: '18:20', arr: '20:05', stops: 0, min: 105 },
    { price: 140, airline: 'KL', dep: '09:10', arr: '12:40', stops: 0, min: 150 },
  ],
};

test('fitsPrefs: direct only, and a departure window in whole hours', () => {
  assert.equal(fitsPrefs(day.flights[0], null), true);
  assert.equal(fitsPrefs(day.flights[0], { direct: true }), false);
  assert.equal(fitsPrefs(day.flights[2], { direct: true, after: 8, before: 12 }), true);
  assert.equal(fitsPrefs(day.flights[1], { after: 8, before: 12 }), false);
  assert.equal(fitsPrefs({ dep: '' }, { after: 0, before: 24 }), true);
});

// The live API answers cheapest first, as here.
test('pickLeg prices the cheapest flight that fits the trip\'s preferences', () => {
  const any = pickLeg({ file: null, live: day, dir: 'out', airport: 'SZG', date: '2026-11-21' });
  assert.equal(any.airline, 'FR');
  const direct = pickLeg({ file: null, live: day, dir: 'out', airport: 'SZG', date: '2026-11-21', prefs: { direct: true } });
  assert.equal(direct.airline, 'OS');
  const morning = pickLeg({ file: null, live: day, dir: 'out', airport: 'SZG', date: '2026-11-21', prefs: { direct: true, after: 6, before: 12 } });
  assert.equal(morning.airline, 'KL');
});

test('flightRows lists the fitting flights cheapest first, against the priced one', () => {
  const current = { ...day.flights[0], cost: { total: 232 } };
  const { rows, known } = flightRows({ answer: day, current, party: { paying: 2 } });
  assert.equal(known, true);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].current, true);
  assert.equal(rows[0].delta, 0);
  assert.ok(rows.every((r, i) => i === 0 || r.total >= rows[i - 1].total));
  assert.ok(rows.slice(1).every((r) => Number.isFinite(r.delta)));
  const direct = flightRows({ answer: day, current, prefs: { direct: true }, party: { paying: 2 } });
  assert.deepEqual(direct.rows.map((r) => r.leg.airline), ['OS', 'KL']);
});

test('without a live answer only the priced flight is known', () => {
  const current = { ...day.flights[0], cost: { total: 232 } };
  const r = flightRows({ answer: null, current });
  assert.equal(r.known, false);
  assert.equal(r.rows.length, 1);
  assert.deepEqual(flightRows({}), { rows: [], known: false });
});
