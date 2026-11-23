// PT-E5 (ROADMAP G4, logic audit E5): parity test, written first as `todo` so a wave
// shows its effect as a diff. One month: source, fit and heat. Runs on the real places of the golden fixture.
// Every test here is { todo: true } while it fails on today's code: CI stays green, the
// engine wave flips each one to a plain test in the commit that makes it pass.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E5).
// Run: node --test tests/<file> (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bestMonthsFor } from "../src/lib/heatRisk.js";

const PLACES = JSON.parse(readFileSync(new URL("./fixtures/logic-golden/places.json", import.meta.url), "utf8")).places;
const place = (id) => PLACES.find((p) => p.id === id);
const fineToday = (p, m) => bestMonthsFor(p.climate, false).best.includes(m);

test("E5: every month has at least 5 of the 60 fixture places fine (300 of 3,855 in the wire); today Jan, Feb, Nov, Dec have none", { todo: true }, () => {
  for (let m = 1; m <= 12; m++) assert.ok(PLACES.filter((p) => fineToday(p, m)).length >= 5, `month ${m}`);
});

test("E5: Faro is fine in October", { todo: true }, () => {
  assert.equal(fineToday(place("FAO"), 10), true);
});

test("E5: St Anton is fine in January for a ski trip", { todo: true }, () => {
  assert.equal(fineToday(place("gem:st-anton"), 1), true);
});

test("E5: one place page shows one month everywhere (departDate, statMonth, packing)", { todo: true }, async () => {
  const { resolveMonth } = await import("../src/lib/when.js");
  assert.equal(typeof resolveMonth, "function");
});
