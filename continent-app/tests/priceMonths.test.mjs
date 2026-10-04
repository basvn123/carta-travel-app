// The price-by-month row of T103. Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { nearestCurve, priceStates, goodAndCheap, priceRow } from "../src/lib/priceMonths.js";

const curve = [0.7, 0.8, 1, 1, 1.1, 1.2, 1.3, 1.3, 1.1, 1, 0.8, 0.7];
const dests = {
  A: { city: "Near", city_lat: 50, city_lon: 4, accommodation: { seasonality: curve } },
  B: { city: "Far", city_lat: 51, city_lon: 4, accommodation: { seasonality: curve } },
  C: { city: "NoCurve", city_lat: 50.01, city_lon: 4, accommodation: {} },
};

test("picks the nearest destination with a curve inside the radius", () => {
  assert.equal(nearestCurve(dests, 50.05, 4).id, "A");
  assert.equal(nearestCurve(dests, 50.5, 4), null);
  assert.equal(nearestCurve(null, 50, 4), null);
});

test("classifies months against the curve's own mean", () => {
  const s = priceStates(curve);
  assert.equal(s[0], "cheap");
  assert.equal(s[6], "dear");
  assert.equal(s[3], "mid");
  assert.equal(priceStates([1, 2]), null);
});

test("good and cheap is the overlap of the two rows", () => {
  const s = priceStates(curve);
  assert.deepEqual(goodAndCheap([1, 2, 7], s), [1, 2]);
  assert.deepEqual(goodAndCheap([7], null), []);
});

test("priceRow is null with no curve in range", () => {
  assert.equal(priceRow(dests, 10, 10, [1]), null);
  assert.equal(priceRow(dests, 50, 4, [1]).place, "Near");
});
