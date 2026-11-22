// G12 My trips atlas: the journey line's geometry (pills by nights, a bead per day).
// Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  journeyModel, journeyDays, spendDiameter, nightsLeft, SPEND_MIN, SPEND_MAX,
} from '../src/auth/mytrips/atlas/journeyLine.js';

const TRIP = [{ city: 'Porto', nights: 3 }, { city: 'Lisbon', nights: 2 }, { city: 'Lagos', nights: 1 }];

test('one bead per day, one pill per stop sized by nights', () => {
  const m = journeyModel({ stops: TRIP, dayNum: 4, width: 300 });
  assert.equal(m.days, 6);
  assert.equal(journeyDays(TRIP), 6);
  assert.equal(m.beads.length, 6);
  assert.equal(m.pills.length, 3);
  // Porto (3 nights) is three times as long as Lagos (1 night).
  assert.ok(Math.abs(m.pills[0].w - 3 * m.pills[2].w) < 1e-9);
  assert.equal(m.mode, 'beads');
});

test('days gone are done, today is the one today bead, the rest are to come', () => {
  const m = journeyModel({ stops: TRIP, dayNum: 4, width: 300 });
  assert.deepEqual(m.beads.map((b) => b.state), ['done', 'done', 'done', 'today', 'later', 'later']);
  assert.equal(m.beads.filter((b) => b.state === 'today').length, 1);
  assert.equal(m.todayX, m.beads[3].cx);
  // Today's stop is Lisbon (days 4 and 5).
  assert.deepEqual(m.pills.map((p) => p.here), [false, true, false]);
  assert.ok(m.beads[3].r > m.beads[0].r);
});

test('the card variant draws every day as to come, with no today', () => {
  const m = journeyModel({ stops: TRIP, dayNum: 0, width: 300, variant: 'card' });
  assert.ok(m.beads.every((b) => b.state === 'later'));
  assert.equal(m.todayX, null);
});

test('long trips: small beads over 21 days, pills only over 40 with today kept', () => {
  const long = [{ city: 'A', nights: 12 }, { city: 'B', nights: 12 }];
  const s = journeyModel({ stops: long, dayNum: 5, width: 300 });
  assert.equal(s.mode, 'small');
  assert.equal(s.beads.length, 24);
  assert.ok(s.beads[0].r < journeyModel({ stops: TRIP, dayNum: 4, width: 300 }).beads[0].r);
  const p = journeyModel({ stops: [{ city: 'A', nights: 25 }, { city: 'B', nights: 20 }], dayNum: 30, width: 300 });
  assert.equal(p.mode, 'pills');
  assert.equal(p.beads.length, 0);
  assert.ok(p.todayX > p.pills[1].x);
});

test('a stop name shows only when its pill is 48 px or wider', () => {
  const m = journeyModel({ stops: [{ city: 'Long', nights: 9 }, { city: 'Short', nights: 1 }], dayNum: 1, width: 200 });
  assert.equal(m.pills[0].label, true);
  assert.equal(m.pills[1].label, false);
});

test('spend beads: square root scale from 6 to 22 px, days to come never counted', () => {
  assert.equal(spendDiameter(0, 100), SPEND_MIN);
  assert.equal(spendDiameter(null, 100), SPEND_MIN);
  assert.equal(spendDiameter(100, 100), SPEND_MAX);
  // A quarter of the largest day is half way up the scale (square root).
  assert.equal(spendDiameter(25, 100), (SPEND_MIN + SPEND_MAX) / 2);
  const totals = [{ eur: 64 }, { eur: 0 }, { eur: null }, { eur: 16 }, { eur: 900 }, { eur: null }];
  const m = journeyModel({ stops: TRIP, dayNum: 4, width: 300, variant: 'spend', dayTotals: totals });
  assert.deepEqual(m.beads.map((b) => b.state), ['spend', 'none', 'none', 'today', 'later', 'later']);
  // Day 5's 900 is a day to come: it is not the scale's top, day 1's 64 is.
  assert.equal(m.max, 64);
  assert.equal(m.beads[0].r * 2, SPEND_MAX);
  assert.equal(m.beads[1].r * 2, SPEND_MIN);
  assert.equal(m.beads[4].r * 2, SPEND_MIN);
  assert.equal(m.beads[4].eur, null);
});

test('nights left in the stop: 1 is the last night', () => {
  assert.equal(nightsLeft({ nights: 2 }, 0), 2);
  assert.equal(nightsLeft({ nights: 2 }, 1), 1);
  assert.equal(nightsLeft({ nights: 1 }, 3), 1);
});

test('an empty trip draws nothing', () => {
  const m = journeyModel({ stops: [], dayNum: 1 });
  assert.equal(m.days, 0);
  assert.equal(m.beads.length, 0);
});
