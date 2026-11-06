// T1103 (ROADMAP G12, audit P-33): the shorter plan flow.
//   - A new trip asks Tell, who, when and from, then lands on its priced
//     trips; the other setup questions refine it later.
//   - Tell Carta's words that answer all three go straight to the trips.
//   - A trip under way keeps its full run, and the kind sheet is asked only
//     while a device trip is under way today.
//   - The quick-start mark is read without clearing until cleared.
// Run: npm test (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { FIRST_SETUP, firstSetup, setupScreens, continueTo, tripUnderWay } from "../src/planner/flow/flowGraph.js";
import { markQuickStart, peekQuickStart, clearQuickStart } from "../src/planner/flow/quickStart.js";

const s = (patch) => normalizeSettings(patch);

test("T1103: a new trip asks four screens, three of them answers", () => {
  assert.deepEqual(firstSetup(s({})), ["tell", "who", "when", "from"]);
  assert.deepEqual(FIRST_SETUP.filter((id) => id !== "tell"), ["who", "when", "from"]);
  // Every first screen is one of the full setup's, in the same order.
  const all = setupScreens(s({}));
  assert.deepEqual(all.filter((id) => FIRST_SETUP.includes(id)), firstSetup(s({})));
});

test("T1103: bookings still drop what they answer", () => {
  assert.deepEqual(firstSetup(s({ booked: { flights: true } })), ["tell", "who"]);
});

test("T1103: a trip under way keeps its own run", () => {
  const now = s({ kind: "now" });
  assert.deepEqual(firstSetup(now), setupScreens(now));
});

test("T1103: words that answer who, when and from go straight to create", () => {
  const w = s({ answered: ["tell", "who", "when", "from"], sources: { who: "words", when: "words", from: "words" } });
  const list = [...firstSetup(w), "create"];
  assert.equal(continueTo(list, "tell", w, "create"), "create");
  // A screen answer is never jumped: going back and on walks in order.
  const own = s({ answered: ["tell", "who"], sources: {} });
  assert.equal(continueTo([...firstSetup(own), "create"], "tell", own, "create"), "who");
});

test("T1103: the kind sheet only while a trip is under way", () => {
  const today = "2026-11-06";
  assert.equal(tripUnderWay([], today), false);
  assert.equal(tripUnderWay(null, today), false);
  assert.equal(tripUnderWay([{ start: "2026-12-01", end: "2026-12-08" }], today), false);
  assert.equal(tripUnderWay([{ start: "2026-11-01", end: "2026-11-05" }], today), false);
  assert.equal(tripUnderWay([{ start: "2026-11-06", end: "2026-11-06" }], today), true);
  assert.equal(tripUnderWay([{ start: "2026-11-01", end: "2026-11-10" }], today), true);
  assert.equal(tripUnderWay([{ start: "2026-11-01", end: "" }, { months: [11] }], today), false);
});

test("T1103: the quick-start mark survives a peek and goes on clear", () => {
  clearQuickStart();
  assert.equal(peekQuickStart(), false);
  markQuickStart();
  assert.equal(peekQuickStart(), true);
  assert.equal(peekQuickStart(), true, "peek does not clear (StrictMode runs initialisers twice)");
  clearQuickStart();
  assert.equal(peekQuickStart(), false);
});
