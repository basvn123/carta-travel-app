// PT-E7 (ROADMAP G4, logic audit E7): parity test, written first as `todo` so a wave
// shows its effect as a diff. One trip selection and one price path: a selection costs the same to the cent on its page and in the planner.
// Every test here is { todo: true } while it fails on today's code: CI stays green, the
// engine wave flips each one to a plain test in the commit that makes it pass.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E7).
// Run: node --test tests/<file> (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";

for (const kind of ["loop trip", "base trip", "journey", "finder trip"]) {
  test(`E7: a ${kind} is priced equal to the cent on its page and in the planner`, { todo: true }, async () => {
    const { priceSelection } = await import("../src/lib/price/selection.js");
    const onPage = priceSelection({ kind, surface: "page" });
    const inPlanner = priceSelection({ kind, surface: "planner" });
    assert.equal(onPage.total, inPlanner.total);
  });
}

test("E7: shareNights sums to the total and gives every stop at least 1", { todo: true }, async () => {
  const { shareNights } = await import("../src/lib/price/selection.js");
  for (const [total, stops] of [[7, 3], [3, 3], [14, 5], [2, 3]]) {
    const n = shareNights(total, stops);
    assert.equal(n.reduce((a, b) => a + b, 0), Math.max(total, stops));
    assert.ok(n.every((x) => x >= 1));
  }
});

// Passes today (QW#13 added FINDER_INPUTS); kept as a plain guard so E7 keeps the list.
test("E7: the finder memo key changes when any FINDER_INPUTS field changes (the quick win QW#13 pins the interim list)", async () => {
  const { FINDER_INPUTS } = await import("../src/lib/recommend/candidates.js");
  assert.ok(Array.isArray(FINDER_INPUTS) && FINDER_INPUTS.length >= 10);
});
