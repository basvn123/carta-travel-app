// T1123 (ROADMAP G4): the plan flow keeps where the traveller stood across a
// reload. These check the memory itself (lib only, a fake storage); the
// screens are walked by scripts/verify_core_flow.mjs.
//   - a kept setup screen comes back for the same trip only
//   - a screen the flow no longer offers reads as nothing kept
//   - forgetting clears it; a broken entry reads as nothing
//   - the two places (opening, trip) are kept apart
// Run: npm test (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { FLOW_PLACE_KEY, recallPlace, rememberPlace, resetFlowMemory } from "../src/planner/flow/flowMemory.js";
import { firstSetup, guideScreens, TRIPS_SCREEN } from "../src/planner/flow/flowGraph.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test("T1123: a setup screen comes back after a reload, for the same trip", () => {
  const st = fakeStorage();
  const allowed = [...firstSetup(normalizeSettings({})), "create", "kind", "now"];
  rememberPlace("opening", "trip-1", { screen: "from", kindAsked: false }, st);
  assert.equal(recallPlace("opening", "trip-1", allowed, st)?.screen, "from");
  // Another trip (Start planning began a new one) inherits nothing.
  assert.equal(recallPlace("opening", "trip-2", allowed, st), null);
});

test("T1123: a screen the flow no longer offers reads as nothing kept", () => {
  const st = fakeStorage();
  rememberPlace("opening", "t", { screen: "when" }, st);
  // Bookings now fix the dates: When is not asked, so it is not restored.
  const booked = firstSetup(normalizeSettings({ booked: { flights: true } }));
  assert.equal(recallPlace("opening", "t", [...booked, "create"], st), null);
});

test("T1123: forgetting clears the place; a broken entry reads as nothing", () => {
  const st = fakeStorage();
  rememberPlace("opening", "t", { screen: "who" }, st);
  rememberPlace("opening", "t", null, st);
  assert.equal(recallPlace("opening", "t", null, st), null);
  st.setItem(FLOW_PLACE_KEY, "{not json");
  assert.equal(recallPlace("opening", "t", null, st), null);
  // No trip id: nothing is kept or read.
  rememberPlace("opening", "", { screen: "who" }, st);
  assert.equal(recallPlace("opening", "", null, st), null);
});

test("T1123: the priced trips come back with the short-setup mark, apart from the opening", () => {
  const st = fakeStorage();
  const s = normalizeSettings({});
  const allowed = [...guideScreens(s), "ff", "home"];
  assert.ok(allowed.includes(TRIPS_SCREEN));
  rememberPlace("opening", "t", { screen: "from" }, st);
  rememberPlace("trip", "t", { phase: TRIPS_SCREEN, walked: false, quick: true }, st);
  rememberPlace("opening", "t", null, st);
  const kept = recallPlace("trip", "t", allowed, st);
  assert.equal(kept.phase, TRIPS_SCREEN);
  assert.equal(kept.quick, true);
  assert.equal(kept.walked, false);
  // The engine is never restored (its steps hold their own state).
  assert.equal(recallPlace("trip", "t", allowed, (() => { const x = fakeStorage(); rememberPlace("trip", "t", { phase: "engine" }, x); return x; })()), null);
});

test("T1123: without a storage the module's memory holds the place", () => {
  resetFlowMemory();
  rememberPlace("trip", "t", { phase: "home" }, null);
  assert.equal(recallPlace("trip", "t", ["home"], null)?.phase, "home");
  resetFlowMemory();
  assert.equal(recallPlace("trip", "t", ["home"], null), null);
});
