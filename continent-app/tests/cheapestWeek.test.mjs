// A month picked without dates starts on its cheapest week (owner, 2026-11-27):
// the swept day whose flight out plus the flight home `nights` later costs least.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cheapestWeekIn } from '../src/lib/flights/flights.js';

const now = Date.parse('2026-11-27T12:00:00Z');
// A swept day as the sweep writes it: [price, airline, dep, arr, stops, checked in minutes].
const checked = Math.round(Date.parse('2026-11-26T08:00:00Z') / 60000);
const day = (price) => [price, 'SN', '10:00', '12:00', 0, checked];
const file = {
  from: 'BRU',
  to: { BCN: { '2026-12-05': day(40), '2026-12-12': day(20), '2026-12-19': day(15) } },
  back: { BCN: { '2026-12-12': day(30), '2026-12-19': day(25), '2026-12-26': day(90), '2027-01-02': day(10) } },
};

test('the cheapest pair of out and home `nights` apart wins, home may fall in the next month', () => {
  const w = cheapestWeekIn(file, 'BCN', '2026-12', 7, now);
  assert.ok(w, 'a week is found');
  // 12 Dec out (20) + 19 Dec home (25) = 45; 5 Dec 40 + 30 = 70; 19 Dec 15 + 26 Dec 90 = 105.
  assert.equal(w.out.date, '2026-12-12');
  assert.equal(w.back.date, '2026-12-19');
  assert.equal(w.perSeat, 45);
  const two = cheapestWeekIn(file, 'BCN', '2026-12', 14, now);
  assert.equal(two.out.date, '2026-12-19', 'home on 2 January, the next month');
});

test('no pair the right nights apart, no airport or no month: null, so the caller keeps its first Saturday', () => {
  assert.equal(cheapestWeekIn(file, 'BCN', '2026-12', 3, now), null);
  assert.equal(cheapestWeekIn(file, 'XXX', '2026-12', 7, now), null);
  assert.equal(cheapestWeekIn(file, 'BCN', null, 7, now), null);
  assert.equal(cheapestWeekIn(null, 'BCN', '2026-12', 7, now), null);
});

test('every home airport file is searched', () => {
  const other = { from: 'CRL', to: { BCN: { '2026-12-05': day(5) } }, back: { BCN: { '2026-12-12': day(5) } } };
  assert.equal(cheapestWeekIn([file, other], 'BCN', '2026-12', 7, now).perSeat, 10);
});
