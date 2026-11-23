// PT-E2 (ROADMAP G4, D10, D22, logic audit E2): one party model, the same people give the same
// seats, cars, kind, caps and day budget on every screen. Written first as `todo` in wave 0b;
// wave 3 made them real. Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E2)
// and owner default 2 (a baby under 2 takes a car seat, a child is 2 to 11, a teen 12 to 17 is
// priced as an adult and keeps kind family). The changed answers sit behind flag E2 (default old):
// each is checked with E2 forced new and, where it moved, with it forced old.
// Run: node --test tests/party.test.mjs (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { partyOf, carsFor, carsOf, kindFits, kindOfCounts, partyFromAges } from "../src/lib/party.js";
import { withFlags } from "../src/lib/flags.js";
import { rule } from "../src/lib/price/config.js";
import { carsAt } from "../scripts/eval/lib/party-engine.mjs";
import { legKg } from "../src/lib/footprint/footprint.js";
import { budgetCheck } from "../src/planner/flow/budget.js";
import { styleFromChoices } from "../src/lib/travelStyles.js";

const NEW = (fn) => withFlags({ E2: "new" }, fn);

test("E2: 4 adults + 1 baby needs the same cars on Explore, Places, the planner and the day card (B probe P8, owner default 2)", () => {
  assert.equal(carsFor(partyOf({ group_size: 4, babies: 1 })), 2);
  const c = NEW(() => carsAt({ adults: 4, babies: 1 }));
  assert.deepEqual(c, { explore: 2, places: 2, planner: 2, day: 2 });
  // Before the flag Explore and Places still count the baby out (today's answer, unchanged).
  assert.deepEqual(withFlags({ E2: "old" }, () => carsAt({ adults: 4, babies: 1 })), { explore: 1, places: 1, planner: 2, day: 2 });
});

test("E2: every screen agrees on cars for a matrix of parties (flag new)", () => {
  for (const p of [{ adults: 1 }, { adults: 2, children: 2 }, { adults: 4 }, { adults: 3, children: 1, babies: 1 }, { adults: 7 }, { adults: 2, babies: 4 }]) {
    const want = carsFor(partyOf({ group_size: p.adults + (p.children || 0), children: p.children || 0, babies: p.babies || 0 }));
    assert.deepEqual(NEW(() => carsAt(p)), { explore: want, places: want, planner: want, day: want }, JSON.stringify(p));
  }
});

test("E2: carsOf is the old car count of every site (unflagged refactor, same answer)", () => {
  const capacity = rule("car.model").car_capacity;
  for (let seats = 1; seats <= 20; seats += 1) {
    assert.equal(carsOf(seats, capacity), Math.max(1, Math.ceil(seats / Math.max(1, capacity))), `seats ${seats}`);
    assert.equal(carsOf(seats), carsOf(seats, undefined));
  }
  assert.equal(carsOf(0), 1);
});

test("E2: a couple style with 5 adults is a group, not a couple (G-10)", () => {
  assert.equal(kindFits("couple", { adults: 5, kids: 0, babies: 0 }), false);
  assert.equal(kindFits("couple", { adults: 2, kids: 0, babies: 0 }), true);
  assert.equal(kindOfCounts(5, 0, 0), "friends");
  assert.equal(kindOfCounts(6, 0, 0), "group");
});

test("E2: a family with teens stays a family, a baby is under 2 (owner default 2)", () => {
  const p = partyFromAges([40, 38, 15, 13]);
  assert.equal(p.kind, "family");
  assert.equal(p.teens, 2);
  assert.equal(p.seats, 4, "teens are priced as adults: four seats");
  assert.equal(p.adults, 4);
  assert.equal(partyFromAges([40, 38, 1]).babies, 1);
  assert.equal(partyFromAges([40, 38, 11]).children, 1);
  assert.equal(partyFromAges([40, 38, 12]).teens, 1, "12 is the first teen year");
  assert.equal(partyFromAges([40, 38, 17]).teens, 1);
  assert.equal(partyFromAges([40, 38, 18]).teens, 0, "18 is an adult");
  assert.equal(partyFromAges([40, 38, 2]).children, 1, "2 is the first child year");
  assert.equal(partyFromAges([40, 38, 1]).children, 0);
});

test("E2: partyOf carries every field a screen needs, caps from party.limits", () => {
  const lim = rule("party.limits");
  const p = partyOf({ group_size: 4, children: 2, babies: 1 });
  assert.deepEqual({ ...p, limits: undefined }, { adults: 2, teens: 0, children: 2, babies: 1, seats: 4, paying: 4, carSeats: 5, cars: 2, kind: "family", limits: undefined });
  assert.equal(p.limits, lim);
  assert.equal(partyOf({ group_size: 99 }).seats, lim.max_seats);
  assert.equal(partyOf({ group_size: 3, babies: 30 }).babies, lim.max_babies);
  assert.equal(partyOf({ group_size: 3, kind: "couple" }).kind, "friends", "a kind that no longer fits the counts is read from them");
  assert.equal(partyOf({ group_size: 3, kind: "friends" }).kind, "friends");
  assert.equal(partyOf({ group_size: 6, kind: "group" }).kind, "group");
});

test("E2: the footprint of a car shares the grams of every car over the seats (B-10, D22)", () => {
  // 800 km x 162 g/km. Old: one car's grams over at most 5 seats. New: cars x grams over the seats.
  const old = (o) => withFlags({ E2: "old" }, () => legKg("car", 800, o));
  const now = (o) => NEW(() => legKg("car", 800, o));
  assert.equal(old({ seats: 6 }).toFixed(1), "25.9");
  assert.equal(now({ seats: 6 }).toFixed(1), "43.2");
  assert.equal(now({ seats: 4, babies: 1 }).toFixed(1), "64.8");
  assert.equal(now({ seats: 4 }).toFixed(1), old({ seats: 4 }).toFixed(1), "a full car is unchanged");
  assert.equal(now({ seats: 2 }).toFixed(1), old({ seats: 2 }).toFixed(1));
});

test("E2: the day budget divides by adults and children, never babies (H-8, V-9)", () => {
  const priced = { perPerson: 0, parts: { beds: 700, days: 500 }, party: { babies: 2 } };
  const check = () => budgetCheck(priced, { kind: "day", eur: 90 }, { party: 4, nights: 7 });
  assert.deepEqual(withFlags({ E2: "old" }, check), { over: false, gap: 47 });
  assert.deepEqual(NEW(check), { over: false, gap: 4 });
  const noBabies = { ...priced, party: { babies: 0 } };
  assert.deepEqual(NEW(() => budgetCheck(noBabies, { kind: "day", eur: 90 }, { party: 4, nights: 7 })), { over: false, gap: 47 });
});

test("E2: seven babies are capped at the one limit in the style, the planner and the price (G-9)", () => {
  const cap = rule("party.limits").max_babies;
  const s = NEW(() => styleFromChoices({ who: { kind: "family", adults: 2, kids: 0, babies: 0 } }, { group_size: 2, babies: 7 }));
  assert.equal(s.who.babies, cap);
  assert.equal(partyOf({ group_size: 2, babies: 7 }).babies, cap);
  const old = withFlags({ E2: "old" }, () => styleFromChoices({ who: { kind: "family", adults: 2, kids: 0, babies: 0 } }, { group_size: 2, babies: 7 }));
  assert.equal(old.who.babies, 7, "flag old keeps today's cap of 10");
});

test("E2: a style with teens keeps its kind family when the choices carry no children", () => {
  const style = { who: { kind: "family", adults: 4, kids: 0, babies: 0, teens: 2 } };
  const next = NEW(() => styleFromChoices(style, { group_size: 4 }));
  assert.equal(next.who.kind, "family");
  assert.equal(next.who.teens, 2);
  assert.equal(withFlags({ E2: "old" }, () => styleFromChoices(style, { group_size: 4 })).who.kind, "friends", "old: teens read as adults, so friends");
});
