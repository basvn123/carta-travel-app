// T1141 (ROADMAP E2): the BM25 query in English, the server BM25 sources,
// the country filter on the browser's hits, and the fusion of the rules
// order with the retrieved order. The scores live in the eval gate
// (scripts/eval/ask-eval.mjs); these pin the behaviour behind them.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import MiniSearch from "minisearch";
import { bm25Query } from "../src/lib/ask/query.js";
import { makeRetriever } from "../src/lib/ask/retrieve.js";
import { localRanks, findFacts, REL } from "../src/lib/ask/rank.js";
import { ASK_BM25_OPTIONS, bm25Doc } from "../functions/_lib/askTerms.js";
import { sparseSearch, loadSparse, SPARSE_SOURCES } from "../functions/_lib/askSparse.js";

const words = (s) => s.split(" ");

test("bm25Query: other languages get the English words, stop words and months go", () => {
  const q = words(bm25Query({ facets: { vibe: "hiking", area: "alps", month: 7 } }, "wandelen in de alpen in juli"));
  assert.ok(q.includes("hiking") && q.includes("alps"));
  for (const w of ["in", "de", "juli"]) assert.ok(!q.includes(w), w);
  const castles = words(bm25Query({ facets: { vibe: "castles", country: "DE" } }, "kastelen in duitsland"));
  assert.ok(castles.includes("castle") && castles.includes("germany"));
  // An Italian phrase reaches English through the guided vocabulary.
  assert.ok(words(bm25Query({ facets: {} }, "centro storico senza auto")).includes("historic"));
});

test("bm25Query: a word that is also a vibe word stays (Bergen is a city)", () => {
  assert.ok(words(bm25Query({ facets: {} }, "when to go to bergen")).includes("bergen"));
  assert.equal(bm25Query({ facets: {} }, "when is it"), "");
});

const rows = [
  ["lake:a", "IT1", "Lago A, a quiet lake in Italy.", { cc: "IT", name: "Lago A", tags: ["lake"] }],
  ["lake:b", "AT1", "See B, a lake in Austria.", { cc: "AT", name: "See B", tags: ["lake"] }],
  ["lake:c", "IT2", "Lago C, a lake by a village.", { cc: "IT", name: "Lago C", tags: ["lake"] }],
];
const built = () => {
  const ms = new MiniSearch(ASK_BM25_OPTIONS);
  ms.addAll(rows.map(bm25Doc));
  return loadSparse(JSON.stringify(ms));
};

test("sparseSearch: the row shape of /api/ask, filtered by country and place, k kept", () => {
  const index = built();
  const all = sparseSearch(index, rows, "lake", { k: 10 });
  assert.equal(all.length, 3);
  assert.deepEqual(all[0].length, 5);
  assert.deepEqual(sparseSearch(index, rows, "lake", { k: 10, cc: new Set(["AT"]) }).map((r) => r[1]), ["AT1"]);
  assert.deepEqual(sparseSearch(index, rows, "lake", { k: 10, d: new Set(["IT2"]) }).map((r) => r[0]), ["lake:c"]);
  assert.equal(sparseSearch(index, rows, "lake", { k: 1 }).length, 1);
  assert.deepEqual(sparseSearch(index, rows, "", { k: 3 }), []);
  assert.deepEqual([...SPARSE_SOURCES], ["beach", "lake", "peak"]);
});

test("retrieve: the BM25 words go to /api/ask, server sparse hits fuse in, the browser keeps the country asked", async () => {
  const dest = [
    ["dest:IT1", "IT1", "Lago town, Italy. A quiet lake.", { cc: "IT", name: "Lago town", tags: ["lake"] }],
    ["dest:AT1", "AT1", "See town, Austria. A lake.", { cc: "AT", name: "See town", tags: ["lake"] }],
  ];
  const ms = new MiniSearch(ASK_BM25_OPTIONS);
  ms.addAll(dest.map(bm25Doc));
  let asked = null;
  const fetchImpl = async (url) => {
    asked = new URL(url, "https://carta.test");
    return new Response(JSON.stringify({ hits: {}, sparse: { lake: [["lake:c", "IT2", 1.2, "Lago C.", "Lago C"]] }, lex: [] }));
  };
  const retrieve = makeRetriever({ bm25: () => ms, fetchImpl });
  const out = await retrieve({ type: "find", facets: { vibe: "lake", country: "IT" }, places: [], compare: [] }, "lago tranquillo in italia");
  assert.ok(asked.searchParams.get("b").includes("lake"));
  assert.ok(out.retrieved.has("IT1") && out.retrieved.has("IT2"));
  assert.ok(!out.retrieved.has("AT1"), "the browser hit outside the country is dropped");
  assert.deepEqual(out.passages.map((p) => p.pid), ["lake:c"]);
});

test("fusion: the retrieved order counts among the candidates, by reciprocal rank", () => {
  const cands = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const retrieved = new Map([["z", { rank: 0 }], ["c", { rank: 5 }], ["b", { rank: 9 }]]);
  assert.deepEqual([...localRanks(cands, retrieved)], [["c", 0], ["b", 1]]);
  assert.equal(REL.mode, "rrf");

  const place = (id, score) => ({ id, city: id, iso2: "XX", lat: 40 + Number(id.slice(1)), lon: 10, rating: { score } });
  const rowsOf = [place("p1", 9), place("p2", 8), place("p3", 7)];
  const ctx = { rows: rowsOf, byId: new Map(rowsOf.map((p) => [p.id, p])), guided: { d: {} }, today: new Date("2026-11-06T12:00:00") };
  const intent = { type: "find", facets: {}, budget: {}, places: [], compare: [] };
  const plain = findFacts(intent, ctx, 3).picks.map((p) => p.id);
  const fused = findFacts(intent, { ...ctx, retrieved: new Map([["p3", { rank: 0, pids: [] }]]) }, 3).picks.map((p) => p.id);
  assert.equal(plain.length, 3);
  assert.ok(fused.indexOf("p3") < plain.indexOf("p3"), "a retrieved place moves up");
});
