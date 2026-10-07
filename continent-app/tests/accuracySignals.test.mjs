// T093: the "check before you book" line and the figure footer read the
// same ledger, so the three accuracy signals cannot disagree on the page.
// The rule mirrors pipeline/accuracy.py in Trips/carta-unified/carta-unified.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { figureLedger, accuracySignals } from "../src/lib/journeys.js";

const row = (path, confidence, extra = {}) => ({
  path, confidence, sourceUrl: confidence === "sourced" ? `https://example.org/${path}` : null,
  checkedAt: "2026-10-07", ...extra,
});

const sourcedTrip = {
  figures: [
    row("budget.breakdown.accommodation", "sourced"),
    row("budget.breakdown.food", "sourced"),
    row("budget.breakdown.transport", "sourced"),
    row("budget.breakdown.activities", "sourced"),
    row("budget.totalEur", "derived"),
    row("budget.perDayEur", "derived"),
    row("itinerary[0].dayStats.distanceKm", "sourced"),
    row("typeSpecific.surfaceMix", "sourced"),   // not shown on the page, not counted
  ],
  verifyFlags: ["Withheld itinerary[1].dayStats.ascentM: no source given"],
  verifyFlagCount: 0,
  volatilePricing: false,
};

test("a ledger with nothing estimated or flagged says nothing", () => {
  const ledger = figureLedger(sourcedTrip);
  assert.equal(ledger.total, 7);
  assert.deepEqual(accuracySignals(sourcedTrip, ledger), { count: 0, volatile: false, from: "ledger" });
});

test("an estimated price and a flagged climb are two details, and the price makes it volatile", () => {
  const trip = structuredClone(sourcedTrip);
  trip.figures[1] = row("budget.breakdown.food", "estimated");
  trip.figures[6] = row("itinerary[0].dayStats.distanceKm", "sourced",
    { flag: "Disputed itinerary[0].dayStats.distanceKm, medium terrain: the loop is 12 km longer" });
  const ledger = figureLedger(trip);
  assert.equal(ledger.estimated, 1);
  assert.deepEqual(accuracySignals(trip, ledger), { count: 2, volatile: true, from: "ledger" });
});

test("a flagged distance alone is a detail to check but not a price", () => {
  const trip = structuredClone(sourcedTrip);
  trip.figures[6] = row("itinerary[0].dayStats.distanceKm", "sourced",
    { flag: "Disputed itinerary[0].dayStats.distanceKm, low contradiction: the day text says 40 km" });
  assert.deepEqual(accuracySignals(trip, figureLedger(trip)), { count: 1, volatile: false, from: "ledger" });
});

test("a blank flag is not a flag", () => {
  const trip = structuredClone(sourcedTrip);
  trip.figures[6] = row("itinerary[0].dayStats.distanceKm", "sourced", { flag: "   " });
  assert.equal(accuracySignals(trip, figureLedger(trip)).count, 0);
});

test("the page counts only the figures it shows", () => {
  const trip = structuredClone(sourcedTrip);
  trip.figures[7] = row("typeSpecific.surfaceMix", "estimated");
  assert.equal(accuracySignals(trip, figureLedger(trip)).count, 0);
});

test("the ledger wins over stale record fields", () => {
  const trip = { ...structuredClone(sourcedTrip), verifyFlagCount: 7, volatilePricing: true };
  assert.deepEqual(accuracySignals(trip, figureLedger(trip)), { count: 0, volatile: false, from: "ledger" });
});

test("a v2.0 trip without a ledger follows its own flags, and volatile needs at least one", () => {
  const ledger = figureLedger({ verifyFlagCount: 3 });
  assert.equal(ledger, null);
  assert.deepEqual(accuracySignals({ verifyFlagCount: 3, volatilePricing: true }, ledger),
    { count: 3, volatile: true, from: "record" });
  // The J4 contradiction (30 published trips before T093): volatile with nothing to check.
  assert.deepEqual(accuracySignals({ verifyFlagCount: 0, volatilePricing: true }, null),
    { count: 0, volatile: false, from: "record" });
  assert.deepEqual(accuracySignals({}, null), { count: 0, volatile: false, from: "record" });
  assert.deepEqual(accuracySignals({ verifyFlagCount: "4" }, null), { count: 4, volatile: true, from: "record" });
});
