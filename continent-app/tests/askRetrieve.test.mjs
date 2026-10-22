// T554: Ask Carta's hybrid retrieval. Reciprocal rank fusion, lexicon slots,
// the /api/ask Function on this tree's own built files (no network), and the
// measured gain: recall@10 of the expected places on the guided search's
// GOLDEN set (pipeline/guided_search_layer.py, 20 questions, typed as a
// traveller would type them) with the rules alone and with the hybrid
// search. The hybrid must never do worse than the rules.
// Run: npm test (continent-app/). Skips the data blocks without the files.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { rrf, slotsFrom, makeRetriever } from "../src/lib/ask/retrieve.js";
import { onRequestGet } from "../functions/api/ask.js";

test("rrf: a place high in either list ranks high", () => {
  assert.deepEqual(rrf([["a", "b", "c"], ["c", "a", "d"]]), ["a", "c", "b", "d"]);
  assert.deepEqual(rrf([]), []);
});

test("lexicon slots fill only what the question left empty", () => {
  const intent = { facets: { vibe: "beach" } };
  assert.deepEqual(slotsFrom([["chilled", "vibe", "quiet", 0.8], ["uncrowded", "extra", "quiet", 0.7], ["cheaper", "sort", "cost", 0.7]], intent),
    { quiet: true, sort: "cost" });
});

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const HAVE_ASK = existsSync(pub("search/ask/manifest.json")) && existsSync(pub("search/ask/model/emb.i8"));
const env = {
  ASSETS: {
    fetch: async (url) => {
      const path = new URL(url).pathname;
      const file = pub(path.slice(1));
      if (!existsSync(file)) return new Response(null, { status: 404 });
      return new Response(readFileSync(file));
    },
  },
};
const call = (qs) => onRequestGet({ request: new Request(`https://carta.test/api/ask?${qs}`), env });

test("/api/ask: filtered dense hits and lexicon matches", { skip: !HAVE_ASK && "ask index not built here" }, async () => {
  assert.equal((await call("q=")).status, 400);
  const res = await call(new URLSearchParams({ q: "lake village in austria", src: "dest,highlight", cc: "AT", u: "chilled" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.hits.dest.length > 10);
  const data = JSON.parse(readFileSync(pub("app_data.json"), "utf8"));
  for (const [, destId] of body.hits.dest) assert.equal(data.destinations[destId]?.iso2, "AT");
  assert.ok(body.hits.highlight.every((h) => typeof h[3] === "string"));
  console.log(`api/ask: "chilled" -> ${JSON.stringify(body.lex)}`);
});

// ---- The measured gain on GOLDEN -------------------------------------------

const VIBE_WORD = { lake: "lake", mountain: "mountain village", hiking: "hiking", oldtown: "old town", castles: "castles",
  island: "island", beach: "beach", food: "food and wine", nightlife: "nightlife", spa: "thermal spa", art: "art and museums",
  views: "scenic views", quiet: "quiet", romantic: "romantic" };
const GOLDEN = [
  ["lake", "AT", null, ["Hallstatt", "Zell am See", "St. Wolfgang im Salzkammergut", "Bregenz"]],
  ["lake", "IT", null, ["Bellagio", "Varenna", "Como", "Sirmione", "Riva del Garda", "Stresa"]],
  ["mountain", "CH", null, ["Zermatt", "Grindelwald", "Wengen", "Lauterbrunnen", "St. Moritz"]],
  ["hiking", null, "dolomites", ["Cortina d'Ampezzo", "Ortisei", "Canazei", "Selva di Val Gardena"]],
  ["oldtown", "HR", null, ["Dubrovnik", "Split", "Rovinj", "Trogir", "Korčula"]],
  ["oldtown", "CZ", null, ["Český Krumlov", "Prague", "Telč", "Kutná Hora"]],
  ["castles", "DE", null, ["Füssen", "Heidelberg", "Cochem", "Schwangau"]],
  ["island", "GR", null, ["Santorini", "Naxos", "Paros", "Mykonos", "Milos", "Corfu"]],
  ["beach", "PT", null, ["Lagos", "Albufeira", "Tavira", "Carvoeiro"]],
  ["food", "IT", null, ["Bologna", "Parma", "Modena", "Florence", "Naples"]],
  ["nightlife", "ES", null, ["Ibiza", "Barcelona", "Madrid", "Valencia"]],
  ["spa", null, null, ["Budapest", "Baden-Baden", "Karlovy Vary", "Bath"]],
  ["art", "NL", null, ["Amsterdam", "The Hague", "Rotterdam"]],
  ["hiking", null, "highlands", ["Fort William", "Aviemore", "Glencoe"]],
  ["views", "NO", null, ["Flåm", "Geiranger", "Bergen", "Ålesund"]],
  ["beach", null, "sardinia", ["Alghero", "Villasimius", "Cala Gonone", "Olbia"]],
  ["island", "HR", null, ["Hvar", "Korčula", "Vis", "Brač"]],
  ["quiet", null, "alps", ["Hallstatt", "Alpbach", "Mürren", "Gimmelwald", "Bled"]],
  ["romantic", "FR", null, ["Annecy", "Colmar", "Paris", "Saint-Paul-de-Vence"]],
  ["hiking", null, "pyrenees", ["Torla", "Benasque", "Cauterets", "Gavarnie"]],
];
const HAVE_DATA = HAVE_ASK && existsSync(pub("app_data.json")) && existsSync(pub("search/guided.json")) && existsSync(pub("search_index.json"));

test("recall@10 on GOLDEN: rules alone, then hybrid", { skip: !HAVE_DATA && "catalogue or ask index not here" }, async () => {
  const { buildAskVocab, parseIntent } = await import("../src/lib/ask/intent.js");
  const { findFacts } = await import("../src/lib/ask/rank.js");
  const { computeCosts } = await import("../src/lib/costIndex.js");
  const { foldName } = await import("../src/lib/searchIndex.js");
  const MiniSearch = (await import("minisearch")).default;
  const { ASK_BM25_OPTIONS } = await import("../functions/_lib/askTerms.js");
  const data = JSON.parse(readFileSync(pub("app_data.json"), "utf8"));
  const costs = computeCosts(data.destinations, {});
  const rows = Object.values(data.destinations).map((d) => ({ ...d, cost: costs.get(d.id) }));
  const byId = new Map(rows.map((p) => [p.id, p]));
  const guided = JSON.parse(readFileSync(pub("search/guided.json"), "utf8"));
  const index = JSON.parse(readFileSync(pub("search_index.json"), "utf8"));
  const lexicon = JSON.parse(readFileSync(pub("search/ask/lexicon.json"), "utf8"));
  const countries = [...new Map(rows.map((p) => [p.iso2, p.country])).entries()];
  const t = (k) => k;
  const vocab = buildAskVocab({ rows, guided, index, lexicon, countries, t, lang: "en" });
  const region = new Intl.DisplayNames(["en"], { type: "region" });
  const areaLabel = new Map(guided.areas.map((a) => [a.id, a.label.en]));
  const bm25 = MiniSearch.loadJSON(readFileSync(pub("search/ask/bm25.json"), "utf8"), ASK_BM25_OPTIONS);
  const retrieve = makeRetriever({
    bm25: () => bm25,
    fetchImpl: (url) => onRequestGet({ request: new Request(`https://carta.test${url}`), env }),
  });
  const now = new Date("2026-10-22T12:00:00");
  let rules = 0; let hybrid = 0; let total = 0;
  for (const [vibe, cc, area, names] of GOLDEN) {
    const q = `${VIBE_WORD[vibe]} in ${cc ? region.of(cc) : area ? `the ${areaLabel.get(area)}` : "Europe"}`;
    const intent = parseIntent(q, { vocab, lang: "en", now });
    const want = new Set(names.map(foldName));
    const hit = (picks) => picks.filter((p) => want.has(foldName(p.dest.city)) || [...want].some((w) => foldName(p.dest.city).startsWith(w))).length;
    const base = findFacts(intent, { rows, byId, guided, today: now }, 10);
    const found = await retrieve(intent, q);
    const both = findFacts(intent, { rows, byId, guided, today: now, retrieved: found.retrieved }, 10);
    rules += Math.min(hit(base.picks), names.length); hybrid += Math.min(hit(both.picks), names.length); total += names.length;
  }
  console.log(`ask recall@10 on GOLDEN: rules ${rules}/${total} = ${(rules / total).toFixed(3)}, hybrid ${hybrid}/${total} = ${(hybrid / total).toFixed(3)}`);
  assert.ok(total >= 70);
  assert.ok(hybrid >= rules, `hybrid ${hybrid} below rules ${rules}`);
});
