// T660: the trip's party and dates reach the app-wide values Explore prices with.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { syncParty, syncWhen } from "../src/planner/flow/appSync.js";

function fakeApp(min = null) {
  const calls = {};
  return {
    calls,
    dateBounds: { min },
    setPartyParts: (v) => { calls.party = v; },
    setDateFlex: (v) => { calls.flex = v; },
    setDepartDate: (v) => { calls.depart = v; },
    setReturnDate: (v) => { calls.ret = v; },
  };
}

test("a month answer sets the month's first Saturday and the nights (T815-a)", () => {
  const app = fakeApp();
  syncWhen(app, { mode: "months", months: [5], nights: 7 }, new Date(2026, 10, 3));
  // 1 May 2027 is a Saturday.
  assert.deepEqual(app.calls, { flex: "month", depart: "2027-05-01", ret: "2027-05-08" });
});

test("the next of several months comes first", () => {
  const app = fakeApp();
  syncWhen(app, { mode: "months", months: [2, 12], nights: 3 }, new Date(2026, 10, 3));
  assert.equal(app.calls.depart, "2026-12-05"); // the first Saturday of December 2026
});

test("exact dates and any time", () => {
  const a = fakeApp();
  syncWhen(a, { mode: "exact", start: "2027-07-10", end: "2027-07-17", months: [], nights: 7 });
  assert.deepEqual(a.calls, { flex: null, depart: "2027-07-10", ret: "2027-07-17" });
  const b = fakeApp();
  syncWhen(b, { mode: "any", months: [], nights: 7 });
  assert.deepEqual(b.calls, { flex: "any" });
});

test("the first Saturday on or after the earliest allowed day, inside its month", () => {
  const app = fakeApp("2026-11-20");
  syncWhen(app, { mode: "months", months: [11], nights: 4 }, new Date(2026, 10, 3));
  assert.equal(app.calls.depart, "2026-11-21"); // 20 November is a Friday
  const late = fakeApp("2026-11-29");
  syncWhen(late, { mode: "months", months: [11], nights: 2 }, new Date(2026, 10, 3));
  assert.equal(late.calls.depart, "2026-11-29", "no Saturday left in the month: the earliest day");
});

test("party parts", () => {
  const app = fakeApp();
  syncParty(app, { adults: 2, kids: 1, babies: 0 });
  assert.deepEqual(app.calls.party, { adults: 2, children: 1, babies: 0 });
  syncParty(null, { adults: 1, kids: 0, babies: 0 });
});

test("G12 §12: a When prefilled from Explore and confirmed syncs back the same window", async () => {
  const { exploreAnswers, seedToSettings } = await import("../src/lib/plan/seed.js");
  const model = { whenSet: true, dateMode: "month", month: "2027-05", nightsSet: true, tripNights: 5, nights: 5 };
  const s = seedToSettings({}, { explore: exploreAnswers(model) });
  assert.equal(s.sources.when, "explore");
  const app = fakeApp();
  syncWhen(app, s.when, new Date(2026, 10, 3));
  assert.deepEqual(app.calls, { flex: "month", depart: "2027-05-01", ret: "2027-05-06" });
});
