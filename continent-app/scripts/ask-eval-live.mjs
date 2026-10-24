// Ask Carta live eval (T563): the golden questions' packs, written by a real
// model through /api/ask/answer, checked by verify.js. Not part of npm test:
// it calls a model (Workers AI on the owner's account, about 15 Neurons a
// question). Run against a local `wrangler pages dev` (see the T563 report)
// or a preview deploy:
//
//   node scripts/ask-eval-live.mjs --endpoint http://localhost:8799 [--limit 40] [--out file.json]
//
// It builds each pack exactly as the app does (Intent, hybrid retrieval with
// this tree's own index, facts, the facts answer, the pack), so what the
// model sees is what a traveller's question would send. Prints the share of
// sentences the check keeps and why the rest fail, withdrawn answers, and
// time to the first piece and to the end; writes every answer to --out for
// a reading review.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildAskVocab, parseIntent } from "../src/lib/ask/intent.js";
import { answerFacts } from "../src/lib/ask/rank.js";
import { composeAnswer } from "../src/lib/ask/compose.js";
import { buildPack, wirePack } from "../src/lib/ask/context.js";
import { verifyAnswer, cleanModelText } from "../src/lib/ask/verify.js";
import { makeRetriever } from "../src/lib/ask/retrieve.js";
import { makeLabels } from "../src/lib/guidedSearch.js";
import { priceDays, DEFAULT_PRICE_REQUEST } from "../src/lib/price/index.js";
import { onRequestGet } from "../functions/api/ask.js";
import MiniSearch from "minisearch";
import { ASK_BM25_OPTIONS } from "../functions/_lib/askTerms.js";

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const ENDPOINT = arg("--endpoint", "http://localhost:8799");
const LIMIT = Number(arg("--limit", "0")) || Infinity;
const OUT = arg("--out", null);
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const J = (p) => JSON.parse(readFileSync(pub(p), "utf8"));

const data = J("app_data.json");
const costs = priceDays(data.destinations, DEFAULT_PRICE_REQUEST);
const rows = Object.values(data.destinations).map((d) => ({ ...d, cost: costs.get(d.id) }));
const byId = new Map(rows.map((p) => [p.id, p]));
const guided = J("search/guided.json");
const index = J("search_index.json");
const lexicon = J("search/ask/lexicon.json");
const countries = [...new Map(rows.map((p) => [p.iso2, p.country])).entries()];
const knownPlaces = rows.map((p) => p.city);
const catalogs = {};
for (const lang of ["en", "nl", "de", "fr", "es", "it"]) catalogs[lang] = (await import(`../src/i18n/${lang}.js`))[lang];
const tFor = (lang) => (k, v) => String(catalogs[lang][k] ?? catalogs.en[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? String(v[x]) : m));

const env = { ASSETS: { fetch: async (url) => {
  const file = pub(new URL(url).pathname.slice(1));
  return existsSync(file) ? new Response(readFileSync(file)) : new Response(null, { status: 404 });
} } };
const bm25 = existsSync(pub("search/ask/bm25.json")) ? MiniSearch.loadJSON(readFileSync(pub("search/ask/bm25.json"), "utf8"), ASK_BM25_OPTIONS) : null;
const retrieve = makeRetriever({ bm25: () => bm25, fetchImpl: (url) => onRequestGet({ request: new Request(`https://carta.test${url}`), env }) });

async function write(pack, i) {
  const t0 = Date.now();
  let first = null;
  const res = await fetch(`${ENDPOINT}/api/ask/answer`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": `10.9.${Math.floor(i / 250)}.${i % 250}` },
    body: JSON.stringify(wirePack(pack)),
  });
  if (!res.ok) return { status: res.status, error: (await res.text()).slice(0, 200), ms: Date.now() - t0 };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = ""; let text = ""; let meta = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (first == null) first = Date.now() - t0;
    buf += dec.decode(value, { stream: true });
    const events = buf.split("\n\n"); buf = events.pop();
    for (const ev of events) {
      const line = ev.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      if (ev.startsWith("event: done")) { meta = JSON.parse(line.slice(5)); continue; }
      try { const t = JSON.parse(line.slice(5)).t; if (t != null) text += String(t); } catch { /* torn */ }
    }
  }
  return { status: 200, text, first, ms: Date.now() - t0, meta };
}

const golden = JSON.parse(readFileSync(new URL("../tests/fixtures/ask-golden.json", import.meta.url), "utf8"));
const now = new Date(`${golden.now}T12:00:00`);
const vocabs = new Map();
const results = [];
const tally = { questions: 0, answered: 0, sentences: 0, kept: 0, withdrawn: 0, failedBy: {}, errors: 0, firstMs: [], ms: [] };
for (const [i, c] of golden.cases.entries()) {
  if (i >= LIMIT) break;
  const t = tFor(c.lang);
  if (!vocabs.has(c.lang)) vocabs.set(c.lang, buildAskVocab({ rows, guided, index, lexicon, countries, t, lang: c.lang }));
  const labels = { ...makeLabels({ t, lang: c.lang, guided, countries }), place: (id) => byId.get(id)?.city || id };
  const intent = parseIntent(c.q, { vocab: vocabs.get(c.lang), lang: c.lang, now });
  const found = await retrieve(intent, c.q);
  const facts = answerFacts(intent, { rows, byId, guided, today: now, retrieved: found?.retrieved || null });
  const answer = composeAnswer(facts, intent, { t, lang: c.lang, labels });
  if (!facts.picks.length) continue;
  const pack = buildPack({ question: c.q, lang: c.lang, facts, answer, passages: found?.passages || [],
    labels: { monthsText: (d) => (d.climate?.best || []).map(labels.month).join(", "), estWord: t("money.est") } });
  tally.questions += 1;
  const out = await write(pack, i);
  if (out.status !== 200) { tally.errors += 1; results.push({ q: c.q, lang: c.lang, ...out }); console.log(`${i} ${c.lang} ${out.status} ${out.error}`); continue; }
  const v = verifyAnswer(out.text, pack, knownPlaces);
  tally.answered += 1; tally.sentences += v.total; tally.kept += v.kept.length;
  if (v.withdrawn) tally.withdrawn += 1;
  for (const f of v.failed) { const k = f.why[0].split(":")[0]; tally.failedBy[k] = (tally.failedBy[k] || 0) + 1; }
  tally.firstMs.push(out.first); tally.ms.push(out.ms);
  results.push({ q: c.q, lang: c.lang, type: intent.type, notes: pack.notes.map((n) => n.text), raw: cleanModelText(out.text).trim(),
    kept: v.kept.map((s) => ({ text: s.text, cites: s.cites })), failed: v.failed.map((s) => ({ text: s.text, why: s.why })), withdrawn: v.withdrawn, ms: out.ms, first: out.first, cached: out.meta?.cached });
  console.log(`${i} ${c.lang} ${intent.type}: ${v.kept.length}/${v.total} kept${v.withdrawn ? " WITHDRAWN" : ""} ${out.ms} ms`);
}
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "n/a");
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : null; };
const summary = {
  questions: tally.questions, answered: tally.answered, errors: tally.errors,
  sentences: tally.sentences, kept: tally.kept, keptShare: pct(tally.kept, tally.sentences),
  withdrawn: tally.withdrawn, withdrawnShare: pct(tally.withdrawn, tally.answered), failedBy: tally.failedBy,
  firstPieceMs: { median: med(tally.firstMs), p95: p95(tally.firstMs) }, totalMs: { median: med(tally.ms), p95: p95(tally.ms) },
};
console.log(JSON.stringify(summary, null, 1));
if (OUT) writeFileSync(OUT, JSON.stringify({ summary, results }, null, 1));
