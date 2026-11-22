// PT-E10 (ROADMAP G4, logic audit E10): parity test, written first as `todo` so a wave
// shows its effect as a diff. One entitlement decision: the paywall matrix (closes the QUOTA-011/012/013 rows with no test).
// Every test here is { todo: true } while it fails on today's code: CI stays green, the
// engine wave flips each one to a plain test in the commit that makes it pass.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E10).
// Run: node --test tests/<file> (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";

const MATRIX = [
  { who: "signed out", plan: null, ownTrips: 0, action: "save", want: "allow" },
  { who: "free, under the limit", plan: "free", ownTrips: 1, action: "save", want: "allow" },
  { who: "free, at the limit", plan: "free", ownTrips: 3, action: "save", want: "paywall" },
  { who: "free, a friend's co-planned trip does not count (J-6)", plan: "free", ownTrips: 2, coplanned: 5, action: "save", want: "allow" },
  { who: "pass holder, at the limit", plan: "pass", ownTrips: 9, action: "save", want: "allow" },
  { who: "pass just returned (?pass=ok), not yet confirmed", plan: "free", ownTrips: 3, passParam: "ok", action: "save", want: "wait" },
];
for (const row of MATRIX) {
  test(`E10: ${row.who}`, { todo: true }, async () => {
    const { decide } = await import("../src/lib/entitlement.js");
    assert.equal(decide(row).state, row.want);
  });
}
