// T654: the planner's first free field fills the questions it answers.
// T857: prefill.js is a thin wrapper over lib/plan/parseTrip.js; likes said
// in the words now answer the likes question too.
// Run: npm test (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { prefillFromText } from "../src/planner/flow/prefill.js";

test("an English sentence", () => {
  const r = prefillFromText("A cheap week in Portugal with my girlfriend in May, beaches and food", { countries: ["Portugal", "Spain"] });
  assert.equal(r.patch.party.kind, "couple");
  assert.equal(r.patch.priority, "price");
  assert.deepEqual(r.patch.when.months, [5]);
  assert.equal(r.patch.when.nights, 7);
  assert.deepEqual(r.patch.guide.likes, ["beach", "food"]);
  assert.deepEqual(r.countries, ["Portugal"]);
  assert.deepEqual(r.answered.sort(), ["g:likes", "priority", "when", "who"]);
});

test("a Dutch sentence with a family and booked flights", () => {
  const r = prefillFromText("Met het gezin en 2 kinderen, vlucht geboekt naar Italië, 10 dagen wandelen", { countries: ["Italië"] });
  assert.equal(r.patch.party.kind, "family");
  assert.equal(r.patch.party.adults, 2);
  assert.ok(r.patch.party.kids >= 1);
  assert.equal(r.patch.booked.flights, true);
  assert.equal(r.patch.when.nights, 9);
  assert.equal(r.answered.includes("when"), false);
  assert.deepEqual(r.patch.guide.likes, ["hiking"]);
});

test("words inside other words do not fire", () => {
  const r = prefillFromText("best season for a city", {});
  assert.deepEqual(r.patch.guide.likes, ["city"]);
  assert.equal(r.patch.when, undefined);
});

test("a head count and train only", () => {
  const r = prefillFromText("we are 5, road trip by train, luxury please", {});
  assert.equal(r.patch.party.kind, "friends");
  assert.equal(r.patch.party.adults, 5);
  assert.equal(r.patch.priority, "comfort");
  assert.equal(r.patch.guide.shape, "road");
  assert.equal(r.patch.guide.reach, "overland");
});

test("empty text answers nothing", () => {
  assert.deepEqual(prefillFromText("   ", {}), { patch: {}, answered: [], countries: [] });
});
