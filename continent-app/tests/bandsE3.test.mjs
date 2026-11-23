// A-7 (ROADMAP D10, logic audit E3): the price bands read the engine's day price: the adult food
// basis, so a child's share of meals does not move a place's band with the party, and only the
// items that are on. Behind flag E3 (default old). Committed fixture: tests/fixtures/price/destinations.json.
// A-5 (re-cutting bands.ref_stay from the engine's medians) needs the shipped wire and stays a ROADMAP D10 follow-up.
// Run: node --test tests/bandsE3.test.mjs (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withFlags } from "../src/lib/flags.js";
import { dayBandOf } from "../src/lib/costIndex.js";
import { priceDay } from "../src/lib/price/priceDay.js";
import { DEFAULT_PRICE_REQUEST } from "../src/lib/price/request.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/price/destinations.json", import.meta.url), "utf8"));
const LIS = FX.destinations.LIS;
const day = (flag, over = {}) => withFlags({ E3: flag }, () => priceDay(LIS, { ...DEFAULT_PRICE_REQUEST, stay: "hotel3", ...over }, FX.destinations));

test("A-7: the day band reads the adult food basis, so children do not move it (E3 new)", () => {
  const adults = day("new", { group: { adults: 2, children: 0, babies: 0 } });
  const family = day("new", { group: { adults: 2, children: 3, babies: 0 } });
  assert.equal(family.foodAdultEur, adults.foodAdultEur, "the adult basis does not move with the party");
  assert.ok(family.foodEur < adults.foodEur, "the party's own food line does");
  assert.equal(family.foodBand, adults.foodBand, "same adult basis, same band");
  assert.equal(typeof family.dayBand, "number");
});

test("A-7: an item switched off leaves the band (E3 new), and stays in it with the flag old", () => {
  const all = day("new");
  const noFood = day("new", { excluded: ["food"] });
  assert.equal(noFood.dayBand, dayBandOf(noFood.stayEur, null, DEFAULT_PRICE_REQUEST.lifestyle, "hotel3"));
  assert.ok(noFood.dayBand <= all.dayBand, "without food the day is no dearer");
  const none = day("new", { excluded: ["food", "bed"] });
  assert.equal(none.dayBand, null);
  assert.equal(day("old", { excluded: ["food"] }).dayBand, day("old").dayBand, "flag old: the band ignores the switch");
});
