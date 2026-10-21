// T506 (roadmap 1.19): search on a total budget. Every destination is priced
// through the one engine, lib/tripTotal.js priceTrip(); these tests check the
// search adds no second formula (its bed and food lines are priceTrip's parts
// for the very trip the planner would price), the buffer is on by default,
// the receipt sums to the total in whole euros, nothing unpriced carries an
// amount, and the rules from the 2.22 plan always hold: more budget never
// gives fewer results, another person never makes a total lower, a place in
// Fits always has its total within the budget.
// Run: npm test (continent-app/). Synthetic places; a real-data block runs
// only where public/app_data.json is on the machine.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  parseBudget, normalizeQuery, startForMonth, nextMonth, priceForBudget, budgetSearch,
  budgetReceipt, budgetTripState, verdictOf, BUFFER_DEFAULT, UNPRICED,
} from "../src/lib/budgetSearch.js";
import { priceTrip, wizardPlannerState } from "../src/lib/tripTotal.js";

const TODAY = new Date(2026, 9, 21); // 21 Oct 2026

function place(id, { night = 40, meal = 14, level = "city", foodLevel = "city", best = [5, 6, 7, 8, 9, 10], score = 7.5 } = {}) {
  return {
    id,
    city: id,
    iso2: "IT",
    tier: "city",
    rating: { score },
    climate: { best },
    accommodation: {
      per_person_night_eur: night,
      cleaning_per_person_eur: 10,
      entire_home_night_eur: night * 3,
      typical_capacity: 3,
      level,
      seasonality: [0.9, 0.9, 1, 1, 1.1, 1.2, 1.3, 1.3, 1.1, 1, 0.9, 1],
    },
    costs: {
      meal_mid_eur: meal * 2, meal_cheap_eur: meal, fastfood_eur: 9, drink_out_eur: 4,
      cocktail_eur: 9, coffee_eur: 2, grocery_day_eur: 11, club_entry_eur: 10, level: foodLevel,
    },
  };
}

const CHEAP = place("cheap", { night: 22, meal: 9, score: 7.0 });
const MID = place("mid", { night: 45, meal: 15, score: 8.4, foodLevel: "country" });
const DEAR = place("dear", { night: 120, meal: 30, score: 8.9, best: [6, 7, 8] });
const ALL = [CHEAP, MID, DEAR];

test("parseBudget reads a typed total as whole euros", () => {
  assert.equal(parseBudget("1500"), 1500);
  assert.equal(parseBudget("1.500"), 1500);
  assert.equal(parseBudget("1,500"), 1500);
  assert.equal(parseBudget("€ 1 500"), 1500);
  assert.equal(parseBudget("1500,50"), 1500);
  assert.equal(parseBudget("1.500,50"), 1500);
  assert.equal(parseBudget(1499.9), 1499);
  assert.equal(parseBudget(""), null);
  assert.equal(parseBudget("abc"), null);
  assert.equal(parseBudget("0"), null);
});

test("a query fills every field but the budget, buffer 10% on by default", () => {
  const q = normalizeQuery({ budget: "1500" }, TODAY);
  assert.equal(q.budget, 1500);
  assert.equal(q.adults, 2);
  assert.equal(q.days, 5);
  assert.equal(q.nights, 4);
  assert.equal(q.month, nextMonth(TODAY));
  assert.equal(q.buffer, BUFFER_DEFAULT);
  assert.equal(BUFFER_DEFAULT, 0.1);
  assert.equal(normalizeQuery({ budget: "9", buffer: 0.33 }, TODAY).buffer, 0.1, "an unknown buffer step falls back");
  assert.equal(normalizeQuery({ budget: "9", buffer: 0 }, TODAY).buffer, 0, "the buffer can be turned off");
  assert.equal(normalizeQuery({}, TODAY).budget, null);
});

test("the month names a real start date, never one in the past", () => {
  assert.equal(startForMonth(10, TODAY), "2026-10-24", "the running month starts from the next Saturday");
  assert.equal(startForMonth(11, TODAY), "2026-11-07");
  assert.equal(startForMonth(2, TODAY), "2027-02-06", "February is next year's, past the flight window");
  assert.equal(startForMonth(11, new Date(2026, 10, 29)), "2027-11-06", "no Saturday left this month");
  const q = normalizeQuery({ budget: 1500, month: 10, days: 5 }, TODAY);
  assert.equal(q.start, "2026-10-24");
  assert.equal(q.end, "2026-10-28");
});

test("the search prices beds and food with priceTrip, nothing of its own", () => {
  const q = normalizeQuery({ budget: 1500, adults: 2, days: 5, month: 10 }, TODAY);
  for (const d of ALL) {
    const p = priceForBudget(d, q);
    // The trip the planner would price for the same stay.
    const state = wizardPlannerState({
      startDate: q.start, groupSize: 2, transport: "auto",
      stops: [{ destinationId: d.id, nights: q.nights }],
    });
    const planned = priceTrip(state, { data: { destinations: { [d.id]: d } } });
    assert.equal(p.beds, Math.round(planned.parts.beds), `${d.id} beds`);
    assert.equal(p.days, Math.round(planned.parts.days), `${d.id} food and drink`);
    const own = priceTrip(budgetTripState(d.id, q), { data: { destinations: { [d.id]: d } } });
    assert.equal(own.parts.travel + own.parts.transfers + own.parts.drive + own.parts.car, 0,
      "no getting-there figure of Carta's enters the total");
  }
});

test("the receipt sums to the total in whole euros, unpriced lines carry no amount", () => {
  const q = normalizeQuery({ budget: 1500, adults: 2, days: 5, month: 10 }, TODAY);
  for (const d of ALL) {
    const p = priceForBudget(d, q);
    const r = budgetReceipt(p, q);
    const sum = r.lines.reduce((n, l) => n + l.eur, 0);
    assert.equal(sum, r.total, `${d.id} lines sum to the total`);
    for (const l of r.lines) assert.ok(Number.isInteger(l.eur), `${d.id} ${l.key} is whole euros`);
    assert.equal(r.lines.find((l) => l.key === "buffer").eur, Math.round((p.beds + p.days) * 0.1));
    assert.deepEqual(r.unpriced.map((u) => u.key), UNPRICED);
    for (const u of r.unpriced) assert.equal(u.eur, undefined, `${u.key} has no amount`);
    assert.equal(r.left, 1500 - r.total);
  }
  const off = normalizeQuery({ budget: 1500, buffer: 0 }, TODAY);
  assert.ok(!budgetReceipt(priceForBudget(MID, off), off).lines.some((l) => l.key === "buffer"),
    "no buffer line when the buffer is off");
});

test("estimates are marked by the isNational rule", () => {
  const q = normalizeQuery({ budget: 1500 }, TODAY);
  assert.equal(priceForBudget(CHEAP, q).est, false, "a town measured for both");
  assert.equal(priceForBudget(MID, q).est, true, "a country food basket");
});

test("thin data gives no figure", () => {
  const q = normalizeQuery({ budget: 1500 }, TODAY);
  assert.equal(priceForBudget({ ...CHEAP, accommodation: null }, q), null);
  assert.equal(priceForBudget({ ...CHEAP, costs: null }, q), null);
  assert.equal(priceForBudget({ ...CHEAP, accommodation: { level: "city" } }, q), null);
});

test("fits, tight and over follow the buffer", () => {
  const p = { core: 1000, buffer: 100, total: 1100 };
  assert.deepEqual(verdictOf(p, 1200), { group: "fits", left: 100 });
  assert.deepEqual(verdictOf(p, 1100), { group: "fits", left: 0 });
  assert.deepEqual(verdictOf(p, 1050), { group: "tight", left: 50 });
  assert.equal(verdictOf(p, 999).group, "over");
  assert.equal(verdictOf({ core: 1000, buffer: 0, total: 1000 }, 999).group, "over", "no tight without a buffer");
});

test("the rules that always hold", () => {
  const months = [1, 4, 7, 10];
  for (const month of months) {
    let prevCount = -1;
    for (const budget of [300, 500, 800, 1200, 2000, 4000]) {
      const r = budgetSearch(ALL, { budget, adults: 2, days: 5, month }, {}, TODAY);
      const count = r.fits.length + r.tight.length;
      assert.ok(count >= prevCount, `more budget never gives fewer results (${budget}, month ${month})`);
      prevCount = count;
      for (const x of r.fits) assert.ok(x.total <= budget, "a place in Fits is within the budget");
      for (const x of r.tight) assert.ok(x.core <= budget && x.total > budget, "a tight place fits only by its buffer");
    }
    for (const d of ALL) {
      let prev = 0;
      for (const adults of [1, 2, 3, 4, 6]) {
        const p = priceForBudget(d, normalizeQuery({ budget: 1, adults, month }, TODAY));
        assert.ok(p.total >= prev, `another person never lowers the total (${d.id}, ${adults})`);
        prev = p.total;
      }
      const two = priceForBudget(d, normalizeQuery({ budget: 1, adults: 2, month }, TODAY));
      const kid = priceForBudget(d, normalizeQuery({ budget: 1, adults: 2, children: 1, month }, TODAY));
      const three = priceForBudget(d, normalizeQuery({ budget: 1, adults: 3, month }, TODAY));
      assert.ok(kid.total >= two.total && kid.total <= three.total, `a child costs less than an adult (${d.id})`);
    }
  }
});

test("results sort in season first, then the Score, and just-over is summed", () => {
  const r = budgetSearch(ALL, { budget: 4000, adults: 2, days: 5, month: 10 }, {}, TODAY);
  assert.deepEqual(r.fits.map((x) => x.id), ["mid", "cheap", "dear"], "dear is out of season in October");
  const dear = priceForBudget(DEAR, normalizeQuery({ budget: 1, adults: 2, days: 5, month: 10 }, TODAY));
  const tightBudget = dear.total - 1;
  const near = budgetSearch([DEAR], { budget: Math.floor(dear.total / 1.1), adults: 2, days: 5, month: 10 }, {}, TODAY);
  assert.equal(near.over.count, 1);
  assert.ok(near.over.more >= dear.total - near.query.budget && near.over.more % 50 === 0);
  assert.equal(budgetSearch([DEAR], { budget: tightBudget, adults: 2, days: 5, month: 10 }, {}, TODAY).tight.length, 1);
  assert.equal(budgetSearch(ALL, { adults: 2 }, {}, TODAY).fits.length, 0, "no budget, no search");
});

const DATA = new URL("../public/app_data.json", import.meta.url);
const have = existsSync(DATA);

test("the worked example: 2 people, 1,500, 5 days in October", { skip: have ? false : "public/app_data.json is not on this machine" }, () => {
  const data = JSON.parse(readFileSync(DATA, "utf8"));
  const list = Object.values(data.destinations);
  const t0 = performance.now();
  const r = budgetSearch(list, { budget: "1500", adults: 2, days: 5, month: 10 }, {}, TODAY);
  const ms = performance.now() - t0;
  assert.ok(r.fits.length > 0, "something fits");
  assert.ok(ms < 2000, `the whole catalogue prices in under 2 s in node (${ms.toFixed(0)} ms)`);
  for (const x of [...r.fits, ...r.tight].slice(0, 50)) {
    const rec = budgetReceipt(x, r.query);
    assert.equal(rec.lines.reduce((n, l) => n + l.eur, 0), rec.total);
  }
});
