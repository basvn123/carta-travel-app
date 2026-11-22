// PT-E8 (ROADMAP G4, logic audit E8): parity test, written first as `todo` so a wave
// shows its effect as a diff. One day clock: screen, PDF, ICS and preview end within 1 minute of each other (the I-clocks probe).
// Every test here is { todo: true } while it fails on today's code: CI stays green, the
// engine wave flips each one to a plain test in the commit that makes it pass.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E8).
// Run: node --test tests/<file> (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { buildDaySchedule } from "../src/planner/daySchedule.js";

// The five Paris stops of the I-clocks probe, with and without a stay 8 km out.
const STOPS = [
  { name: "Sainte-Chapelle", dwellMin: 45, legAfterMin: 10 }, { name: "Notre-Dame", dwellMin: 45, legAfterMin: 20 },
  { name: "Louvre", dwellMin: 150, legAfterMin: 25 }, { name: "Musee d'Orsay", dwellMin: 90, legAfterMin: 35 },
  { name: "Eiffel Tower", dwellMin: 90, legAfterMin: null },
];
const screen = (stayLegMin) => buildDaySchedule({ items: STOPS, legMin: (i) => STOPS[i].legAfterMin, dwellMin: (s) => s.dwellMin, stayLegMin }).endMin;

for (const stayLegMin of [0, 20]) {
  test(`E8: screen, PDF, ICS and preview end within 1 minute (stay leg ${stayLegMin} min)`, { todo: true }, async () => {
    const { dayEnds } = await import("../src/planner/daySchedule.js");
    const ends = dayEnds({ stops: STOPS, stayLegMin });
    assert.equal(ends.screen, screen(stayLegMin));
    const all = [ends.screen, ends.pdf, ends.ics, ends.preview];
    assert.ok(Math.max(...all) - Math.min(...all) <= 1);
  });
}
