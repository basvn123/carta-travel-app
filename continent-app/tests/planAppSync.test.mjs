// T660: the trip's party and dates reach the app-wide values Explore prices with.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { syncParty, syncWhen, seedWhen, sameWhen } from "../src/planner/flow/appSync.js";
import { readFileSync } from "node:fs";

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

// K-3 (logic wave 0a, G4): the flow's untouched default no longer writes 7
// nights over the settings line's own.
const fresh = { answered: [], when: { mode: "exact", start: "", end: "", months: [], nights: 7 } };

test("an unanswered When starts from the settings line's nights", () => {
  const w = seedWhen(fresh, { model: { nights: 3 } });
  assert.equal(w.nights, 3);
  assert.equal(w.mode, "exact");
  // A 3-night settings line plus a month pick keeps 3 nights app-wide.
  const app = fakeApp();
  syncWhen(app, { ...w, mode: "months", months: [5] }, new Date(2026, 10, 3));
  assert.deepEqual(app.calls, { flex: "month", depart: "2027-05-01", ret: "2027-05-04" });
});

test("an answered When is the traveller's and stays", () => {
  const answered = { answered: ["when"], when: { ...fresh.when, nights: 10 } };
  assert.equal(seedWhen(answered, { model: { nights: 3 } }).nights, 10);
  assert.equal(seedWhen(fresh, null).nights, 7, "no app: the default");
  assert.equal(seedWhen(fresh, { model: { nights: null } }).nights, 7);
});

test("sameWhen compares the fields, not the key order", () => {
  const a = { mode: "months", start: "", end: "", months: [5, 2], nights: 3 };
  const b = { nights: 3, months: [2, 5], end: "", start: "", mode: "months" };
  assert.equal(sameWhen(a, b), true);
  assert.equal(sameWhen(a, { ...b, nights: 4 }), false);
  assert.equal(sameWhen(a, { ...b, mode: "any" }), false);
  assert.equal(sameWhen({ ...fresh.when }, { ...fresh.when }), true);
});

test("Tell syncs When only when the words named it or a booking changed it", () => {
  const src = readFileSync(new URL("../src/planner/flow/QuestionScreen.jsx", import.meta.url), "utf8");
  assert.match(src, /if \(now\.words\.includes\('when'\) \|\| !sameWhen\(read\.when, settings\.when\)\) syncWhen\(app, s\.when\);/);
  assert.doesNotMatch(src, /read !== settings/);
  const screens = readFileSync(new URL("../src/planner/flow/setupScreens.jsx", import.meta.url), "utf8");
  assert.match(screens, /useState\(\(\) => seedWhen\(settings, app\)\)/);
});
