// T714 (F8, owner B11): local transport in the day price once a place has a
// fare, never a zero without one. Plan "Carta prijslogica Explore" F8, V3,
// V9 and rule 8.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { setStayRecords } from "../src/lib/staysData.js";
import { priceDay, priceRequest, DEFAULT_PRICE_REQUEST, quoteStay, tripRequest } from "../src/lib/price/index.js";
import { quoteNights } from "../src/lib/price/nights.js";
import { includedParts } from "../src/lib/price/display.js";
import { rule } from "../src/lib/price/config.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/price/destinations.json", import.meta.url), "utf8"));
setStayRecords(FX.stays);
const ALL = FX.destinations;
const c100 = (v) => Math.round(v * 100);
const withFare = (fare, cls = "city") => ({ ...ALL.LIS, id: "FARE", place: { ...(ALL.LIS.place || {}), class: cls },
  local_transport: { ...(ALL.LIS.local_transport || {}), fare: { currency: "EUR", source: "test", date: "2026-10-24", quality: "measured", ...fare } } });
const line = (row) => row.lines.find((l) => l.key === "transport");
const RIDES = rule("transport.rides_per_day");

test("without a fare the line is missing and the day is bed and food (rule 8)", () => {
  const row = priceDay(ALL.LIS, DEFAULT_PRICE_REQUEST, ALL);
  assert.equal(line(row).eur, null);
  assert.equal(line(row).status, "not_included");
  assert.equal(c100(row.dayEur), c100(row.stayEur) + c100(row.foodEur));
  assert.deepEqual(includedParts(row), ["bed", "food"]);
});

test("with a fare the day holds it: rides by kind of place, capped by a day pass", () => {
  const ride = priceDay(withFare({ ride_eur: 2 }, "city"), DEFAULT_PRICE_REQUEST, ALL);
  assert.equal(line(ride).status, "included");
  assert.equal(line(ride).eur, 2 * RIDES.city);
  assert.equal(c100(ride.dayEur), c100(ride.stayEur) + c100(ride.foodEur) + c100(line(ride).eur));
  assert.ok(includedParts(ride).length === 3, "the short line names the third part");
  const capped = priceDay(withFare({ ride_eur: 3, day_pass_eur: 5 }, "metro"), DEFAULT_PRICE_REQUEST, ALL);
  assert.equal(line(capped).eur, 5);
  assert.equal(line(capped).basis.capped, true);
  const passOnly = priceDay(withFare({ day_pass_eur: 7 }), DEFAULT_PRICE_REQUEST, ALL);
  assert.equal(line(passOnly).eur, 7);
  const other = priceDay(withFare({ ride_eur: 2, currency: "CHF" }), DEFAULT_PRICE_REQUEST, ALL);
  assert.equal(line(other).eur, null, "only euro fares count");
});

test("children ride at their ticket share", () => {
  const req = priceRequest({ choices: { group_size: 4, children: 2 } });
  const row = priceDay(withFare({ ride_eur: 2 }, "city"), req, ALL);
  const share = (2 + rule("party.shares").child_ticket * 2) / 4;
  assert.equal(line(row).eur, Math.round(2 * RIDES.city * share * 100) / 100);
});

test("V9: switching transport off gives the reference day back", () => {
  const dest = withFare({ ride_eur: 2 });
  const off = priceDay(dest, { ...DEFAULT_PRICE_REQUEST, excluded: ["transport"] }, ALL);
  const none = priceDay(ALL.LIS, DEFAULT_PRICE_REQUEST, ALL);
  assert.equal(off.dayEur, none.dayEur);
});

test("V1, V3: the calculator and a trip stop carry the same transport", () => {
  const dest = withFare({ ride_eur: 2 });
  const row = priceDay(dest, DEFAULT_PRICE_REQUEST, ALL);
  const calc = quoteNights(row, 7, 2);
  assert.equal(c100(calc.total), [row.stayEur, row.foodEur, line(row).eur].reduce((a, v) => a + c100(v * 14), 0));
  const stop = quoteStay(dest, 7, null, tripRequest({ groupSize: 2 }), ALL);
  assert.equal(c100(stop.groundTotal), c100((row.foodEur + line(row).eur) * 14));
});

test("coverage: the share of places with a fare (report)", { skip: !existsSync(new URL("../public/app_data.json", import.meta.url)) }, () => {
  const d = JSON.parse(readFileSync(new URL("../public/app_data.json", import.meta.url), "utf8")).destinations;
  const n = Object.values(d).filter((x) => x.local_transport?.fare).length;
  if (process.env.PRICE_REPORT) console.log(`local transport fares: ${n} of ${Object.keys(d).length}`);
  assert.ok(n >= 0);
});

// T715 (F9, B10): activities are switches in the calculator, off by default.
test("V9: an activity switched on adds exactly its price times the party; off is the reference", () => {
  const row = priceDay(ALL.LIS, DEFAULT_PRICE_REQUEST, ALL);
  const ref = quoteNights(row, 7, 3);
  const on = quoteNights(row, 7, 3, null, null, [{ eur: 12.5 }, { eur: 20 }]);
  assert.equal(c100(on.total), c100(ref.total) + c100((12.5 + 20) * 3));
  assert.equal(on.lines.find((l) => l.key === "activities").eur, 97.5);
  assert.equal(quoteNights(row, 7, 3, null, null, []).total, ref.total);
  assert.equal(on.dayEur, ref.dayEur, "an activity is never in the day figure (B10)");
});

// T716 (F10, row T471-f): the toll corridor counts only from its own start.
test("a drive uses the toll corridor only when it starts where the corridor was measured", async () => {
  const { drivingEstimate } = await import("../src/lib/runtime_pricing.js");
  const brussels = { lat: 50.8466, lon: 4.3528 };
  const amsterdam = { lat: 52.37, lon: 4.9 };
  const dest = { ...ALL.LIS, lat: 48.85, lon: 2.35, iso2: "FR", local_transport: {},
    driving_toll: { total_rt_eur: 77, vignettes: [], crossings: ["A1"], source: "toll_v1" } };
  const model = { ...rule("car.model") };
  const fromStart = drivingEstimate(dest, brussels, { group_size: 2 }, model, brussels);
  assert.equal(fromStart.toll_total, 77);
  assert.deepEqual(fromStart.toll_notes, ["A1"]);
  const fromElsewhere = drivingEstimate(dest, amsterdam, { group_size: 2 }, model, brussels);
  assert.equal(fromElsewhere.toll_notes, null);
  assert.equal(fromElsewhere.toll_total, Math.round(((fromElsewhere.road_km * 2) / 100) * model.toll_eur_per_100km * 100) / 100);
  assert.equal(drivingEstimate(dest, brussels, { group_size: 2 }, model).toll_notes, null, "no start known: the flat allowance");
});
