// G1 (ROADMAP G4): the logic engines' golden harness. The gate passes on today's
// engines, a planted regression in a "current" case fails it, and the metrics
// are right. Run: node --test tests/logicGolden.test.mjs (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../scripts/eval/adapters/logic-engines.mjs";
import { validateResult } from "../scripts/eval/lib/results.mjs";
import { ENGINE_PATHS, SETS, loadSet, ndcgAtK, pAtK, runGolden, scoreCase, sliceTable } from "../scripts/eval/lib/logic-engines.mjs";

test("G1: P@k and nDCG@k", () => {
  const gains = { a: 1, b: 1, c: 1 };
  assert.equal(pAtK(["a", "x", "b", "y", "z"], gains, 5), 0.4);
  assert.equal(ndcgAtK(["a", "b", "c"], gains, 3), 1);
  assert.ok(ndcgAtK(["x", "y", "a"], gains, 3) < 0.5);
  assert.equal(ndcgAtK(["a"], {}, 3), 0);
});

test("G1: the sets have 15 to 50 cases each, every one with a source, kind and slices", () => {
  for (const name of Object.keys(SETS)) {
    const { cases } = loadSet(name);
    assert.ok(cases.length >= 15 && cases.length <= 50, `${name}: ${cases.length}`);
    for (const c of cases) {
      assert.ok(["current", "target"].includes(c.expect), `${name}/${c.id}: expect`);
      assert.ok(c.source && c.source.length > 10, `${name}/${c.id}: source`);
      for (const dim of ["country", "class", "persona"]) assert.ok(c.slices?.[dim], `${name}/${c.id}: slice ${dim}`);
    }
    assert.equal(new Set(cases.map((c) => c.id)).size, cases.length, `${name}: unique ids`);
  }
});

test("G1: the gate passes on today's engines and reports the target gap", async () => {
  const r = await run({});
  assert.deepEqual(validateResult(r), []);
  assert.equal(r.status, "pass", JSON.stringify(r.gate.failures));
  assert.ok(r.metrics.target_cases > 0 && r.metrics.target_pass < 1, "target cases fail today: that is the gap");
  assert.ok(Object.keys(r.metrics).some((k) => k.startsWith("slice.country.")));
  assert.ok(Object.keys(r.metrics).some((k) => k.startsWith("slice.persona.")));
  assert.match(r.notes.join(" "), /Worst slice/);
});

test("G1: a planted regression in a current case fails the gate", async () => {
  const old = ENGINE_PATHS.E5.old;
  ENGINE_PATHS.E5.old = () => false; // an engine that says "never fine"
  try {
    const r = await run({});
    assert.equal(r.status, "fail");
    assert.ok(r.gate.failures.some((f) => f.key.startsWith("month-fit.")));
  } finally {
    ENGINE_PATHS.E5.old = old;
  }
});

test("G1: the ranking order case fails on file order and passes on fame order", () => {
  const c = loadSet("rank").cases.find((x) => x.id === "tie-9.6-by-fame");
  assert.equal(c.expect, "target");
  assert.equal(scoreCase("rank", c, ENGINE_PATHS.E6.old).pass, false);
  assert.equal(scoreCase("rank", c, () => c.order).pass, true);
});

test("G1: slices count current and target cases apart", () => {
  const t = sliceTable(runGolden({}));
  const ski = t.find((s) => s.dim === "persona" && s.value === "ski");
  assert.ok(ski && ski.current + ski.target > 0);
});

test("G7: the shadow diff of the no-op engine shows no change, and a real engine without a new path says so", async () => {
  const { shadowDiff, toMarkdown } = await import("../scripts/eval/shadow-diff.mjs");
  const rows = shadowDiff("noop");
  assert.equal(rows.length, 12);
  assert.ok(rows.every((r) => r.same));
  assert.match(toMarkdown("noop", rows), /0 of 12 personas see a different answer/);
  assert.throws(() => shadowDiff("E6"), /no new path yet/);
  // A planted new path that reverses the order shows up as changed.
  const { ENGINE_PATHS } = await import("../scripts/eval/lib/logic-engines.mjs");
  ENGINE_PATHS.E6.new = (pool, taste, month) => ENGINE_PATHS.E6.old(pool, taste, month).reverse();
  try {
    assert.ok(shadowDiff("E6").every((r) => !r.same));
  } finally {
    ENGINE_PATHS.E6.new = null;
  }
});
