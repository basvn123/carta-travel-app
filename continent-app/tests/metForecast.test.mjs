// T483: MET Norway's time series as Carta's daily forecast rows.
// Run: npm test (continent-app/). A hand-made payload: no network.
import test from "node:test";
import assert from "node:assert/strict";
import { metDaily, metKind, cell } from "../src/lib/metForecast.js";

const block = (sym, max, min, mm) => ({
  next_6_hours: {
    summary: { symbol_code: sym },
    details: { air_temperature_max: max, air_temperature_min: min, precipitation_amount: mm },
  },
});
const step = (time, data) => ({ time, data });

const payload = {
  properties: {
    meta: { updated_at: "2026-10-21T08:22:52Z" },
    timeseries: [
      step("2026-10-20T18:00:00Z", block("rain", 30, 0, 9)), // yesterday: dropped
      step("2026-10-21T08:00:00Z", block("rain", 99, -9, 50)), // off the 6-hour grid: dropped
      step("2026-10-21T12:00:00Z", block("fair_day", 18.4, 14.1, 0)),
      step("2026-10-21T13:00:00Z", { next_1_hours: { summary: { symbol_code: "rain" } } }),
      step("2026-10-21T18:00:00Z", block("lightrainshowers_night", 15.2, 12.0, 1.26)),
      step("2026-10-22T00:00:00Z", block("cloudy", 13, 11, 0)),
      step("2026-10-22T06:00:00Z", block("heavyrainandthunder", 17, 12, 4)),
    ],
  },
};

test("four UTC blocks make one day; the worst sky wins; rain is millimetres", () => {
  const out = metDaily(payload, 7, "2026-10-21");
  assert.equal(out.updated, "2026-10-21T08:22:52Z");
  assert.deepEqual(out.days, [
    { date: "2026-10-21", kind: "drizzle", hi: 18.4, lo: 12, rainMm: 1.3 },
    { date: "2026-10-22", kind: "storm", hi: 17, lo: 11, rainMm: 4 },
  ]);
});

test("at most `days` rows, and null for a payload with no time series", () => {
  assert.equal(metDaily(payload, 1, "2026-10-21").days.length, 1);
  assert.equal(metDaily({}), null);
  assert.equal(metDaily(null), null);
});

test("MET symbols map onto the kinds the UI draws", () => {
  assert.equal(metKind("clearsky_day"), "sun");
  assert.equal(metKind("fair_polartwilight"), "partsun");
  assert.equal(metKind("partlycloudy_night"), "partsun");
  assert.equal(metKind("cloudy"), "cloud");
  assert.equal(metKind("fog"), "fog");
  assert.equal(metKind("lightrain"), "drizzle");
  assert.equal(metKind("rainshowers_day"), "rain");
  assert.equal(metKind("lightsleet"), "snow");
  assert.equal(metKind("heavysnowshowersandthunder_day"), "storm");
  assert.equal(metKind(undefined), null);
});

test("nearby points share one ~1 km cell", () => {
  assert.deepEqual(cell(43.7712, 11.2486), [43.77, 11.25]);
  assert.deepEqual(cell(43.7741, 11.2541), [43.77, 11.25]);
});
