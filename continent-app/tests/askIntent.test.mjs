// T550 + T553: Ask Carta reads a question into one Intent. The golden set
// (tests/fixtures/ask-golden.json, 6 languages, 7 question types) is the
// gate: the question type must be right for at least 92% of cases and the
// named slots for at least 90%, over at least 140 cases (a gate on an empty
// set passes nothing). Runs on the real catalogue where it is on the machine.
// Run: npm test (continent-app/). ASK_EVAL_VERBOSE=1 prints every miss.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildAskVocab, parseIntent, tokenize } from "../src/lib/ask/intent.js";

const GOLDEN = JSON.parse(readFileSync(new URL("./fixtures/ask-golden.json", import.meta.url), "utf8"));
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const HAVE = existsSync(pub("app_data.json")) && existsSync(pub("search/guided.json")) && existsSync(pub("search_index.json"));

function loadCtx() {
  const data = JSON.parse(readFileSync(pub("app_data.json"), "utf8"));
  const rows = Array.isArray(data.destinations) ? data.destinations : Object.values(data.destinations);
  const guided = JSON.parse(readFileSync(pub("search/guided.json"), "utf8"));
  const index = JSON.parse(readFileSync(pub("search_index.json"), "utf8"));
  const lexicon = existsSync(pub("search/ask/lexicon.json")) ? JSON.parse(readFileSync(pub("search/ask/lexicon.json"), "utf8")) : null;
  const countries = [...new Map(rows.map((p) => [p.iso2, p.country])).entries()];
  return { rows, guided, index, lexicon, countries, t: (k) => k };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && same([...a].sort(), [...b].sort());

/** Score one case: the type, then each named key of facets, budget, places, compare, monthRange. */
export function scoreCase(c, got) {
  const checks = [];
  checks.push(["type", c.type, got.type, got.type === c.type]);
  for (const [k, v] of Object.entries(c.facets || {})) {
    const g = got.facets[k];
    checks.push([`facets.${k}`, v, g, Array.isArray(v) ? sameSet(v, g) : g === v]);
  }
  for (const [k, v] of Object.entries(c.budget || {})) checks.push([`budget.${k}`, v, got.budget[k], got.budget[k] === v]);
  if (c.places) checks.push(["places", c.places, got.places, sameSet(c.places, got.places)]);
  if (c.compare) checks.push(["compare", c.compare, got.compare, sameSet(c.compare, got.compare)]);
  if (c.monthRange) checks.push(["monthRange", c.monthRange, got.monthRange, same(c.monthRange, got.monthRange)]);
  return checks;
}

test("tokenize keeps 1,500 and 1.500 whole and caps the length", () => {
  assert.deepEqual(tokenize("€1,500 for two"), [`${String.fromCharCode(0x20ac)}1500`, "for", "two"]);
  assert.deepEqual(tokenize("1.500 euro"), ["1500", "euro"]);
  assert.equal(tokenize("a ".repeat(300)).length, 100);
});

function evalSet(set, ctx) {
  const now = new Date(`${set.now}T12:00:00`);
  const vocabs = new Map();
  let typeOk = 0; let slots = 0; let slotOk = 0;
  const misses = [];
  const byType = {};
  for (const c of set.cases) {
    if (!vocabs.has(c.lang)) vocabs.set(c.lang, buildAskVocab({ ...ctx, lang: c.lang }));
    const got = parseIntent(c.q, { vocab: vocabs.get(c.lang), lang: c.lang, now });
    const checks = scoreCase(c, got);
    const t = (byType[c.type] ||= { n: 0, ok: 0 });
    t.n += 1;
    if (checks[0][3]) { typeOk += 1; t.ok += 1; }
    for (const ch of checks.slice(1)) { slots += 1; if (ch[3]) slotOk += 1; }
    const bad = checks.filter((ch) => !ch[3]);
    if (bad.length) misses.push(`${c.lang} "${c.q}": ${bad.map(([k, want, have]) => `${k} want ${JSON.stringify(want)} got ${JSON.stringify(have)}`).join("; ")}`);
  }
  const n = set.cases.length;
  const typeAcc = typeOk / n; const slotAcc = slotOk / slots;
  const summary = `type ${(typeAcc * 100).toFixed(1)}% (${typeOk}/${n}), slots ${(slotAcc * 100).toFixed(1)}% (${slotOk}/${slots}), by type ${Object.entries(byType).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(" ")}`;
  return { n, slots, typeAcc, slotAcc, summary, misses };
}

let CTX = null;
const ctx = () => (CTX ||= loadCtx());

test("golden set: question type and slots", { skip: !HAVE && "public/app_data.json not on this machine" }, () => {
  const r = evalSet(GOLDEN, ctx());
  console.log(`ask golden: ${r.summary}`);
  if (process.env.ASK_EVAL_VERBOSE || r.typeAcc < 0.92 || r.slotAcc < 0.9) console.log(r.misses.join("\n"));
  assert.ok(r.n >= 140, `golden set too small: ${r.n}`);
  assert.ok(r.slots >= 250, `too few slot checks: ${r.slots}`);
  assert.ok(r.typeAcc >= 0.92, `type accuracy ${r.summary}`);
  assert.ok(r.slotAcc >= 0.9, `slot accuracy ${r.summary}`);
});

// Never tuned against (see its "about"): the honest number, with a lower bar.
const HELDOUT = JSON.parse(readFileSync(new URL("./fixtures/ask-heldout.json", import.meta.url), "utf8"));
test("held-out set: question type and slots", { skip: !HAVE && "public/app_data.json not on this machine" }, () => {
  const r = evalSet(HELDOUT, ctx());
  console.log(`ask held-out: ${r.summary}`);
  if (process.env.ASK_EVAL_VERBOSE || r.typeAcc < 0.85 || r.slotAcc < 0.8) console.log(r.misses.join("\n"));
  assert.ok(r.n >= 50, `held-out set too small: ${r.n}`);
  assert.ok(r.typeAcc >= 0.85, `type accuracy ${r.summary}`);
  assert.ok(r.slotAcc >= 0.8, `slot accuracy ${r.summary}`);
});
