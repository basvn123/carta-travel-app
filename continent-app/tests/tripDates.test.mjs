// T815: the trip's dates in the Plan flow (src/lib/tripDates.js) and the
// trip settings that read them. Each test is a bug the date audit found.
// Run: npm test (from continent-app/)
process.env.TZ = "Pacific/Auckland"; // east of UTC+12, where local noon read as UTC is a day early
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TRIP_NIGHTS, addDaysUTC, nightsBetween, monthsByNext, exactWindow, windowFromStart, movedWindow,
} from "../src/lib/tripDates.js";
import { defaultSettings, normalizeSettings, draftPatch, fromImports } from "../src/planner/flow/tripSettings.js";

test("adding days never moves a day in a far-east time zone", () => {
  assert.equal(addDaysUTC("2026-11-01", 7), "2026-11-08");
  assert.equal(addDaysUTC("2026-03-28", 2), "2026-03-30"); // over a clock change
  assert.equal(addDaysUTC("2026-12-31", 1), "2027-01-01");
  assert.equal(nightsBetween("2026-10-24", "2026-10-26"), 2);
  assert.equal(nightsBetween("2026-11-08", "2026-11-01"), 0);
});

test("several months: the next one to come leads, as on Explore", () => {
  const oct29 = new Date(2026, 9, 29, 12);
  assert.deepEqual(monthsByNext([1, 11], oct29), [11, 1]);
  assert.deepEqual(monthsByNext([10, 3, 12], oct29), [10, 12, 3]);
  const s = normalizeSettings({ ...defaultSettings(), when: { mode: "months", months: [11, 1], nights: 7 } });
  const p = draftPatch(s, {}, oct29);
  assert.equal(p.wizard.flexMonth, "2026-11");
  assert.deepEqual(p.travelDates.flexibleMonths, ["2026-11", "2027-01"]);
});

test("an end on or before the start is dropped, the nights follow the dates", () => {
  assert.deepEqual(exactWindow({ mode: "exact", start: "2026-12-20", end: "2026-11-15", nights: 7 }),
    { mode: "exact", start: "2026-12-20", end: "", nights: 7 });
  assert.equal(exactWindow({ mode: "exact", start: "2026-12-01", end: "2026-12-15", nights: 7 }).nights, 14);
  const s = normalizeSettings({ ...defaultSettings(), when: { mode: "exact", start: "2026-12-20", end: "2026-12-20", nights: 3 } });
  assert.equal(s.when.end, "");
});

test("a booking after the old end never leaves the trip ending before it starts", () => {
  const base = normalizeSettings({ ...defaultSettings(), when: { mode: "exact", start: "2026-11-08", end: "2026-11-15", nights: 7 } });
  const one = fromImports(base, [{ kind: "stay", date: "2026-12-20", title: "Hotel" }]);
  assert.equal(one.when.start, "2026-12-20");
  assert.equal(one.when.end, "");
  const two = fromImports(defaultSettings(), [
    { kind: "flight_out", date: "2026-12-01", title: "Out" },
    { kind: "flight_home", date: "2026-12-15", title: "Home" },
  ]);
  assert.equal(two.when.nights, 14);
});

test("a start near the last plannable day keeps the end inside it", () => {
  assert.deepEqual(windowFromStart("2027-10-27", 7, "2027-10-29"), { start: "2027-10-27", end: "2027-10-29", nights: 2 });
  assert.deepEqual(windowFromStart("2026-11-01", 7, ""), { start: "2026-11-01", end: "2026-11-08", nights: 7 });
});

test("a new When in the settings moves the planned trip, end included", () => {
  const w = (start, end) => ({ mode: "exact", start, end, nights: 7 });
  // A new end with the same start was ignored.
  assert.deepEqual(movedWindow(w("2026-11-07", "2026-11-21"), "2026-11-07", "2026-11-14", 7),
    { start: "2026-11-07", end: "2026-11-21", short: false });
  // The settings' end wins over the planned nights; short when the stops hold more.
  assert.deepEqual(movedWindow(w("2026-12-05", "2026-12-08"), "2026-11-07", "2026-11-14", 5),
    { start: "2026-12-05", end: "2026-12-08", short: true });
  // No end: the start plus the nights planned.
  assert.equal(movedWindow(w("2026-12-05", ""), "2026-11-07", "2026-11-12", 5).end, "2026-12-10");
  // Nothing changed, or not two dates: nothing moves.
  assert.equal(movedWindow(w("2026-11-07", "2026-11-14"), "2026-11-07", "2026-11-14", 7), null);
  assert.equal(movedWindow({ mode: "months", months: [11], nights: 7 }, "2026-11-07", "2026-11-14", 7), null);
});

test("one night limit for every When control", () => {
  assert.equal(MAX_TRIP_NIGHTS, 60);
});
