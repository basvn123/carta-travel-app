// T1204 (D22): the trip footprint, against values worked out by hand from
// config/pricing.json rule footprint.factors.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { legKg, tripKg, returnKg, oneWayKg, kgText, footprintMode } from "../src/lib/footprint/footprint.js";
import { rule } from "../src/lib/price/config.js";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test("a short flight: km x 1.08 uplift x 126 g", () => {
  near(legKg("fly", 1000), 1000 * 1.08 * 126 / 1000); // 136.08 kg
});
test("a long flight past the band uses the long-haul factor", () => {
  near(legKg("plane", 5000), 5000 * 1.08 * 117 / 1000); // 631.8 kg
});
test("train and coach per passenger-km", () => {
  near(legKg("train", 400), 14); // 400 x 35 g
  near(legKg("bus", 400), 15.6); // 400 x 39 g
});
test("a car is shared by the party, capped at five seats", () => {
  near(legKg("car", 500, { seats: 2 }), 500 * 170 / 2 / 1000); // 42.5
  near(legKg("car", 500, { seats: 9 }), 500 * 170 / 5 / 1000); // 17
});
test("no factor or no distance is null, never a guess", () => {
  assert.equal(legKg("walk", 10), null);
  assert.equal(legKg("train", null), null);
  assert.equal(legKg("train", 0), null);
  assert.equal(footprintMode("ferry"), "ferry");
});
test("a trip adds its legs and counts what it skipped", () => {
  const r = tripKg([{ mode: "fly", km: 1000 }, { mode: "train", km: 400 }, { mode: "walk", km: 5 }, { mode: "fly", km: null }]);
  near(r.kg, 136.08 + 14);
  assert.equal(r.counted, 2);
  assert.equal(r.skipped, 2);
  near(r.byMode.train, 14);
});
test("a return journey: flights use the line, ground ways the detour", () => {
  near(returnKg("plane", 1000), 2 * 136.08);
  near(returnKg("train", 400), 2 * 400 * 1.3 * 35 / 1000); // 36.4
  near(oneWayKg("train", 400, { routeKm: 450 }), 450 * 35 / 1000);
  assert.equal(returnKg("plane", null), null);
});
test("kgText rounds to whole kilograms", () => {
  assert.equal(kgText(136.08), "136");
  assert.equal(kgText(0.4), "<1");
  assert.equal(kgText(null), "");
});
test("the factors name a source, a year and a method link", () => {
  assert.match(rule("footprint.factors").method_url, /^https:\/\//);
});
