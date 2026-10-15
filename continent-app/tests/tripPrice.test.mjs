// T431: the week's price at the traveller's choices. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { tripPrice, includedRows } from "../src/lib/tripPrice.js";

const budget = {
  totalEur: { low: 400, high: 800 },
  breakdown: {
    accommodation: { lowEur: 150, highEur: 350 },
    food: { lowEur: 150, highEur: 250 },
    transport: { lowEur: 60, highEur: 120 },
    activities: { lowEur: 40, highEur: 80 },
  },
};

test("sleep moves the bed line, spending moves the rest", () => {
  const p = tripPrice(budget, { sleepShare: 0, spendShare: 1 });
  assert.equal(p.rows.accommodation, 150);
  assert.equal(p.rows.food, 250);
  assert.equal(p.perPerson, 150 + 250 + 120 + 80);
});

test("the party multiplies a person and the own fare is added once", () => {
  const p = tripPrice(budget, { sleepShare: 0.5, spendShare: 0.5, party: 3, fare: 240.5, days: 7 });
  assert.equal(p.perPerson, 250 + 200 + 90 + 60);
  assert.equal(p.total, 600 * 3 + 240.5);
  assert.equal(p.perDay, Math.round(600 / 7));
});

test("a budget with no lines falls back to its total", () => {
  assert.equal(tripPrice({ totalEur: { low: 300, high: 500 } }, { spendShare: 0.5 }).perPerson, 400);
  assert.equal(tripPrice(null), null);
});

test("what is included says the travel to the start is not, until it is added", () => {
  const trip = { budget };
  assert.equal(includedRows(trip).find((r) => r.key === "travel").in, false);
  assert.equal(includedRows(trip, { fare: 120 }).find((r) => r.key === "travel").in, true);
  assert.equal(includedRows({ ...trip, included: ["Ferry tickets"], notIncluded: ["Flights"] }).length, 2);
});
