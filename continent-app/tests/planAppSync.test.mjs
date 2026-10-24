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

test("a month answer sets the month's first day and the nights", () => {
  const app = fakeApp();
  syncWhen(app, { mode: "months", months: [5], nights: 7 }, new Date(2026, 10, 3));
  assert.deepEqual(app.calls, { flex: "month", depart: "2027-05-01", ret: "2027-05-08" });
});

test("the next of several months comes first", () => {
  const app = fakeApp();
  syncWhen(app, { mode: "months", months: [2, 12], nights: 3 }, new Date(2026, 10, 3));
  assert.equal(app.calls.depart, "2026-12-01");
});

test("exact dates and any time", () => {
  const a = fakeApp();
  syncWhen(a, { mode: "exact", start: "2027-07-10", end: "2027-07-17", months: [], nights: 7 });
  assert.deepEqual(a.calls, { flex: null, depart: "2027-07-10", ret: "2027-07-17" });
  const b = fakeApp();
  syncWhen(b, { mode: "any", months: [], nights: 7 });
  assert.deepEqual(b.calls, { flex: "any" });
});

test("the earliest allowed day wins inside its month", () => {
  const app = fakeApp("2026-11-20");
  syncWhen(app, { mode: "months", months: [11], nights: 4 }, new Date(2026, 10, 3));
  assert.equal(app.calls.depart, "2026-11-20");
});

test("party parts", () => {
  const app = fakeApp();
  syncParty(app, { adults: 2, kids: 1, babies: 0 });
  assert.deepEqual(app.calls.party, { adults: 2, children: 1, babies: 0 });
  syncParty(null, { adults: 1, kids: 0, babies: 0 });
});
