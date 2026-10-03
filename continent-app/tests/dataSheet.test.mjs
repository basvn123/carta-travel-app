// The type-specific data sheet of T175: every style has an order, and it leads
// with what that style is about. Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { SHEET_ORDER, sheetOrder, dataSheetRows } from "../src/lib/dataSheet.js";

const STYLES = ["cycling", "trail-running", "city", "cozy-towns", "road-trip", "hiking",
  "culinary", "winter-sports", "nature-escape", "water-sports"];

test("all ten styles have a field order, with no field twice", () => {
  for (const s of STYLES) {
    const fields = sheetOrder(s).map(([f]) => f);
    assert.ok(fields.length >= 5, s);
    assert.equal(new Set(fields).size, fields.length, s);
    assert.ok(fields.includes("audience"), s);
  }
  assert.equal(Object.keys(SHEET_ORDER).length, 10);
});

test("each style leads with its own field", () => {
  const first = (s) => sheetOrder(s)[0][0];
  assert.equal(first("cycling"), "surface");
  assert.equal(first("hiking"), "technicalRating");
  assert.equal(first("winter-sports"), "snowReliability");
  assert.equal(first("water-sports"), "windConditions");
  assert.equal(first("city"), "transitPass");
  assert.equal(first("culinary"), "bestMonths");
  assert.equal(first("cozy-towns"), "distanceKm");
});

test("empty fields drop out and the order holds", () => {
  const trip = {
    tripTypeSlug: "cycling", durationDays: 7,
    typeSpecific: { surface: "asphalt", distanceKm: 350, verticalM: 0, elevationM: null, audience: "Tourers" },
  };
  const rows = dataSheetRows(trip);
  assert.deepEqual(rows.map((r) => r.field), ["surface", "distanceKm", "audience"]);
  assert.equal(rows[1].perDay, 50);
});

test("derived fields come from the budget and the best period", () => {
  const trip = {
    tripTypeSlug: "culinary", durationDays: 7,
    bestPeriod: { months: [9, 10] },
    budget: { breakdown: { food: { lowEur: 210, highEur: 350 } } },
    typeSpecific: {},
  };
  const rows = dataSheetRows(trip);
  assert.deepEqual(rows.map((r) => r.field), ["bestMonths", "foodPerDay"]);
  assert.deepEqual([rows[1].low, rows[1].high], [30, 50]);
});

test("skip leaves out the booking slots and an unknown style falls back", () => {
  const trip = { tripTypeSlug: "unknown", typeSpecific: { bookingTimeline: "x", audience: "y" } };
  assert.deepEqual(dataSheetRows(trip, { skip: ["bookingTimeline"] }).map((r) => r.field), ["audience"]);
});
