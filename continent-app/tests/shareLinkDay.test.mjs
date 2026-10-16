// T433: a day plan as a link. The decoder is the only thing between a link
// anybody can craft and the planner's state, so it is held to the trip
// link's standard (shareLinkHostile.test.mjs): whitelisted fields, clamped
// numbers, no prototype names as ids, and no geometry trusted at all.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { encodeDayShare, decodeDayShare, sanitizeDayShare } from "../src/lib/shareLink.js";

const PLAN = {
  v: 1,
  label: "Rome + Tivoli",
  start: "2026-10-17",
  stay: { lat: 41.8996, lon: 12.4939, label: "Hotel Artemide" },
  stops: [{ d: "ROM", n: 3 }, { d: "gem:tivoli", n: 1 }],
  a: { 0: { 0: [3, 7, 9], 1: [12, 14], 2: [20] }, 1: { 0: [1, 2] } },
};

test("a plan survives the round trip", async () => {
  const raw = await encodeDayShare(PLAN);
  assert.ok(raw && /^[01]\./.test(raw));
  const d = await decodeDayShare(raw);
  assert.equal(d.label, "Rome + Tivoli");
  assert.equal(d.startDate, "2026-10-17");
  assert.deepEqual(d.stops, [{ destinationId: "ROM", days: 3 }, { destinationId: "gem:tivoli", days: 1 }]);
  assert.deepEqual(d.assign[0][1], [12, 14]);
  assert.equal(d.stay.label, "Hotel Artemide");
});

test("prototype names are never accepted as towns", () => {
  for (const bad of ["__proto__", "constructor", "prototype", "hasOwnProperty", "toString"]) {
    const d = sanitizeDayShare({ ...PLAN, stops: [{ d: bad, n: 1 }] });
    assert.equal(d, null, `${bad} accepted`);
  }
});

test("days and indices are clamped, duplicates dropped", () => {
  const d = sanitizeDayShare({
    ...PLAN,
    stops: [{ d: "ROM", n: 400 }],
    a: { 0: { 0: [1, 1, -5, 99999, "x", 4], 9: [3] } },
  });
  assert.equal(d.stops[0].days, 7);
  assert.deepEqual(d.assign[0][0], [1, 4]);
  assert.equal(d.assign[0][9], undefined, "a day past the stop's days leaked in");
});

test("a stay outside the globe or not a number is dropped", () => {
  assert.equal(sanitizeDayShare({ ...PLAN, stay: { lat: 200, lon: 12 } }).stay, null);
  assert.equal(sanitizeDayShare({ ...PLAN, stay: { lat: "a", lon: 12 } }).stay, null);
});

test("markup in the label is stripped, the date is a date or nothing", () => {
  const d = sanitizeDayShare({ ...PLAN, label: "<img src=x onerror=alert(1)>Rome", start: "tomorrow" });
  assert.ok(!/[<>]/.test(d.label));
  assert.equal(d.startDate, null);
});

test("garbage and oversized links decode to nothing", async () => {
  assert.equal(await decodeDayShare("nope"), null);
  assert.equal(await decodeDayShare("9.abc"), null);
  assert.equal(await decodeDayShare(`0.${"A".repeat(30000)}`), null);
  assert.equal(sanitizeDayShare({ stops: "ROM" }), null);
});
