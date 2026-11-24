// G12 plan rethink B5 (lane L8, decision §3.4): the budget as a ceiling or a
// guide, "Just over" (up to 3 within +10%), money left, and verdicts that
// only compare like with like (a "Not yet" line never fits).
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { budgetSplit, moneyLeft, tripVerdict, NEAR_MAX } from "../src/lib/recommend/budgetCompass.js";
import { budgetBadge } from "../src/planner/finder/finderText.js";

const slots = (flight = 300) => [
  { id: "flight", eur: flight }, { id: "stay", eur: 400 }, { id: "food", eur: 200 }, { id: "activities", eur: null },
];
const trip = (id, perPerson, { flight = 300 } = {}) => ({
  id, slots: slots(flight), total: { perPerson, group: perPerson * 2 }, party: { head: 2 }, nights: 7,
});
const cap = { eur: 1000, kind: "total", per: "person", mode: "cap" };

test("a guide keeps every trip; a ceiling drops the ones over it", () => {
  const trips = [trip("a", 900), trip("b", 1050), trip("c", 1500)];
  assert.equal(budgetSplit(trips, { ...cap, mode: "soft" }).list.length, 3);
  const s = budgetSplit(trips, cap);
  assert.deepEqual(s.list.map((x) => x.id), ["a"]);
  assert.deepEqual(s.near.map((x) => x.trip.id), ["b"]);
  assert.equal(s.out, 2);
});

test("Just over: at most three, within 10 percent, least over first", () => {
  const trips = [trip("a", 1090), trip("b", 1010), trip("c", 1050), trip("d", 1080), trip("e", 1101)];
  const s = budgetSplit(trips, cap);
  assert.equal(s.near.length, NEAR_MAX);
  assert.deepEqual(s.near.map((x) => x.trip.id), ["b", "c", "d"]);
});

test("a trip with a Not yet line is never fitting and never dropped", () => {
  const t = trip("x", 600, { flight: null });
  assert.equal(tripVerdict(t, cap).state, "unknown");
  assert.deepEqual(tripVerdict(t, cap).missing, ["flight"]);
  assert.deepEqual(budgetSplit([t], cap).list.map((x) => x.id), ["x"]);
  // A day budget reads only bed and food, so a missing flight is not its business.
  const day = { eur: 100, kind: "day", mode: "cap" };
  assert.deepEqual(tripVerdict(t, day).missing, []);
});

test("the card names what an under-budget trip figure leaves out, and judges no Not yet total", () => {
  const under = { ...trip("a", 900), budget: { eur: 1000, kind: "total", delta: -100 } };
  assert.equal(budgetBadge(under).key, "tf.card.underNoTickets");
  const notYet = { ...trip("b", 600, { flight: null }), budget: { eur: 1000, kind: "total", delta: -400 } };
  assert.equal(budgetBadge(notYet), null);
});

test("money left: the group's, only with every line priced and under budget", () => {
  const priced = { perPerson: 800, parts: { beds: 560, days: 280 } };
  assert.deepEqual(moneyLeft(priced, cap, { party: 2, nights: 7 }), { person: 200, group: 400 });
  assert.equal(moneyLeft(priced, cap, { party: 2, nights: 7, missing: ["travel"] }), null);
  assert.equal(moneyLeft({ perPerson: 1200 }, cap, { party: 2 }), null);
  // Day basis: (560 + 280) / 2 / 7 = 60 a night against 80: 20 a night left.
  const left = moneyLeft(priced, { eur: 80, kind: "day" }, { party: 2, nights: 7, missing: ["travel"] });
  assert.deepEqual(left, { person: 140, group: 280, perNight: 20 });
  assert.equal(moneyLeft(priced, null), null);
});
