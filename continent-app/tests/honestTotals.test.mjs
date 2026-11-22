// PT-E1 (ROADMAP G4, logic audit E1): parity test, written first as `todo` so a wave
// shows its effect as a diff. One "missing value" rule: no path prints a lower total for a missing part.
// Every test here is { todo: true } while it fails on today's code: CI stays green, the
// engine wave flips each one to a plain test in the commit that makes it pass.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E1).
// Run: node --test tests/<file> (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { toEur } from "../src/lib/currency.js";
import { groundSpendPerPerson } from "../src/lib/runtime_pricing.js";

test("E1: an unknown currency is not converted at par (A-20)", { todo: true }, () => {
  assert.equal(toEur(100, "XXX"), null);
});

test("E1: a basket with a missing food item is unknown, not cheaper (A-13)", { todo: true }, () => {
  const dest = { costs: { meal_mid_eur: 20, meal_cheap_eur: 10, fastfood_eur: null, drink_out_eur: 5 } };
  assert.equal(groundSpendPerPerson(dest, 7, {}), null);
});

test("E1: Barcelona 3 nights + Reus 4 nights, Reus without a bed price: the total is partial and says what it leaves out (A-1)", { todo: true }, async () => {
  const { sumParts } = await import("../src/lib/price/gaps.js");
  const r = sumParts([{ kind: "bed", stop: 0, eur: 300 }, { kind: "bed", stop: 1, eur: null }]);
  assert.equal(r.complete, false);
  assert.deepEqual(r.leftOut, [{ kind: "bed", stop: 1 }]);
});

test("E1: Palma with no fare is never cheapest and a partial total is never fits (B-4, H-2, A-10)", { todo: true }, async () => {
  const { budgetStanding, comparePartialLast } = await import("../src/lib/price/gaps.js");
  assert.equal(budgetStanding({ eur: 400, complete: false }, 1500, { adults: 2 }).state, "partial");
  assert.ok(comparePartialLast({ eur: 400, complete: false }, { eur: 900, complete: true }) > 0);
});
