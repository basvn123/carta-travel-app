// T699-T701 (F5): the price in the right place, plan "Carta prijslogica
// Explore" section 5, invariants V11 and V12.
//   V11: nowhere "EUR 0" as a price; "Free" only in a category where paying
//        also occurs.
//   V12: a stay price stands only at or towards a destination; a do-price
//        only as a fact of the thing (and as a switch in a trip price).
// The DOM half of both runs in the batch's end check.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { doPriceEur, doPriceOf } from "../src/lib/price/doPrice.js";
import { doFacts } from "../src/lib/doFacts.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(ROOT + p, "utf8");
const LANGS = ["en", "nl", "de", "fr", "es", "it"];
const t = (k) => ({ "dest.doFree": "Free", "dest.doPaid": "Paid" }[k] ?? k);

test("V11: a do-price record reads as euros, free or nothing", () => {
  assert.equal(doPriceEur({ value: 12, currency: "EUR" }), 12);
  assert.equal(doPriceEur({ value: 12, currency: "CHF" }), null);
  assert.equal(doPriceEur({ value: -1, currency: "EUR" }), null);
  assert.equal(doPriceEur(null), null);
  assert.deepEqual(doPriceOf({ value: 0, currency: "EUR" }, "sight"), { kind: "free" });
  assert.deepEqual(doPriceOf({ value: 0, currency: "EUR" }, "beach"), { kind: "free" });
  // A free lift is not news: no figure and no "Free".
  assert.equal(doPriceOf({ value: 0, currency: "EUR" }, "lift"), null);
  assert.deepEqual(doPriceOf({ value: 8.5, currency: "EUR" }, "lift"), { kind: "eur", eur: 8.5 });
});

test("V11: a thing to do never says EUR 0", () => {
  const fee = (item) => doFacts(item, t).find((f) => f.k === "fee").value;
  assert.equal(fee({ fee_eur: 0 }), "Free");
  assert.equal(fee({ price: { value: 0, currency: "EUR" } }), "Free");
  assert.equal(fee({ fee: "no" }), "Free");
  assert.equal(fee({ fee: "yes" }), "Paid");
  assert.equal(fee({}), null);
  const paid = fee({ price: { value: 15, currency: "EUR", unit: "per person" } });
  assert.match(paid, /15/);
  assert.doesNotMatch(paid, /EUR\s*0|€\s*0\b/);
  // The record wins over the older figure.
  assert.match(fee({ price: { value: 9, currency: "EUR" }, fee_eur: 20 }), /9/);
});

test("V11: no locale spells a fee as a literal EUR template", () => {
  for (const l of LANGS) {
    const src = read(`src/i18n/${l}.js`);
    assert.doesNotMatch(src, /"dest\.doFeeEur"/, l);
    assert.doesNotMatch(src, /:\s*"(EUR|€)\s*0"/, l);
  }
});

test("V12: place pages carry the town price only in the button to the base", () => {
  for (const p of ["LakePage", "BeachPage", "MountainPage", "TrailPage"]) {
    const src = read(`src/browse/${p}.jsx`);
    assert.doesNotMatch(src, /costLine=/, `${p} passes no cost line`);
  }
  // T916 to T919 (the approved outdoor spec): the base town is a priced
  // "Stay nearby" line in the side card, one shared part priced through the
  // day view, never a figure of the page's own.
  for (const p of ["LakePage", "BeachPage"]) {
    assert.match(read(`src/browse/${p}.jsx`), /<StayLine\b/, `${p} prices its base in the stay line`);
  }
  assert.match(read("src/browse/MountainPage.jsx"), /view\.stayIn\(|<StayLine\b/, "MountainPage prices its base");
  const parts = read("src/browse/OutdoorParts.jsx");
  assert.match(parts, /useBaseDay\(/, "the stay line reads the base day price");
  assert.match(parts, /view\.day\(/, "the stay line prices through the day view");
});

test("V12: outdoor cards and rail tiles carry no town price", () => {
  assert.doesNotMatch(read("src/browse/DestCards.jsx"), /BedFoodLine|dayLine=/);
  assert.doesNotMatch(read("src/browse/SectionOpening.jsx"), /BedFoodLine/);
});

test("V12: the base button's words exist in every locale", () => {
  for (const l of LANGS) {
    const m = read(`src/i18n/${l}.js`).match(/"item\.baseStay":\s*"([^"]+)"/);
    assert.ok(m, `${l} has item.baseStay`);
    for (const slot of ["{city}", "{price}", "{unit}"]) assert.ok(m[1].includes(slot), `${l} ${slot}`);
  }
});
