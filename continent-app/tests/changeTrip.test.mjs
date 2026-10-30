// T888: Change your trip's start days around the trip's own, each with what
// it does to the total; none in the past.
import test from "node:test";
import assert from "node:assert/strict";
import { shiftDays } from "../src/planner/trip/changeTrip.js";

test("seven start days, the same nights, the delta from the quote, the past left out", () => {
  const seen = [];
  const quote = (p) => { seen.push(p); return p.tripStart < "2027-06-05" ? -40 : 25; };
  const days = shiftDays("2027-06-05", "2027-06-12", quote, { today: "2026-10-30" });
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.k), [-3, -2, -1, 0, 1, 2, 3]);
  assert.ok(days.every((d) => d.nights === 7));
  assert.equal(days[0].start, "2027-06-02");
  assert.equal(days[0].end, "2027-06-09");
  assert.equal(days[3].delta, 0, "the trip's own day costs nothing more");
  assert.equal(days[0].delta, -40);
  assert.equal(days[6].delta, 25);
  assert.equal(seen.length, 6, "the trip's own day is not priced again");
  const soon = shiftDays("2026-11-01", "2026-11-04", () => 0, { today: "2026-10-30" });
  assert.deepEqual(soon.map((d) => d.start), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
  assert.deepEqual(shiftDays("", "", quote), []);
});
