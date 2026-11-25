// G12 plan rethink, lane L15 (B7a): the Friends seam. A Vrienden group trip
// opens Plan through the one door with source 'friends': its group, joined
// members and band (the server's lowest whole-trip maximum a person) as the
// trip's budget in mode 'band'; the list then says how many trips fit
// everyone, counting only trips it can judge. Run: npm test (continent-app/). Pure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { friendsSeed } from "../src/lib/plan/seedWriters.js";
import { routeSeed, seedToSettings } from "../src/lib/plan/seed.js";
import { activeBudget, bandFit } from "../src/lib/recommend/budgetCompass.js";

const group = (band) => ({
  id: "g1", title: "Lisbon with the club",
  members: [{ userId: "u1", status: "joined" }, { userId: "u2", status: "invited" }, { userId: "u3", status: "joined" }],
  band,
});

test("friendsSeed: source friends, the group, joined members, the band as a 'band' budget", () => {
  const s = friendsSeed(group({ top: 900, ready: true, set: 3, members: 3 }), { destId: "LIS", iso2: "pt", name: "Lisbon" });
  assert.equal(s.source, "friends");
  assert.equal(s.groupId, "g1");
  assert.deepEqual(s.ref, { kind: "group", id: "g1" });
  assert.deepEqual(s.coplanners, ["u1", "u3"], "only joined members");
  assert.deepEqual(s.places.map((p) => [p.kind, p.id, p.iso2]), [["place", "LIS", "PT"]]);
  assert.deepEqual(s.budget, { eur: 900, kind: "total", per: "person", mode: "band" });
  assert.ok(s.pins.includes("budget") && s.pins.includes("places"));
  assert.ok(routeSeed(s));
  assert.equal(seedToSettings(s).guide.budget.mode, "band", "the band reaches the trip's settings");
  const none = friendsSeed(group({ top: null, ready: false, set: 1, members: 3 }));
  assert.equal(none.budget, null, "no band below three budgets: no budget invented");
  assert.equal(friendsSeed(null), null);
});

test("bandFit: trips that fit everyone, of those that can be judged", () => {
  const trip = (pp, flight = 100) => ({ nights: 4, party: { head: 2 }, slots: [{ id: "flight", eur: flight }, { id: "stay", eur: 300 }], total: { perPerson: pp, group: pp * 2 } });
  const b = { eur: 900, kind: "total", per: "person", mode: "band" };
  const out = bandFit([trip(800), trip(950), trip(700, null)], b);
  assert.equal(out.eur, 900);
  assert.equal(out.judged, 2, "a Not yet total is never judged");
  assert.equal(out.fits, 1);
  assert.equal(bandFit([trip(800)], { ...b, mode: "cap" }), null, "only a group's band");
});

test("the seam: App listens for carta:plan-group and Vrienden has one call for it", () => {
  const openers = readFileSync(new URL("../src/shell/useAppOpeners.js", import.meta.url), "utf8");
  assert.match(openers, /addEventListener\('carta:plan-group'/);
  assert.match(openers, /friendsSeed\(group, place \|\| \{\}\)/);
  const signals = readFileSync(new URL("../src/together/signals.jsx", import.meta.url), "utf8");
  assert.match(signals, /export function planGroupTrip\(group, place = \{\}\)/);
});

test("B7b: the group's dates fix the window; the band is a guide, never a ceiling", () => {
  const g = group({ top: 900, ready: true, set: 3, members: 3 });
  const s = friendsSeed(g, { destId: "LIS", iso2: "PT", name: "Lisbon", start: "2027-05-01", end: "2027-05-06" });
  assert.equal(s.when.mode, "exact");
  assert.equal(s.when.start, "2027-05-01");
  assert.equal(s.when.end, "2027-05-06");
  assert.ok(s.pins.includes("when"));
  assert.equal(friendsSeed(g, { destId: "LIS", start: "2027-05-06", end: "2027-05-01" }).when, null, "a window backwards is no window");
  assert.equal(activeBudget(s.budget).mode, "soft", "orchestrator decision: the band guides, it does not cap");
});

test("B7b: Vrienden's group result has one Plan this trip button through planGroupTrip", () => {
  const src = readFileSync(new URL("../src/together/GroupTrips.jsx", import.meta.url), "utf8");
  assert.equal((src.match(/planGroupTrip\(/g) || []).length, 1);
  assert.match(src, /t\('tg\.planIt'\)/);
});
