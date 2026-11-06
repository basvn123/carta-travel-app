#!/usr/bin/env node
/*
 * Ask eval gate (T1136, ROADMAP E1): the runner. Every question of
 * scripts/eval/ask-set.json goes through the real Ask code (parseIntent,
 * retrieve.js, answerFacts, composeAnswer, buildPack) once per retriever,
 * on the shipped catalogue, and is scored: recall@5 and @10, MRR and
 * nDCG@10 of the cards against the labelled places, the same for the
 * retriever's own list, the grounding checks (scripts/eval/ask-eval-lib.mjs)
 * and whether Carta says it does not know when it should.
 *
 * Deterministic and free: no model writes anything, no key, no network.
 * Retrievers:
 *   rules   no retrieval, the facets alone (always)
 *   bm25    retrieve.js with the sparse half only. Uses
 *           public/search/ask/bm25.json when the deploy has it, else a dest
 *           index rebuilt here from app_data.json and the dossiers, as
 *           pipeline/ask_index_layer.py src_dest writes it (CI: "rebuilt")
 *   dense   retrieve.js with /api/ask run in process on this tree's built
 *           index (public/search/ask/manifest.json); skipped where it is
 *           not built, which includes CI (the index is not in git)
 *   hybrid  both halves, as the app runs them; skipped with dense
 * The live model part (a real written answer through /api/ask/answer,
 * checked by verify.js) is scripts/ask-eval-live.mjs: optional, paid, never
 * in CI.
 *
 *   node scripts/eval/ask-eval.mjs [--only rules,bm25] [--out run.json]
 *        [--check scripts/eval/ask-baseline.json] [--bless] [--seed-drop] [--verbose]
 *        [--dump g045,g056]   (print the notes the model would get, for labelling)
 *
 *   --out        where the score of this run is written (default: the
 *                system temp folder, carta-ask-eval/run-<time>.json)
 *   --check      fail (exit 1) when a gated number fell past the tolerance
 *   --bless      write this run's summary as the new baseline
 *   --seed-drop  take the first labelled place of every second labelled
 *                question out of the catalogue: a known regression, so the
 *                gate can be seen to fail (tests/askEval.test.mjs, CI)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import MiniSearch from 'minisearch';
import { buildAskVocab, parseIntent, intentIsEmpty } from '../../src/lib/ask/intent.js';
import { answerFacts, predicateOf, monthsOf } from '../../src/lib/ask/rank.js';
import { composeAnswer, unknownNote } from '../../src/lib/ask/compose.js';
import { buildPack } from '../../src/lib/ask/context.js';
import { makeRetriever } from '../../src/lib/ask/retrieve.js';
import { outsidePlace } from '../../src/lib/ask/outside.js';
import { makeLabels } from '../../src/lib/guidedSearch.js';
import { priceDays, DEFAULT_PRICE_REQUEST } from '../../src/lib/price/index.js';
import { ASK_BM25_OPTIONS, bm25Doc } from '../../functions/_lib/askTerms.js';
import { scoreList, groundingChecks, summarise, gate, TOLERANCE } from './ask-eval-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '../..');
const pub = (p) => join(app, 'public', p);
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const arg = (n, fallback = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback; };

export const SET_PATH = join(here, 'ask-set.json');
export const BASELINE_PATH = join(here, 'ask-baseline.json');
const CARDS = 10; // cards scored per answer (the app shows 6, "more" opens the rest)
const SHOWN = 6;

// ---- The catalogue, as the app loads it ------------------------------------

function loadCatalogue() {
  const data = J(pub('app_data.json'));
  const destinations = Array.isArray(data.destinations) ? Object.fromEntries(data.destinations.map((d) => [d.id, d])) : data.destinations;
  const costs = priceDays(destinations, DEFAULT_PRICE_REQUEST);
  const rows = Object.values(destinations).map((d) => ({ ...d, cost: costs.get(d.id) }));
  const guided = J(pub('search/guided.json'));
  const index = J(pub('search_index.json'));
  const lexicon = existsSync(pub('search/ask/lexicon.json')) ? J(pub('search/ask/lexicon.json')) : null;
  const countries = [...new Map(rows.map((p) => [p.iso2, p.country])).entries()];
  return { rows, guided, index, lexicon, countries };
}

async function catalogs() {
  const out = {};
  for (const lang of ['en', 'nl', 'de', 'fr', 'es', 'it']) out[lang] = (await import(`../../src/i18n/${lang}.js`))[lang];
  return out;
}

// ---- The sparse index -------------------------------------------------------

const CAT_WORDS = { 'national-park': 'national parks', unesco: 'World Heritage' };
const niceList = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const dossierBase = (id) => (id.startsWith('gem:') ? `gem-${id.slice(4)}` : id.toUpperCase());

/** The dest passages of pipeline/ask_index_layer.py src_dest, from shipped files. */
export function destPassages(rows) {
  const dossiers = existsSync(pub('dossier')) ? new Set(readdirSync(pub('dossier'))) : new Set();
  return rows.map((d) => {
    const city = d.city || d.id;
    const cats = [...(d.categories || []), ...(d.tags || [])];
    const file = `${dossierBase(d.id)}.json`;
    let intro = {};
    if (dossiers.has(file)) { try { intro = J(pub(`dossier/${file}`)).intro || {}; } catch { intro = {}; } }
    const lead = d.blurb || intro.short || '';
    const known = cats.length ? `Known for ${niceList(cats.slice(0, 6).map((c) => CAT_WORDS[c] || c.replace(/-/g, ' ')))}.` : '';
    const text = [`${city}, ${d.country || ''}.`, lead, known, d.guide?.text || ''].filter(Boolean).join(' ').slice(0, 300);
    return [`dest:${d.id}`, d.id, text, { tags: cats, name: city }];
  });
}

function sparseIndex(rows) {
  if (existsSync(pub('search/ask/bm25.json'))) {
    return { index: MiniSearch.loadJSON(readFileSync(pub('search/ask/bm25.json'), 'utf8'), ASK_BM25_OPTIONS), how: 'shipped' };
  }
  const ms = new MiniSearch(ASK_BM25_OPTIONS);
  ms.addAll(destPassages(rows).map(bm25Doc));
  return { index: ms, how: 'rebuilt' };
}

async function denseFetch() {
  if (!existsSync(pub('search/ask/manifest.json'))) return null;
  const { onRequestGet } = await import('../../functions/api/ask.js');
  const env = { ASSETS: { fetch: async (url) => {
    const file = pub(new URL(url).pathname.slice(1));
    return existsSync(file) ? new Response(readFileSync(file)) : new Response(null, { status: 404 });
  } } };
  return (url) => onRequestGet({ request: new Request(`https://carta.test${url}`), env });
}

const NONE = async () => new Response(null, { status: 404 });

// ---- One question -----------------------------------------------------------

const strings = (a) => {
  const out = [a.lead, a.note, ...a.notes, ...a.query];
  for (const p of a.picks) out.push(p.title, p.blurb, ...p.why);
  for (const r of a.table?.rows || []) out.push(...r);
  return out.filter((s) => s != null).map(String);
};

async function runCase(c, retriever, env) {
  const { vocab, ctx, today, t, labels } = env;
  const raw = parseIntent(c.q, { vocab, lang: c.lang, now: today });
  const abstained = !!outsidePlace(c.q, raw) || intentIsEmpty(raw);
  if (c.abstain) return { abstained };
  const found = retriever ? await retriever(raw, c.q) : null;
  const intent = found?.slots && Object.keys(found.slots).length
    ? { ...raw, facets: { ...found.slots, ...raw.facets }, semantic: true, unknown: [] } : raw;
  const facts = answerFacts(intent, { ...ctx, today, limit: CARDS, retrieved: found?.retrieved || null });
  const answer = composeAnswer(facts, intent, { t, lang: c.lang, labels });
  const cant = unknownNote(intent, t);
  if (cant) answer.notes.unshift(cant);
  const monthsText = (d) => (d.climate?.best || []).map((m) => labels.month(m)).join(', ');
  const pick6 = { ...facts, picks: facts.picks.slice(0, SHOWN) };
  const pack = buildPack({ question: c.q, lang: c.lang, facts: pick6, answer, passages: found?.passages || [], labels: { monthsText, estWord: t('money.est') } });

  const cardIds = facts.picks.map((p) => p.id);
  const places = [...new Set([...cardIds, facts.when?.id, ...(facts.compare || []).map((p) => p.id), ...(facts.plan?.order || [])].filter(Boolean))];
  let filtersFail = [];
  if (intent.type === 'find' || intent.type === 'near') {
    const pred = predicateOf(intent, { ...ctx, today }, new Set(facts.relaxed));
    filtersFail = facts.picks.slice(0, SHOWN).filter((p) => !pred(p.dest)).map((p) => p.id);
  }
  const months = [...new Set([...monthsOf(intent), facts.query?.month].filter(Boolean))];
  const read = {
    type: intent.type,
    places,
    cards: facts.picks.slice(0, SHOWN).map((p) => ({ id: p.id, cc: p.dest.iso2 })),
    months,
    budget: intent.type === 'budget' ? { total: facts.query?.budget, picks: facts.picks.slice(0, SHOWN).map((p) => ({ id: p.id, total: p.price?.total, core: p.price?.core })) } : null,
    filtersFail,
    noteText: pack.notes.map((n) => n.text).join(' '),
    strings: strings(answer),
  };
  const out = { abstained, checks: groundingChecks(c.facts, read), top: cardIds.slice(0, 5) };
  if (env.dump?.includes(c.id)) out.notes = pack.notes.map((n) => `[${n.n}] ${n.text}`);
  if (c.places) {
    out.cards = scoreList(cardIds, c.places);
    if (found?.retrieved) out.list = scoreList([...found.retrieved.keys()], c.places);
    else if (retriever) out.list = scoreList([], c.places);
  }
  return out;
}

// ---- The run ----------------------------------------------------------------

export async function runEval({ only = null, seedDrop = false, dump = null, set = J(SET_PATH) } = {}) {
  const cat = loadCatalogue();
  const cats = await catalogs();
  const today = new Date(`${set.now}T12:00:00`);
  const tFor = (lang) => (k, v) => String(cats[lang][k] ?? cats.en[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? String(v[x]) : m));
  const vocabs = {};
  for (const lang of Object.keys(cats)) vocabs[lang] = buildAskVocab({ ...cat, t: tFor(lang), lang });
  // The parser keeps its vocabulary; a seeded drop takes places out of the answers only.
  let rows = cat.rows;
  if (seedDrop) {
    const gone = new Set(set.cases.filter((c) => c.places).filter((_, i) => i % 2 === 0).flatMap((c) => c.places[0]));
    rows = rows.filter((p) => !gone.has(p.id));
  }
  const byId = new Map(rows.map((p) => [p.id, p]));
  const sparse = sparseIndex(cat.rows);
  const dense = await denseFetch();
  const all = {
    rules: null,
    bm25: makeRetriever({ bm25: () => sparse.index, fetchImpl: NONE }),
    dense: dense && makeRetriever({ bm25: () => null, fetchImpl: dense, timeoutMs: 60000 }),
    hybrid: dense && makeRetriever({ bm25: () => sparse.index, fetchImpl: dense, timeoutMs: 60000 }),
  };
  const retrievers = Object.keys(all).filter((r) => (r === 'rules' || all[r]) && (!only || only.includes(r)));
  const results = [];
  for (const c of set.cases) {
    const t = tFor(c.lang);
    const labels = { ...makeLabels({ t, lang: c.lang, guided: cat.guided, countries: cat.countries }), place: (id) => byId.get(id)?.city || id };
    const env = { vocab: vocabs[c.lang], ctx: { rows, byId, guided: cat.guided }, today, t, labels, dump };
    const res = { id: c.id, q: c.q, lang: c.lang, places: !!c.places, abstain: !!c.abstain, by: {} };
    for (const r of retrievers) {
      const out = await runCase(c, all[r], env);
      res.abstained = out.abstained;
      if (!c.abstain) res.by[r] = out;
    }
    results.push(res);
  }
  const summary = summarise(results, retrievers);
  summary.set = { version: set.version, cases: set.cases.length };
  summary.bm25 = sparse.how;
  summary.skipped = Object.keys(all).filter((r) => !retrievers.includes(r));
  if (seedDrop) summary.seedDrop = true;
  return { summary, results };
}

function printSummary(s) {
  const pct = (x) => (x == null ? '  -  ' : `${(x * 100).toFixed(1).padStart(5)}`);
  console.log(`ask eval: ${s.n} questions (set v${s.set.version}), bm25 ${s.bm25}${s.skipped.length ? `, skipped ${s.skipped.join(', ')} (no dense index here)` : ''}${s.seedDrop ? ', SEEDED DROP' : ''}`);
  console.log('retriever  cases  r@5    r@10   hit@10 MRR    nDCG10 | list r@10 MRR  | grounding (checks)');
  for (const [r, v] of Object.entries(s.retrievers)) {
    console.log(`${r.padEnd(10)} ${String(v.cases).padStart(5)} ${pct(v['recall@5'])}  ${pct(v['recall@10'])}  ${pct(v['hit@10'])}  ${pct(v.mrr)}  ${pct(v['ndcg@10'])}  | ${pct(v.list?.['recall@10'])}  ${pct(v.list?.mrr)} | ${pct(v.grounding)} (${v.checks})`);
  }
  const a = s.abstain;
  console.log(`abstain: ${a.caught}/${a.cases} out-of-scope questions answered "Carta does not know", ${a.falseAlarm} in-scope questions wrongly refused, correct ${pct(a.correct)}%`);
}

async function main() {
  const only = arg('--only') ? arg('--only').split(',') : null;
  const dump = arg('--dump') ? arg('--dump').split(',') : null;
  const { summary, results } = await runEval({ only, seedDrop: flag('--seed-drop'), dump });
  printSummary(summary);
  for (const r of results) for (const [k, v] of Object.entries(r.by)) if (v.notes) console.log(`${k} ${r.id} "${r.q}"\n  ${v.notes.join('\n  ')}`);
  if (flag('--verbose')) {
    for (const r of results) {
      for (const [k, v] of Object.entries(r.by)) {
        const bad = v.checks.filter((c) => !c[1]);
        if (bad.length || (v.cards && v.cards['hit@10'] === 0)) console.log(`  ${k} ${r.id} "${r.q}": ${v.cards ? `hit@10 ${v.cards['hit@10']} top ${v.top.join(',')}` : ''} ${bad.map((b) => `${b[0]} (${b[2]})`).join('; ')}`);
      }
      if (r.abstain !== r.abstained) console.log(`  abstain ${r.id} "${r.q}": want ${r.abstain}, got ${r.abstained}`);
    }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = arg('--out') || join(tmpdir(), 'carta-ask-eval', `run-${stamp}.json`);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), summary, results }, null, 1)}\n`);
  console.log(`score written to ${out}`);
  if (flag('--bless')) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ blessed: new Date().toISOString().slice(0, 10), tolerance: TOLERANCE, ...summary }, null, 2)}\n`);
    console.log(`baseline written to ${BASELINE_PATH}`);
  }
  if (argv.includes('--check')) {
    const path = arg('--check', BASELINE_PATH);
    const g = gate(summary, J(path));
    for (const f of g.failures) console.log(`DROP ${f.key}: ${f.was} -> ${f.now}${f.drop != null ? ` (down ${(f.drop * 100).toFixed(1)} points, tolerance ${(g.tolerance * 100).toFixed(0)})` : ''}`);
    for (const x of g.gains) console.log(`gain ${x.key}: ${x.was} -> ${x.now} (bless to raise the baseline)`);
    if (g.skipped.length) console.log(`not compared (not built here): ${g.skipped.join(', ')}`);
    if (process.env.GITHUB_STEP_SUMMARY && !summary.seedDrop) {
      const lines = [`### Ask eval: ${g.ok ? 'pass' : 'FAIL'}`, '', '| retriever | recall@10 | MRR | nDCG@10 | grounding |', '|---|---|---|---|---|',
        ...Object.entries(summary.retrievers).map(([r, v]) => `| ${r} | ${v['recall@10']} | ${v.mrr} | ${v['ndcg@10']} | ${v.grounding} |`),
        '', `abstain correct ${summary.abstain.correct}; tolerance ${g.tolerance}`, ...g.failures.map((f) => `- drop ${f.key}: ${f.was} to ${f.now}`)];
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, { flag: 'a' });
    }
    if (!g.ok) { console.log('ask eval gate: FAIL'); process.exit(1); }
    console.log('ask eval gate: pass');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
