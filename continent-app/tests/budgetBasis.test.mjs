// G12 lane L1 (plan rethink decision §3.4): one basis for a budget. A day
// budget is bed plus days a person a night, in the finder, on the card and
// on the trip page alike; a trip budget is the whole trip. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { budgetKind, budgetRulerFor, dayBasisSpend, tripSpendOn } from "../src/lib/budgetBasis.js";
import { budgetCheck } from "../src/planner/flow/budget.js";
import { budgetBadge, withSlot } from "../src/planner/finder/finderText.js";

const quote = { perPerson: 1400, parts: { beds: 840, days: 560, flights: 600 } };
const trip = (extra = {}) => {
  const t = {
    id: "t", nights: 7, party: { adults: 2, children: 0, babies: 0, head: 2 },
    slots: [{ id: "flight", eur: 300, eurGroup: 600 }, { id: "stay", eur: 420, eurGroup: 840 }, { id: "food", eur: 280, eurGroup: 560 }],
    total: { perPerson: 1400, group: 2800 },
    ...extra,
  };
  Object.defineProperty(t, "quote", { value: quote, enumerable: false });
  return t;
};

test("the stored kind: anything but 'total' is a day budget, as tripSettings stores it", () => {
  assert.equal(budgetKind({ kind: "total" }), "total");
  assert.equal(budgetKind({ kind: "day" }), "day");
  assert.equal(budgetKind({}), "day");
});

test("the day basis: bed and days a person a night, from the engine's group parts", () => {
  assert.equal(dayBasisSpend(quote.parts, 2, 7), 100);
  assert.equal(dayBasisSpend(quote.parts, 2, 0), null);
  assert.equal(dayBasisSpend(null, 2, 7), null);
});

test("the finder trip and the trip page read one figure for one day budget", () => {
  const budget = { kind: "day", eur: 90 };
  const ruler = budgetRulerFor(trip(), budget);
  const page = budgetCheck(quote, budget, { party: 2, nights: 7 });
  assert.deepEqual(ruler, { eur: 90, kind: "day", delta: 10 });
  assert.deepEqual(page, { over: true, gap: 10 });
});

test("a trip budget is the whole trip, flight included", () => {
  assert.equal(tripSpendOn(trip(), "total"), 1400);
  assert.deepEqual(budgetRulerFor(trip(), { kind: "total", eur: 1500 }), { eur: 1500, kind: "total", delta: -100 });
  assert.equal(budgetRulerFor(trip(), { kind: "total", eur: 0 }), null);
});

test("the badge names a day gap as a day's", () => {
  const day = { ...trip(), budget: { eur: 90, kind: "day", delta: 10 } };
  assert.equal(budgetBadge(day).key, "tf.card.overDay");
  assert.equal(budgetBadge({ ...day, budget: { eur: 110, kind: "day", delta: -10 } }).key, "tf.card.underDay");
  assert.equal(budgetBadge({ ...day, budget: { eur: 1500, kind: "total", delta: -100 } }).key, "tf.card.under");
  assert.equal(budgetBadge({ ...day, budget: { eur: 90, kind: "day", delta: null } }), null, "an unknown spend has no badge");
});

test("a swap on a trip without its pricing context keeps the ruler's basis", () => {
  const t = { ...trip(), budget: { eur: 1500, kind: "total", delta: -100 } };
  // Flight 300 + stay 420 + food 380 = 1,100 a person, 400 under.
  const swapped = withSlot(t, { id: "food", eur: 380, eurGroup: 760 });
  assert.deepEqual(swapped.budget, { eur: 1500, kind: "total", delta: -400 });
});
