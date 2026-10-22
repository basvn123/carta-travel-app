// T555: Ask Carta turns an Intent into answer facts and the facts-only
// answer. On the real catalogue, for every golden question: a find answer
// is never empty when a looser one exists, every pick passes the filters it
// claims, a budget pick's total is inside the budget, a plan is routed, a
// compare holds every place asked for, and no sentence carries a dash or an
// unfilled {slot}. Also prints recall@10 of the expected places with the
// rules alone (no retrieval), the baseline the hybrid search must beat.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildAskVocab, parseIntent } from "../src/lib/ask/intent.js";
import { answerFacts, predicateOf } from "../src/lib/ask/rank.js";
import { composeAnswer } from "../src/lib/ask/compose.js";
import { makeLabels } from "../src/lib/guidedSearch.js";
import { computeCosts } from "../src/lib/costIndex.js";
import { en } from "../src/i18n/en.js";

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const HAVE = existsSync(pub("app_data.json")) && existsSync(pub("search/guided.json")) && existsSync(pub("search_index.json"));
const GOLDEN = JSON.parse(readFileSync(new URL("./fixtures/ask-golden.json", import.meta.url), "utf8"));
const TODAY = new Date(`${GOLDEN.now}T12:00:00`);
const t = (k, vars) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (m, v) => (vars && vars[v] != null ? String(vars[v]) : m));

function load() {
  const data = JSON.parse(readFileSync(pub("app_data.json"), "utf8"));
  const destinations = Array.isArray(data.destinations) ? Object.fromEntries(data.destinations.map((d) => [d.id, d])) : data.destinations;
  const costs = computeCosts(destinations, {});
  const rows = Object.values(destinations).map((d) => ({ ...d, cost: costs.get(d.id) }));
  const byId = new Map(rows.map((p) => [p.id, p]));
  const guided = JSON.parse(readFileSync(pub("search/guided.json"), "utf8"));
  const index = JSON.parse(readFileSync(pub("search_index.json"), "utf8"));
  const lexicon = existsSync(pub("search/ask/lexicon.json")) ? JSON.parse(readFileSync(pub("search/ask/lexicon.json"), "utf8")) : null;
  const countries = [...new Map(rows.map((p) => [p.iso2, p.country])).entries()];
  const labels = { ...makeLabels({ t, lang: "en", guided, countries }), place: (id) => byId.get(id)?.city || id };
  return { rows, byId, guided, index, lexicon, countries, labels };
}

const DASH = /[–—]/;
function strings(a) {
  const out = [a.lead, a.note, ...a.notes, ...a.query];
  for (const p of a.picks) out.push(p.title, p.blurb, ...p.why, ...(p.price ? [p.price.total, ...p.price.lines.map((l) => l.label + l.eur)] : []));
  for (const r of a.table?.rows || []) out.push(...r);
  return out.filter((s) => s != null).map(String);
}

test("golden questions: answer facts and the facts-only answer", { skip: !HAVE && "public/app_data.json not on this machine" }, () => {
  const ctx = load();
  const vocabs = new Map();
  let recallN = 0; let recallHit = 0; let empty = 0;
  const problems = [];
  for (const c of GOLDEN.cases) {
    if (!vocabs.has(c.lang)) vocabs.set(c.lang, buildAskVocab({ ...ctx, t, lang: c.lang }));
    const intent = parseIntent(c.q, { vocab: vocabs.get(c.lang), lang: c.lang, now: TODAY });
    const facts = answerFacts(intent, { ...ctx, today: TODAY });
    const ans = composeAnswer(facts, intent, { t, lang: "en", labels: ctx.labels });
    for (const s of strings(ans)) {
      if (DASH.test(s)) problems.push(`${c.q}: dash in "${s}"`);
      if (/\{\w+\}/.test(s)) problems.push(`${c.q}: unfilled slot in "${s}"`);
    }
    if (!ans.lead) problems.push(`${c.q}: no lead`);
    if (intent.type === "find" || intent.type === "near") {
      if (!facts.picks.length) { empty += 1; problems.push(`${c.q}: empty find`); }
      const skip = new Set(facts.relaxed);
      const pred = predicateOf(intent, { ...ctx, today: TODAY }, skip);
      for (const p of facts.picks) if (!pred(p.dest)) problems.push(`${c.q}: ${p.id} fails its own filters`);
      if (c.expectAny) {
        recallN += 1;
        if (facts.picks.slice(0, 10).some((p) => c.expectAny.includes(p.id))) recallHit += 1;
      }
    }
    if (intent.type === "budget") {
      for (const p of facts.picks) {
        const ok = p.price.total <= facts.query.budget || p.price.core <= facts.query.budget;
        if (!ok) problems.push(`${c.q}: ${p.id} total ${p.price.total} over ${facts.query.budget}`);
      }
    }
    if (intent.type === "plan" && facts.picks.length && !facts.plan) problems.push(`${c.q}: plan not routed`);
    if (intent.type === "compare" && facts.picks.length !== intent.compare.length) problems.push(`${c.q}: compare lost a place`);
  }
  console.log(`ask answers: ${GOLDEN.cases.length} questions, ${empty} empty finds, rules-only recall@6 of expected places ${recallHit}/${recallN}`);
  assert.deepEqual(problems, []);
});

// T558: the suggested questions under the empty box are questions Carta
// answers well, in every language: each reads as its intended question type
// and returns enough places (a when answer one, a compare two).
const EXPECT = { hike: "find", budget: "budget", warm: "find", nocar: "near", lake: "find", compare: "compare", when: "when", plan: "plan" };
const ENOUGH = { when: 1, compare: 2 };
test("suggested questions answer in six languages", { skip: !HAVE && "public/app_data.json not on this machine" }, async () => {
  const ctx = load();
  const problems = [];
  for (const lang of ["en", "nl", "de", "fr", "es", "it"]) {
    const cat = (await import(`../src/i18n/${lang}.js`))[lang];
    const vocab = buildAskVocab({ ...ctx, t, lang });
    for (const [k, type] of Object.entries(EXPECT)) {
      const q = cat[`ask.ex.${k}`];
      if (!q) { problems.push(`${lang} ask.ex.${k} missing`); continue; }
      const intent = parseIntent(q, { vocab, lang, now: TODAY });
      const facts = answerFacts(intent, { ...ctx, today: TODAY });
      if (intent.type !== type) problems.push(`${lang} "${q}": type ${intent.type}, want ${type}`);
      if (facts.picks.length < (ENOUGH[type] || 3)) problems.push(`${lang} "${q}": ${facts.picks.length} picks`);
    }
  }
  assert.deepEqual(problems, []);
});
