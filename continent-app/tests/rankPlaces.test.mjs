// PT-E6 (ROADMAP G4, logic audit E6): parity test, written first as `todo` so a wave
// shows its effect as a diff. One place ranker. Runs on the real places of the golden fixture.
// Every test here is { todo: true } while it fails on today's code: CI stays green, the
// engine wave flips each one to a plain test in the commit that makes it pass.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E6).
// Run: node --test tests/<file> (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sortForYou } from "../src/lib/match.js";

const PLACES = JSON.parse(readFileSync(new URL("./fixtures/logic-golden/places.json", import.meta.url), "utf8")).places;
const pick = (...ids) => ids.map((id) => PLACES.find((p) => p.id === id));

test("E6: the four 9.6 places order by fame: Salzburg, Dubrovnik, Hallstatt, Taormina", { todo: true }, () => {
  const order = sortForYou(pick("gem:taormina", "gem:hallstatt", "DBV", "SZG"), {}, null).map((p) => p.id);
  assert.deepEqual(order, ["SZG", "DBV", "gem:hallstatt", "gem:taormina"]);
});

// Passes today (the fit already behaves); kept as a plain guard so E6 cannot break it.
test("E6: a third like never lowers a place's fit below the two-like fit", async () => {
  const { fit } = await import("../src/lib/match.js");
  const hallstatt = PLACES.find((p) => p.id === "gem:hallstatt");
  const two = fit({ likes: ["hiking", "lakes"] }, hallstatt.taste, 9);
  const three = fit({ likes: ["hiking", "lakes", "food"] }, hallstatt.taste, 9);
  assert.ok(three.F >= two.F);
});

test("E6: a family's Strong match list has at least 30 places in the wire", { todo: true }, async () => {
  const { rankPlaces } = await import("../src/lib/rank/rankPlaces.js");
  assert.equal(typeof rankPlaces, "function");
});

test("E6: searching nice puts Nice first", { todo: true }, async () => {
  const { rankPlaces } = await import("../src/lib/rank/rankPlaces.js");
  assert.equal(rankPlaces(PLACES, { query: "nice" })[0].id, "NCE");
});
