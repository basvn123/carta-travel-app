// PT-E4 (ROADMAP G4, logic audit E4): parity test, written first as `todo` so a wave
// shows its effect as a diff. One way there: Explore, the place page, Places and the planner agree within EUR 1 and on the mode.
// Every test here is { todo: true } while it fails on today's code: CI stays green, the
// engine wave flips each one to a plain test in the commit that makes it pass.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E4).
// Run: node --test tests/<file> (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";

const CASES = [
  { from: "BRU", to: "gem:annecy", why: "Brussels to Annecy: a drive or a train, not a plane picked on one screen only" },
  { from: "LON", to: "gem:york", why: "London to York: York is drivable from London" },
  { from: "BRU", to: "PMI", why: "Brussels to Palma: Mallorca is not drivable from the continent" },
];
for (const c of CASES) {
  test(`E4: ${c.why}`, { todo: true }, async () => {
    const { wayThere } = await import("../src/lib/price/way.js");
    const surfaces = ["explore", "place", "places", "planner"].map((s) => wayThere({ ...c, surface: s }));
    assert.equal(new Set(surfaces.map((w) => w.mode)).size, 1);
    const eur = surfaces.map((w) => w.eur);
    assert.ok(Math.max(...eur) - Math.min(...eur) <= 1);
  });
}
