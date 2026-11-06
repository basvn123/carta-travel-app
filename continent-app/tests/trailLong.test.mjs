// T1092 (ROADMAP D7): a flat 286 km path reads "Long", not "Very hard".
// Run: npm test  (from continent-app/)
//
// The rows are the Veluwe Zwerfpad (public/trails/NL.json, id 114362) as the
// rebuilt wire carries it (f.g moderate, f.d 14 days, per
// tests/test_trail_difficulty_names.py) and as the 2026-09 wire carried it
// (f.g very_hard, no f.d), plus a long alpine traverse that keeps its grade.
import test from "node:test";
import assert from "node:assert/strict";
import {
  gradeLabelKey, isLongWalk, trailDays, LONG_MIN_DAYS,
} from "../src/lib/trailStory.js";
import { trailFilling } from "../src/lib/cardFillings.js";

const VELUWE = {
  id: 114362, name: "Veluwe Zwerfpad", category: "hike", country: "NL",
  distance_m: 285992, ascent_m: 2888, descent_m: 2889, duration_min: 4752,
  difficulty: "moderate",
  f: { g: "moderate", gs: "derived", rt: "loop", d: 14 },
};
const VELUWE_2026_09 = { ...VELUWE, difficulty: "hard", f: { g: "very_hard", gs: "derived", rt: "loop" } };
const ALPINE_TREK = { ...VELUWE, f: { g: "alpine", gs: "tagged", d: 9 } };
const DAY_WALK = { ...VELUWE, distance_m: 12000, f: { g: "moderate", gs: "derived" } };

test("a flat multi-day path reads Long", () => {
  assert.equal(trailDays(VELUWE), 14);
  assert.equal(isLongWalk(VELUWE), true);
  assert.equal(gradeLabelKey(VELUWE), "trails.gradeLong");
});

test("the old wire, without days, still reads its grade", () => {
  assert.equal(trailDays(VELUWE_2026_09), null);
  assert.equal(gradeLabelKey(VELUWE_2026_09), "trails.gradeVeryHard");
});

test("hard ground on a long walk keeps its grade", () => {
  assert.equal(isLongWalk(ALPINE_TREK), false);
  assert.equal(gradeLabelKey(ALPINE_TREK), "trails.gradeAlpine");
});

test("a one-day walk is never long", () => {
  assert.equal(trailDays(DAY_WALK), null);
  assert.equal(trailDays({ f: { d: 1 } }), null);
  assert.equal(LONG_MIN_DAYS, 2);
  assert.equal(gradeLabelKey(DAY_WALK), "trails.gradeModerate");
});

test("the trail card hook prints Long, not Very hard", () => {
  const t = (key) => key;
  const out = trailFilling({ tr: VELUWE, kindKey: "trails.kindHike" }, { t });
  const words = out.hook.map((h) => h.text);
  assert.ok(words.includes("trails.gradeLong"), words.join(", "));
  assert.ok(!words.includes("trails.gradeVeryHard"));
});
