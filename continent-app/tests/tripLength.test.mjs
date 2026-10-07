// Trip length (T101): the short version of a seven-day trip.
// Run: npm test  (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import {
  shortDayCount, dayScore, pickShortRun, scalePair, scaleBudget, tripLengths, cardTotal, SHORT, WEEK,
} from "../src/lib/tripLength.js";

const day = (n, text = "") => ({ day: n, morning: text, afternoon: "", evening: "", dayStats: null });
const week = (texts) => texts.map((t, i) => day(i + 1, t));

test("a hard trip keeps three days, any other four", () => {
  assert.equal(shortDayCount(2), 4);
  assert.equal(shortDayCount(null), 4);
  assert.equal(shortDayCount(4), 3);
  assert.equal(shortDayCount(5), 3);
  assert.equal(shortDayCount(2, 3), 2, "never the whole of a short week");
});

test("a day that names more places scores higher", () => {
  assert.ok(dayScore(day(1, "Walk to the Belvedere, then the Hundertwasserhaus and the Rochusmarkt.")) > dayScore(day(1, "Rest day.")));
  assert.ok(dayScore(day(1, "See **Pic de Comapedrosa** at dawn.")) > dayScore(day(1, "See the peak at dawn.")));
  assert.equal(dayScore(null), 0);
});

test("the short run is unbroken and takes the richest days", () => {
  const rich = "Visit the Belvedere, the Hundertwasserhaus and the Rochusmarkt today.";
  const run = pickShortRun(week(["", "", rich, rich, rich, rich, ""]), 4);
  assert.deepEqual(run.indexes, [2, 3, 4, 5]);
});

test("a tie goes to the later run", () => {
  const run = pickShortRun(week(["", "", "", "", "", "", ""]), 4);
  assert.deepEqual(run.indexes, [3, 4, 5, 6]);
});

test("scaling takes the share of the week and keeps whole euros", () => {
  assert.deepEqual(scalePair({ low: 700, high: 1400 }, 4, 7), { low: 400, high: 800 });
  assert.equal(scalePair(null, 4, 7), null);
  const b = { totalEur: { low: 780, high: 1250 }, perDayEur: { low: 111, high: 179 },
    breakdown: { accommodation: { lowEur: 300, highEur: 470, note: "x" }, food: { lowEur: 190, highEur: 300 } } };
  const s = scaleBudget(b, 4, 7);
  assert.deepEqual(s.totalEur, { low: 446, high: 714 });
  assert.equal(s.breakdown.accommodation.lowEur, 171);
  assert.equal(s.breakdown.accommodation.note, "x");
  assert.deepEqual(s.perDayEur, b.perDayEur, "a day costs what it cost");
  assert.equal(scaleBudget(b, 7, 7), b, "the full week is the authored budget itself");
  assert.equal(b.totalEur.low, 780, "the input is not changed");
});

test("every trip gets two lengths with two totals", () => {
  const trip = {
    profile: { difficulty: 2 }, durationDays: 7,
    itinerary: week(["A", "B", "C", "D", "E", "F", "G"]),
    budget: { totalEur: { low: 700, high: 1400 } },
  };
  const L = tripLengths(trip);
  assert.equal(L.week.days, 7);
  assert.equal(L.short.days, 4);
  assert.equal(L.short.indexes.length, 4);
  assert.deepEqual(L.week.budget.totalEur, { low: 700, high: 1400 });
  assert.deepEqual(L.short.budget.totalEur, { low: 400, high: 800 });
});

test("a card's total follows the length chosen", () => {
  const card = { days: 7, diff: 4, eur: { low: 700, high: 1400 } };
  assert.deepEqual(cardTotal(card, WEEK), { low: 700, high: 1400, days: 7 });
  assert.deepEqual(cardTotal(card, SHORT), { low: 300, high: 600, days: 3 });
  assert.equal(cardTotal({ days: 7 }, SHORT), null);
});
