// T1136 (ROADMAP E1): the Ask eval gate. The labelled set's shape, the
// metric arithmetic on hand-made lists, the gate's rules, and on the real
// catalogue a seeded drop (labelled places taken out of the answers) must
// fail the gate against the blessed baseline. The full run with every
// retriever is .github/workflows/ask-eval.yml (node scripts/eval/ask-eval.mjs --check).
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { scoreList, groupRanks, gate, groundingChecks, summarise, TOLERANCE } from "../scripts/eval/ask-eval-lib.mjs";

const SET = JSON.parse(readFileSync(new URL("../scripts/eval/ask-set.json", import.meta.url), "utf8"));
const BASE = JSON.parse(readFileSync(new URL("../scripts/eval/ask-baseline.json", import.meta.url), "utf8"));
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const HAVE = existsSync(pub("app_data.json")) && existsSync(pub("search/guided.json")) && existsSync(pub("search_index.json"));

test("the eval set: 200 questions, 6 languages, 30 that Carta must not answer", () => {
  const ids = new Set(SET.cases.map((c) => c.id));
  assert.equal(ids.size, SET.cases.length, "case ids are unique");
  assert.ok(SET.cases.length >= 200, `only ${SET.cases.length} cases`);
  assert.ok(SET.cases.filter((c) => c.abstain).length >= 30);
  assert.deepEqual([...new Set(SET.cases.map((c) => c.lang))].sort(), ["de", "en", "es", "fr", "it", "nl"]);
  for (const c of SET.cases) {
    assert.ok(c.q && c.lang, c.id);
    if (c.abstain) assert.ok(!c.places, `${c.id} abstains and has places`);
    else assert.ok(c.facts?.type, `${c.id} has no facts.type`);
    for (const g of c.places || []) assert.ok(Array.isArray(g) && g.length, `${c.id}: a place is a group of ids`);
  }
  assert.ok(SET.cases.filter((c) => c.places).length >= 140, "at least 140 questions with labelled places");
  assert.equal(BASE.n, SET.cases.length, "the baseline was blessed on this set (run --bless after growing it)");
});

test("every labelled place is in the catalogue", { skip: !HAVE && "public/app_data.json not on this machine" }, () => {
  const data = JSON.parse(readFileSync(pub("app_data.json"), "utf8"));
  const missing = SET.cases.flatMap((c) => [...(c.places || []).flat(), ...(c.facts?.named || [])].filter((id) => !data.destinations[id]).map((id) => `${c.id}:${id}`));
  assert.deepEqual(missing, []);
});

test("metrics: recall, hit, MRR and nDCG on a hand-made list", () => {
  const groups = [["a"], ["b", "b2"], ["z"]];
  assert.deepEqual(groupRanks(["x", "b2", "a", "b"], groups), [2, 1, -1]);
  const s = scoreList(["x", "b2", "a", "y", "w", "v"], groups);
  assert.equal(s["recall@5"], 2 / 3);
  assert.equal(s["hit@5"], 1);
  assert.equal(s.mrr, 1 / 2);
  const dcg = 1 / Math.log2(3) + 1 / Math.log2(4);
  const ideal = 1 + 1 / Math.log2(3) + 1 / Math.log2(4);
  assert.ok(Math.abs(s["ndcg@10"] - dcg / ideal) < 1e-12);
  assert.deepEqual(scoreList([], groups), { "recall@5": 0, "hit@5": 0, "recall@10": 0, "hit@10": 0, mrr: 0, "ndcg@10": 0 });
  // A group counts once, however many of its ids the list holds.
  assert.equal(scoreList(["b", "b2"], [["b", "b2"]])["recall@5"], 1);
});

test("grounding checks read the labelled facts", () => {
  const answer = { type: "find", places: ["A", "B"], cards: [{ id: "A", cc: "IT" }, { id: "B", cc: "FR" }], months: [6], budget: null,
    filtersFail: [], noteText: "Lake Como, Italy; best months June", strings: ["Two places by a lake"] };
  const checks = groundingChecks({ type: "find", cc: "IT", month: 6, named: ["A"], notes: [["best months"], ["car-free"]] }, answer);
  const by = Object.fromEntries(checks.map(([k, ok]) => [k, ok]));
  assert.equal(by.type, true);
  assert.equal(by.cc, false, "B is in France");
  assert.equal(by.month, true);
  assert.equal(by["named:A"], true);
  assert.equal(by["note:best months"], true);
  assert.equal(by["note:car-free"], false);
  assert.equal(by.clean, true);
  const dashed = groundingChecks({}, { ...answer, strings: [`Rome ${String.fromCharCode(0x2014)} Florence`] });
  assert.equal(dashed.find(([k]) => k === "clean")[1], false);
});

function fakeSummary(r10, grounding = 0.99, abst = 0.95) {
  const results = [];
  return { ...summarise(results, []), n: 200, retrievers: { rules: { "recall@5": r10, "recall@10": r10, mrr: r10, "ndcg@10": r10, grounding } },
    abstain: { correct: abst }, bm25: "rebuilt" };
}

test("gate: a drop past the tolerance fails, within it passes, a missing retriever is skipped", () => {
  const base = fakeSummary(0.6);
  assert.equal(gate(fakeSummary(0.6 - TOLERANCE / 2), base).ok, true);
  const bad = gate(fakeSummary(0.6 - TOLERANCE * 2), base);
  assert.equal(bad.ok, false);
  assert.ok(bad.failures.some((f) => f.key === "rules.recall@10"));
  assert.equal(gate(fakeSummary(0.6, 0.9), base).ok, false, "grounding is gated");
  assert.equal(gate(fakeSummary(0.6, 0.99, 0.8), base).ok, false, "abstention is gated");
  assert.deepEqual(gate(fakeSummary(0.7), base).gains.map((g) => g.key).slice(0, 1), ["rules.recall@5"]);
  const withDense = { ...base, retrievers: { ...base.retrievers, dense: { "recall@10": 0.7, grounding: 0.99 } } };
  const g = gate(fakeSummary(0.6), withDense);
  assert.equal(g.ok, true);
  assert.ok(g.skipped.includes("dense.recall@10"));
  assert.equal(gate({ ...fakeSummary(0.6), n: 201 }, base).ok, false, "a grown set needs a new baseline");
});

test("gate on the real catalogue: a seeded drop fails", { skip: !HAVE && "public/app_data.json not on this machine" }, async () => {
  const { runEval } = await import("../scripts/eval/ask-eval.mjs");
  const { summary } = await runEval({ only: ["rules"], seedDrop: true });
  const g = gate(summary, BASE);
  console.log(`ask eval seeded drop: rules recall@10 ${BASE.retrievers.rules["recall@10"]} -> ${summary.retrievers.rules["recall@10"]}, ${g.failures.length} gated numbers fell`);
  assert.equal(g.ok, false);
  assert.ok(g.failures.some((f) => f.key === "rules.recall@10"));
});
