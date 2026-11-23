// Logic wave 3a, trails and outdoor requests from the data program
// (REQ-data-1, REQ-data-5; ROADMAP D7, D24). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTemplateBlurb } from "../src/lib/placeStory.js";
import { mountainHighlights } from "../src/lib/mountainStory.js";
import {
  trailReasons, isComfortableDay, COMFORT_MAX_CLIMB_M, COMFORT_MAX_MIN, COMFORT_MAX_GRADE,
} from "../src/lib/trailStory.js";
import { notForLines, TRAIL_CLIMB_M, TRAIL_LONG_KM, TRAIL_ROAD_PCT } from "../src/lib/notFor.js";

const here = dirname(fileURLToPath(import.meta.url));
const t = (key, vars) => (vars && vars.n != null ? `s:${key}:${vars.n}` : `s:${key}`);

test("REQ-data-1: a bare Wikidata description is a template blurb, prose is not", () => {
  for (const s of [
    "Italian comune.", "Italian comune", "human settlement", "municipality of Spain",
    "village in Serbia", "Commune in Haute-Corse, France",
    "Italian comune. A member of I Borghi piu belli d'Italia.",
    "Market town in Wiltshire, England. A member of historic market towns.",
  ]) assert.equal(isTemplateBlurb(s), true, s);
  for (const s of [
    "Windmill village 30 min from Amsterdam", "UNESCO medieval city on the Danube",
    "Positano, Amalfi, Ravello: cliffside villages", "Birthplace of pilsner beer",
  ]) assert.equal(isTemplateBlurb(s), false, s);
});

test("REQ-data-1: a mountain page opens on its glacier, not the protected-area line", () => {
  const m = { why: [{ k: "park" }, { k: "hiking" }, { k: "glacier" }] };
  assert.equal(mountainHighlights(m, t)[0].key, "glacier");
});

test("REQ-data-1: a trail opens on a place-specific reason and says one water point in the singular", () => {
  const reasons = [
    { code: "dayOut", km: 9 }, { code: "waymarked", level: "nwn" },
    { code: "waterfall", name: "Cascade X" }, { code: "water", n: 1 },
  ];
  const out = trailReasons(reasons, t, 6, { ascent_m: 100, descent_m: 100, duration_min: 120 });
  assert.equal(out[0].code, "waterfall");
  assert.ok(out.some((r) => r.text === "s:trails.whyWaterOne:1"));
  assert.ok(trailReasons([{ code: "water", n: 3 }], t)[0].text === "s:trails.whyWater:3");
  // The limit still applies after the lead moves.
  assert.equal(trailReasons(reasons, t, 2, { ascent_m: 100, descent_m: 100 }).length, 2);
});

test("REQ-data-5: 800 m of climb is not a comfortable day, a grade above hard is not either", () => {
  assert.equal(isComfortableDay({ ascent_m: 799, descent_m: 700 }), true);
  assert.equal(isComfortableDay({ ascent_m: 800, descent_m: 700 }), false);
  assert.equal(isComfortableDay({ ascent_m: 300, descent_m: 300, f: { g: "very_hard" } }), false);
  assert.equal(isComfortableDay({ ascent_m: 300, descent_m: 300, f: { g: "hard" } }), true);
  assert.equal(isComfortableDay({ ascent_m: 300, descent_m: 300 }), true);
  assert.equal(notForLines("trail", {}, { ascent: 800 })[0].key, "notfor.trailClimb");
  assert.notEqual(notForLines("trail", {}, { ascent: 799 })[0].key, "notfor.trailClimb");
});

// The numbers are pipeline/not_for.py's: the Python file is the source.
const NOT_FOR_PY = join(here, "..", "..", "pipeline", "not_for.py");
test("REQ-data-5: the app's day-out numbers equal pipeline/not_for.py", { skip: !existsSync(NOT_FOR_PY) && "no pipeline tree" }, () => {
  const py = readFileSync(NOT_FOR_PY, "utf8");
  const read = (name) => {
    const m = py.match(new RegExp(`^${name}\\s*=\\s*([0-9_]+|"[a-z_]+")`, "m"));
    assert.ok(m, `${name} in not_for.py`);
    return m[1].startsWith('"') ? m[1].slice(1, -1) : Number(m[1].replace(/_/g, ""));
  };
  assert.equal(COMFORT_MAX_CLIMB_M, read("CLIMB_M"));
  assert.equal(TRAIL_CLIMB_M, read("CLIMB_M"));
  assert.equal(COMFORT_MAX_MIN, read("MINUTES"));
  assert.equal(COMFORT_MAX_GRADE, read("GRADE_MAX"));
  assert.equal(TRAIL_LONG_KM, read("LONG_KM"));
  assert.equal(TRAIL_ROAD_PCT, read("ROAD_PCT"));
  // The day band's top is where "long" starts: they never meet on one row.
  assert.equal(read("DAY_MAX_M"), TRAIL_LONG_KM * 1000);
});
