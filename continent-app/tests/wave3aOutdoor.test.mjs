// Logic wave 3a, outdoor row and trail page requests from the data program
// (REQ-data-4, REQ-data-6, REQ-data-7; ROADMAP D7, D24). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { outdoorRow, outdoorScore, outdoorRating, outdoorGradeKey } from "../src/lib/outdoorRow.js";
import { aroundCategories, AROUND_KINDS } from "../src/lib/destOverview.js";
import { SUITABILITY, tripSuitability, gradeStepOf } from "../src/lib/trailCards.js";

test("REQ-data-4: outdoorRow reads `o` first and falls back to the legacy keys", () => {
  const stamped = {
    o: { v5: { score: 8.4, band: "excellent", rank: 3 }, g: "hard", d: 3, up_m: 900, km: 31.2, min: 640, rt: "loop" },
    score: 5, difficulty: "easy", km_len: 10, ascent_m: 100, duration_min: 60,
  };
  assert.deepEqual(outdoorRow(stamped), {
    score: 8.4, band: "excellent", rank: 3, grade: "hard", days: 3, upM: 900, km: 31.2, minutes: 640, shape: "loop",
  });
  const legacy = { score: 7.1, difficulty: "moderate", km_len: 12, ascent_m: 300, descent_m: 310, dur: { min: 200 }, f: { rt: "point" } };
  assert.deepEqual(outdoorRow(legacy), {
    score: 7.1, band: null, rank: null, grade: "moderate", days: null, upM: 300, km: 12, minutes: 200, shape: "point",
  });
  // A key absent from `o` is unknown, never 0: a lake has no climb.
  assert.equal(outdoorRow({ o: { v5: { score: 6 } } }).upM, null);
  // A measured 0 stays.
  assert.equal(outdoorRow({ o: { up_m: 0 } }).upM, 0);
  assert.equal(outdoorScore({}), -1);
  assert.equal(outdoorGradeKey({ o: { g: "alpine" } }), "trails.gradeAlpine");
  assert.equal(outdoorGradeKey({ o: { g: "easy", d: 5 } }), "trails.gradeLong");
  assert.equal(outdoorRating({ o: { v5: { score: 8.4 } } }).score, 8.4);
  assert.equal(outdoorRating({ v5: { score: 6.2 } }).score, 6.2);
});

test("REQ-data-4: Around sorts on o.v5.score and no longer reads nearby trails or cycling", () => {
  const cats = aroundCategories({
    around: {
      trails: [
        { id: "a", km: 3, score: 9, o: { v5: { score: 6 } } },
        { id: "b", km: 4, score: 5, o: { v5: { score: 8 } } },
        { id: "c", km: 5 },
      ],
    },
    // join_nearby no longer writes these two; a stray one is not a reading.
    nearby: { trails: [{ id: "z", km: 1, o: { v5: { score: 10 } } }], cycling: [{ id: "y", km: 1 }] },
  });
  assert.deepEqual(cats[0].rows.map((r) => r.id), ["b", "a", "c"]);
  assert.equal(cats[1].count, 0);
  for (const kind of AROUND_KINDS.filter((k) => k.key === "walks" || k.key === "rides")) {
    assert.ok(!kind.from.some(([part]) => part === "nearby"));
  }
});

test("REQ-data-6: the suitability chip is allYear, and a file with only winter still answers it", () => {
  assert.ok(SUITABILITY.some((s) => s.key === "allYear"));
  assert.ok(!SUITABILITY.some((s) => s.key === "winter"));
  assert.ok(tripSuitability({ f: { sd: ["winter", "allYear"] } }).includes("allYear"));
  assert.ok(tripSuitability({ f: { sd: ["winter"] } }).includes("allYear"));
  assert.ok(!tripSuitability({ f: { sd: ["family"] } }).includes("allYear"));
});

test("REQ-data-7: T5 estimated needs a tag; a derived alpine is no step", () => {
  assert.deepEqual(gradeStepOf({ grade: "alpine", derived: true }), { step: 0, est: true });
  assert.deepEqual(gradeStepOf({ grade: "alpine", tagged: true }), { step: 5, est: false });
  assert.deepEqual(gradeStepOf({ grade: "very_hard", derived: true }), { step: 4, est: true });
  assert.deepEqual(gradeStepOf({ sacTag: 5, grade: "alpine", derived: true }), { step: 5, est: false });
  assert.deepEqual(gradeStepOf({}), { step: 0, est: true });
});

test("REQ-data-4: the three screens read an outdoor row through outdoorRow.js only", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const f of ["browse/NearPage.jsx", "browse/AroundHere.jsx", "lib/destOverview.js"]) {
    const src = readFileSync(join(here, "..", "src", f), "utf8");
    assert.ok(/outdoorRow\.js/.test(src), `${f} imports outdoorRow.js`);
    // No legacy sort, time, climb or grade read beside it.
    assert.ok(!/\.duration_min|\.dur\?\.min|\.score \?\?|v5\?\.score|trailClimbUp|gradeLabelKey/.test(src), `${f} reads a legacy key`);
  }
});
