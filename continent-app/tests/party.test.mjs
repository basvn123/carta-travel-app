// PT-E2 (ROADMAP G4, logic audit E2): parity test, written first as `todo` so a wave
// shows its effect as a diff. One party model: the same people give the same car count and kind on every screen.
// Every test here is { todo: true } while it fails on today's code: CI stays green, the
// engine wave flips each one to a plain test in the commit that makes it pass.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E2).
// Run: node --test tests/<file> (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { partyOf } from "../src/lib/party.js";

test("E2: 4 adults + 1 baby needs the same cars on Explore, Places and the planner (B probe P8)", { todo: true }, async () => {
  const { carsFor } = await import("../src/lib/party.js");
  assert.equal(typeof carsFor, "function");
  assert.equal(carsFor(partyOf({ group_size: 4, babies: 1 })), 1);
});

test("E2: a couple style with 5 adults is a group, not a couple (G-10)", { todo: true }, async () => {
  const { kindFits } = await import("../src/lib/party.js");
  assert.equal(kindFits("couple", { adults: 5, kids: 0, babies: 0 }), false);
  assert.equal(kindFits("couple", { adults: 2, kids: 0, babies: 0 }), true);
});

test("E2: a family with teens stays a family, a baby is under 2 (owner default 2)", { todo: true }, async () => {
  const { partyFromAges } = await import("../src/lib/party.js");
  const p = partyFromAges([40, 38, 15, 13]);
  assert.equal(p.kind, "family");
  assert.equal(partyFromAges([40, 38, 1]).babies, 1);
});
