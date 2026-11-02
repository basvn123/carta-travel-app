// T1018: the price feel on the place page's Eat and drink (costIndex.js
// priceFeel): the food band on a five-step scale and each thing against the
// frozen catalogue median (bands.ref_prices).
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { priceFeel, bandFor } from "../src/lib/costIndex.js";
import { DEFAULT_LIFESTYLE } from "../src/lib/runtime_pricing.js";
import { rule } from "../src/lib/price/config.js";

// Rome's prices as the place page showed them on 2026-11-02.
const ROME = {
  meal_mid_eur: 40.2, meal_cheap_eur: 19.5, fastfood_eur: 10.5, drink_out_eur: 5.74,
  coffee_eur: 2.02, cocktail_eur: 13.8, grocery_day_eur: 13.3,
};
const REF = rule("bands.ref_prices");
const { rows: ROWS } = rule("bands.feel");

test("T1018: Rome splits into cheaper, dearer and about usual", () => {
  const f = priceFeel(ROME, 58, DEFAULT_LIFESTYLE);
  assert.deepEqual(f.cheaper.map((i) => i.key), ["coffee_eur"]);
  assert.equal(f.brief, false);
  assert.ok(f.cheaper[0].reach > 0.8 && f.cheaper[0].reach <= 1);
  assert.deepEqual(f.dearer.map((i) => i.key), ["meal_cheap_eur", "meal_mid_eur", "cocktail_eur"]);
  assert.deepEqual(f.usual.map((i) => i.key), ["fastfood_eur", "grocery_day_eur"]);
  assert.ok(f.cheaper.length + f.dearer.length <= ROWS);
  assert.equal(Math.round(f.cheaper[0].ratio * 100), -41);
});

test("T1018: the verdict is the Explore card's food band, with a lean in the outer thirds", () => {
  const f = priceFeel(ROME, 60, DEFAULT_LIFESTYLE);
  assert.equal(f.band, bandFor("food", 60, 1));
  assert.equal(f.band, 2);
  assert.equal(f.lean, "dear");
  assert.ok(f.pos > 0.4 && f.pos < 0.6, `pin inside the middle step, got ${f.pos}`);
  assert.equal(priceFeel(ROME, 56, DEFAULT_LIFESTYLE).lean, null);
  assert.equal(priceFeel(ROME, 51, DEFAULT_LIFESTYLE).lean, "cheap");
});

test("T1018: the pin stays inside the scale at both open ends", () => {
  for (const eur of [1, 20, 500]) {
    const f = priceFeel(ROME, eur, DEFAULT_LIFESTYLE);
    assert.ok(f.pos > 0 && f.pos < 1, `${eur}: ${f.pos}`);
    assert.equal(f.lean, null);
  }
});

test("T1018: a town at the norm has nothing cheaper or dearer", () => {
  const f = priceFeel({ ...REF }, 50, DEFAULT_LIFESTYLE);
  assert.equal(f.cheaper.length + f.dearer.length, 0);
  assert.equal(f.usual.length, 7);
});

test("T1018: no prices, no feel; no food day, no verdict", () => {
  assert.equal(priceFeel({}, 50, DEFAULT_LIFESTYLE), null);
  assert.equal(priceFeel(null, 50, DEFAULT_LIFESTYLE), null);
  const f = priceFeel({ coffee_eur: 2 }, null, DEFAULT_LIFESTYLE);
  assert.equal(f.band, null);
  assert.equal(f.pos, null);
  assert.equal(f.brief, true);
});
