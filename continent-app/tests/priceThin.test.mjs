// T1075 (ROADMAP D10): a bed priced from few scraped properties is flagged
// thin, and a part with no figure says "not yet measured" instead of a number.
// Owner rule: never a made-up number. Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setStayRecords } from "../src/lib/staysData.js";
import { bedPrice } from "../src/lib/stayPrice.js";
import { priceDay, DEFAULT_PRICE_REQUEST } from "../src/lib/price/index.js";
import { quoteNights } from "../src/lib/price/nights.js";
import { bedIsThin, unmeasuredParts } from "../src/lib/price/display.js";
import { isThin } from "../src/lib/price/priceDay.js";
import { rule } from "../src/lib/price/config.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/price/destinations.json", import.meta.url), "utf8"));
const ALL = FX.destinations;

function withN(n) {
  const rec = JSON.parse(JSON.stringify(FX.stays.LIS));
  for (const k of Object.keys(rec.src || {})) rec.src[k].n = n;
  setStayRecords({ ...FX.stays, LIS: rec });
}

test("the rule: 2 observations or fewer is thin, unknown is not", () => {
  assert.equal(rule("stay.thin_obs"), 2);
  assert.equal(isThin(1), true);
  assert.equal(isThin(2), true);
  assert.equal(isThin(3), false);
  assert.equal(isThin(null), false);
  assert.equal(isThin(undefined), false);
});

test("bedPrice carries the tier's observation count from the wire", () => {
  withN(2);
  const b = bedPrice({ dest: ALL.LIS, tier: "hotel3", adults: 2, nights: 1 });
  assert.equal(b.n, 2);
});

test("the bed line is thin at 2 observations, not at 3, and the figure is unchanged", () => {
  withN(3);
  const rich = priceDay(ALL.LIS, DEFAULT_PRICE_REQUEST, ALL);
  assert.equal(bedIsThin(rich), false);
  withN(2);
  const thin = priceDay(ALL.LIS, DEFAULT_PRICE_REQUEST, ALL);
  assert.equal(bedIsThin(thin), true);
  assert.equal(thin.lines.find((l) => l.key === "bed").basis.observations, 2);
  assert.equal(thin.stayEur, rich.stayEur, "flagging does not move the price");
});

test("the card's stay line inherits thin; a well measured bed carries no flag", () => {
  withN(1);
  const q = quoteNights(priceDay(ALL.LIS, DEFAULT_PRICE_REQUEST, ALL), 3, 2);
  assert.equal(q.lines.find((l) => l.key === "stay").thin, true);
  withN(9);
  const r = quoteNights(priceDay(ALL.LIS, DEFAULT_PRICE_REQUEST, ALL), 3, 2);
  assert.equal("thin" in r.lines.find((l) => l.key === "stay"), false);
});

test("without a local transport fare the part is listed as not yet measured, and not padded into the total", () => {
  withN(9);
  const row = priceDay(ALL.LIS, DEFAULT_PRICE_REQUEST, ALL);
  assert.deepEqual(unmeasuredParts(row), ["transport"]);
  const q = quoteNights(row, 3, 2);
  assert.equal(q.lines.some((l) => l.key === "transport"), false);
  assert.equal(q.total, q.lines.reduce((s, l) => s + l.eur, 0));
});

test("a fare removes the gap; a part the traveller switched off is not a gap", () => {
  withN(9);
  const withFare = { ...ALL.LIS, id: "FARE", local_transport: { ...(ALL.LIS.local_transport || {}),
    fare: { currency: "EUR", ride_eur: 2, source: "test", date: "2026-11-05", quality: "measured" } } };
  assert.deepEqual(unmeasuredParts(priceDay(withFare, DEFAULT_PRICE_REQUEST, ALL)), []);
  const off = priceDay(ALL.LIS, { ...DEFAULT_PRICE_REQUEST, excluded: ["transport"] }, ALL);
  assert.deepEqual(unmeasuredParts(off), []);
  assert.deepEqual(unmeasuredParts(null), []);
});

test("the two new strings exist in the six catalogues", async () => {
  for (const l of ["en", "nl", "de", "fr", "es", "it"]) {
    const text = readFileSync(new URL(`../src/i18n/${l}.js`, import.meta.url), "utf8");
    assert.match(text, /"price\.notMeasured": "[^"]+"/, l);
    assert.match(text, /"price\.bedThin": "[^"]+"/, l);
  }
});
