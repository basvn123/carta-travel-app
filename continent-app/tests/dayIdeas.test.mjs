// T671: a trip's day ideas as sections, keeping one, putting one on a day.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { buildIdeaSections, toggleSaved, savedKeys, placeIdea, dayOfIdea, poiRowsFor } from "../src/planner/days/dayIdeas.js";
import { costOverview } from "../src/planner/days/tripCost.js";
import { eventOnDate, doRow } from "../src/planner/dayExploreRails.js";

const sight = (k, must, score) => ({ key: k, kind: "sight", must, score, km: 1, name: k, rating: null });
const trail = (k, ascentM, lenKm, score = 7) => ({ key: k, kind: "trail", ascentM, lenKm, score, km: 5, name: k });

test("sections follow the goal; the party trims long climbs; empty sections stay last", () => {
  const pois = [sight("a", true, 9), sight("b", true, 8), sight("c", false, 6), { key: "f", kind: "food", score: 5, km: 1 }];
  const trails = [trail("t1", 900, 14), trail("t2", 200, 6)];
  const out = buildIdeaSections({ pois, trails, goal: "outdoors" });
  assert.deepEqual(out.filter((s) => !s.empty).map((s) => s.key), ["cantmiss", "walks", "sights", "food"]);
  assert.deepEqual(out.find((s) => s.key === "cantmiss").rows.map((r) => r.key), ["a", "b"]);
  assert.deepEqual(out.find((s) => s.key === "walks").rows.map((r) => r.key), ["t1", "t2"]);
  assert.ok(out.find((s) => s.key === "events").empty);
  assert.equal(out.at(-1).empty, true);
  const kids = buildIdeaSections({ pois, trails, goal: "outdoors", party: { kids: 2 } });
  assert.deepEqual(kids.find((s) => s.key === "walks").rows.map((r) => r.key), ["t2"]);
});

test("festivals in the stop's months; the dossier's do lines", () => {
  const town = { id: "LIS", lat: 38.7, lon: -9.1, km: 0 };
  const dossier = {
    festivals: [{ name: "NOS Alive", months: [7], what: "Music on the river" }, { name: "Santos", months: [6] }],
    do: [{ name: "Miradouro hopping", type: "experience", detail: "Viewpoints at sunset" }],
  };
  const out = buildIdeaSections({ dossier, town, dates: ["2027-07-10", "2027-07-11"] });
  const ev = out.find((s) => s.key === "events");
  assert.deepEqual(ev.rows.map((r) => r.name), ["NOS Alive"]);
  assert.equal(ev.rows[0].desc, "Music on the river");
  const adv = out.find((s) => s.key === "adventures");
  assert.equal(adv.rows[0].desc, "Viewpoints at sunset");
  assert.equal(eventOnDate({ months: [7] }, "2027-07-01"), true);
  assert.equal(eventOnDate({ months: [7] }, "2027-08-01"), false);
  assert.equal(doRow({ name: "x", detail: "y", type: "activity" }, town, 0).sub, "activity");
});

test("keeping an idea toggles a snapshot per stop", () => {
  const row = { key: "trail:9", kind: "trail", name: "Ridge", lat: 1, lon: 2, photo: "p" };
  let p = toggleSaved({}, "LIS", row);
  assert.ok(savedKeys(p, "LIS").has("trail:9"));
  assert.equal(p.savedIdeas.LIS[0].name, "Ridge");
  p = toggleSaved(p, "LIS", row);
  assert.equal(savedKeys(p, "LIS").size, 0);
});

test("a POI is placed by its index; anything else becomes the plan's own place once", () => {
  const poi = { key: "LIS:4", add: { destId: "LIS", idx: 4 } };
  let r = placeIdea({ assignments: {}, prefs: {}, si: 0, di: 1, destId: "LIS", baseLen: 40, row: poi });
  assert.deepEqual(r.assignments, { 0: { 1: [4] } });
  const tr = { key: "trail:9", kind: "trail", name: "Ridge", lat: 1, lon: 2, photo: "p" };
  r = placeIdea({ assignments: r.assignments, prefs: r.prefs, si: 0, di: 1, destId: "LIS", baseLen: 40, row: tr });
  assert.equal(r.idx, 40);
  assert.equal(r.prefs.customPois.LIS[0].ideaKey, "trail:9");
  assert.equal(r.prefs.customPois.LIS[0].kind, "trail");
  assert.deepEqual(r.assignments[0][1], [4, 40]);
  // Again on the same day: nothing changes. On another day: it moves, not a copy.
  const again = placeIdea({ assignments: r.assignments, prefs: r.prefs, si: 0, di: 1, destId: "LIS", baseLen: 40, row: tr });
  assert.equal(again.already, true);
  const moved = placeIdea({ assignments: r.assignments, prefs: r.prefs, si: 0, di: 2, destId: "LIS", baseLen: 40, row: tr });
  assert.equal(moved.moved, true);
  assert.deepEqual(moved.assignments[0], { 1: [4], 2: [40] });
  assert.equal(moved.prefs.customPois.LIS.length, 1);
  assert.equal(dayOfIdea({ assignments: moved.assignments, prefs: moved.prefs, si: 0, destId: "LIS", baseLen: 40, row: tr }), 2);
  assert.equal(dayOfIdea({ assignments: {}, prefs: {}, si: 0, destId: "LIS", baseLen: 40, row: tr }), -1);
});

test("catalogue POIs become rows, customs and unwalkable ones left out", () => {
  const items = [{ name: "Tower", lat: 38.69, lon: -9.21, rate: 3 }, { name: "Far", lat: 39, lon: -8 }, { name: "Mine", lat: 1, lon: 1, custom: true }];
  const rows = poiRowsFor(items, new Set([0, 2]), "LIS", { lat: 38.7, lon: -9.14 }, { LIS: { city: "Lisbon" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].add.idx, 0);
  assert.equal(rows[0].townName, "Lisbon");
});

test("the trip's money in parts, read from priceTrip", () => {
  const priced = {
    grandTotal: 1000, perPerson: 500,
    parts: { travel: 0, flights: 300, transfers: 20, drive: 0, between: 30, car: 0, beds: 450, days: 200 },
    travelSplit: { legacy: false, out: 0, back: 0 },
    cartaFlight: { out: { cost: { total: 150 } }, back: { cost: { total: 150 } } },
    legs: [{ ground_total: 30 }], stayCosts: [{ ownAccom: false }], flight: null, driveLegs: null,
  };
  const o = costOverview(priced, { party: 2, nights: 5 });
  assert.equal(o.total, 1000);
  assert.equal(o.perPersonDay, 100);
  const by = Object.fromEntries(o.parts.map((p) => [p.key, p.eur]));
  assert.deepEqual(by, { getting: 320, stays: 450, food: 200, around: 30 });
  assert.equal(costOverview(null), null);
});
