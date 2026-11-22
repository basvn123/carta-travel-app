// PT-E3 (ROADMAP G4, logic audit E3): parity test, written first as `todo` so a wave
// shows its effect as a diff. One stay ladder: tier fallback and occupancy in config.
// Every test here is { todo: true } while it fails on today's code: CI stays green, the
// engine wave flips each one to a plain test in the commit that makes it pass.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E3).
// Run: node --test tests/<file> (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";

test("E3: a solo dorm request at a town with no hostel prices private or hotel2 when offered", { todo: true }, async () => {
  const { stayLadder } = await import("../src/lib/price/ladder.js");
  const rec = { month: { private: Array(12).fill(70), hotel2: Array(12).fill(85) }, season_q: "mmmmmmmmmmmm" };
  const r = stayLadder(rec, "dorm", { adults: 1 });
  assert.ok(["private", "hotel2"].includes(r.tier));
  assert.equal(r.fallback, true);
});

test("E3: 2 adults + 1 child book one room, not two", { todo: true }, async () => {
  const { stayLadder } = await import("../src/lib/price/ladder.js");
  const rec = { month: { hotel3: Array(12).fill(120) }, season_q: "mmmmmmmmmmmm" };
  assert.equal(stayLadder(rec, "hotel3", { adults: 2, children: 1 }).rooms, 1);
});

test("E3: cleaning grows with the number of units", { todo: true }, async () => {
  const { stayLadder } = await import("../src/lib/price/ladder.js");
  const rec = { month: { bnb_home: Array(12).fill(150) }, season_q: "mmmmmmmmmmmm" };
  assert.ok(stayLadder(rec, "bnb_home", { adults: 4, children: 4 }).cleaning > stayLadder(rec, "bnb_home", { adults: 2 }).cleaning);
});
