// T670: countries side by side. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { compareCountries, crowdBand } from "../src/lib/countryCompare.js";

const clim = (high, rain) => ({ m: Array.from({ length: 12 }, () => [high, high - 8, rain, 70]) });
const destinations = {
  LIS: { country: "Portugal", iso2: "PT", climate: clim(24, 10), crowding: { tier: 3 }, iata: "LIS" },
  OPO: { country: "Portugal", iso2: "PT", climate: clim(22, 30), crowding: { tier: 2 }, iata: "OPO" },
  FAO: { country: "Portugal", iso2: "PT", climate: clim(26, 2), crowding: { tier: 3 }, iata: "FAO" },
  ATH: { country: "Greece", iso2: "GR", climate: clim(30, 5), crowding: { tier: 1 }, iata: "ATH" },
  SKG: { country: "Greece", iso2: "GR", climate: clim(28, 15), crowding: { tier: 1 }, iata: "SKG" },
  SOLO: { country: "Malta", iso2: "MT", climate: clim(27, 1), crowding: { tier: 3 } },
};
const dayCosts = new Map([
  ["LIS", { dayEur: 90, stayEur: 60, foodEur: 30 }],
  ["OPO", { dayEur: 70, stayEur: 45, foodEur: 25 }],
  ["FAO", { dayEur: 80, stayEur: 50, foodEur: 30 }],
  ["ATH", { dayEur: 60, stayEur: 40, foodEur: 20 }],
  ["SKG", { dayEur: 50, stayEur: 30, foodEur: 20 }],
  ["SOLO", { dayEur: 99, stayEur: 70, foodEur: 29 }],
]);
const now = Date.parse("2027-04-01T12:00:00Z");
const checked = Math.round(now / 60000) - 60;
const flightFile = {
  to: { LIS: { "2027-05-03": [79, "TP", "08:00", "10:00", 0, checked] }, ATH: { "2027-05-04": [120, "A3", "09:00", "13:00", 0, checked] } },
  back: { LIS: { "2027-05-10": [69, "TP", "11:00", "15:00", 0, checked] }, ATH: { "2027-05-11": [110, "A3", "14:00", "16:00", 0, checked] } },
};

test("each figure from its source, the cheapest day marked once", () => {
  const rows = compareCountries({
    names: ["Portugal", "Greece", "Malta"], destinations, dayCosts, flightFile, month: 5, yearMonth: "2027-05",
    insights: { Greece: { best_months: [5, 6, 9] } }, now,
  });
  const [pt, gr, mt] = rows;
  assert.equal(pt.day, 80);
  assert.equal(pt.dayMin, 70);
  assert.equal(pt.night, 50);
  assert.equal(pt.weather.high, 24);
  assert.equal(pt.crowds, "busy");
  assert.equal(pt.flight.perSeat, 148);
  assert.equal(gr.day, 55);
  assert.equal(gr.crowds, null); // two places is too few to call
  assert.equal(gr.flight.perSeat, 230);
  assert.deepEqual(gr.best, [5, 6, 9]);
  assert.equal(gr.bestValue, true);
  assert.equal(pt.bestValue, false);
  // One town is too little to call a country's day.
  assert.equal(mt.day, null);
  assert.equal(mt.flight, null);
});

test("no month: no weather; no file: no flight; at most three", () => {
  const rows = compareCountries({ names: ["Portugal", "Greece", "Malta", "Spain"], destinations, dayCosts, now });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].weather, null);
  assert.equal(rows[0].flight, null);
});

test("crowd bands", () => {
  assert.equal(crowdBand(0.1), "quiet");
  assert.equal(crowdBand(0.3), "mixed");
  assert.equal(crowdBand(0.8), "busy");
  assert.equal(crowdBand(null), null);
});
