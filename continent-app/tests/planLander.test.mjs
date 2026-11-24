// G12 plan rethink, lane L6 (decision §3.2 S5, S6, S9): a known place lands
// on a priced found trip. Saved's hearts become named places (not a flat
// 2-night route), a seed's month and budget reach a trip that lands straight
// on the trip page, and the planner opens a named place on the lander.
// Run: npm test (continent-app/). Pure.
import test from "node:test";
import assert from "node:assert/strict";
import { routeSeedOf } from "../src/lib/plan/seedWriters.js";
import { routeSeed, seedTripPatch } from "../src/lib/plan/seed.js";
import { defaultSettings, normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { KNOW_SCREEN, TRIPS_SCREEN, landingOf } from "../src/planner/flow/flowGraph.js";

const DESTS = {
  LIS: { city: "Lisbon", iso2: "PT", country: "Portugal" },
  OPO: { city: "Porto", iso2: "PT", country: "Portugal" },
};

test("Saved's hearts land on a priced found trip, the towns as named places", () => {
  const seed = routeSeedOf({ stops: [{ dest: "LIS", nights: 2 }, { dest: "OPO", nights: 2 }] }, { source: "saved", destinations: DESTS });
  assert.equal(routeSeed(seed), "found");
  assert.deepEqual(seed.places.map((p) => [p.kind, p.id, p.iso2, p.name]), [["place", "LIS", "PT", "Lisbon"], ["place", "OPO", "PT", "Porto"]]);
  assert.equal(seed.stops.length, 0, "no flat 2-night route");
  assert.equal(routeSeedOf({ stops: [] }, { source: "saved" }), null);
  // A library trip keeps its route.
  assert.equal(routeSeed(routeSeedOf({ stops: [{ dest: "LIS", nights: 3 }] }, { source: "trip" })), "trip");
});

test("seedTripPatch: a seed's month and budget reach the trip's settings; nothing else moves", () => {
  const cur = normalizeSettings(defaultSettings());
  assert.equal(seedTripPatch({ source: "trip", stops: [{ dest: "LIS", nights: 3 }] }, cur), cur, "no when, no budget: same object");
  const next = seedTripPatch({
    source: "ask", when: { mode: "months", months: [5] }, budget: { kind: "total", per: "person", eur: 900, mode: "cap" }, pins: ["when", "budget"],
  }, cur);
  assert.deepEqual(next.when.months, [5]);
  assert.equal(next.when.mode, "months");
  assert.equal(next.guide.budget.eur, 900);
  assert.equal(next.guide.budget.mode, "cap");
  assert.ok(next.answered.includes("when"));
  assert.ok(next.answered.includes("g:budget"));
  assert.deepEqual(next.party, cur.party, "the party is the hand-over's");
});

test("landingOf: a named place opens the lander, none the list", () => {
  const s = normalizeSettings(defaultSettings());
  assert.equal(landingOf(s), TRIPS_SCREEN);
  assert.equal(landingOf({ ...s, places: [{ kind: "place", id: "LIS", name: "Lisbon" }] }), KNOW_SCREEN);
  assert.equal(landingOf({ ...s, places: [{ kind: "country", id: "PT", name: "Portugal" }] }), KNOW_SCREEN);
  assert.equal(landingOf(null), TRIPS_SCREEN);
});
