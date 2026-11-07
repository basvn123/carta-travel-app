/*
 * The place linking eval (T1153, ROADMAP F4): MRR and accuracy@1 on the
 * 300 messy mentions of set.json, for the search Explore runs today
 * ("before") and for the linker ("after").
 *
 * before  what the Explore search box finds today: querySearchIndex
 *         (src/lib/searchIndex.js: exact, prefix, substring, edit distance 1)
 *         in its own order, then the plain substring match of
 *         useExploreCatalog on name and country, in catalogue order. The app
 *         shows that set sorted by its sort key, not by match, so this rank
 *         is the kindest reading of today's search.
 *  after  linkPlace (src/lib/linking/) with the case's context, and once
 *         without it (after_noctx) so the gain of context shows alone.
 *
 * Gate: after accuracy@1 and MRR within 2 points of baseline.json, and after
 * MRR not below before. No model is called.
 *
 *   node scripts/eval/linking/eval.mjs [--bless] [--verbose]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { querySearchIndex } from '../../../src/lib/searchIndex.js';
import { makeLinker, linkPlace } from '../../../src/lib/linking/linker.js';

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, '..', '..', '..');
const J = (p) => JSON.parse(readFileSync(join(APP, p), 'utf8'));
export const SET_PATH = join(here, 'set.json');
export const BASELINE_PATH = join(here, 'baseline.json');
export const TOLERANCE = 0.02;

const normalize = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function loadInputs() {
  const destinations = J('public/app_data.json').destinations;
  return { destinations, searchIndex: J('public/search_index.json'), lexicon: J('public/search/ask/lexicon.json') };
}

/** Today's Explore search as a ranked id list. */
export function beforeRank(inputs, mention) {
  const hits = querySearchIndex(inputs.searchIndex, mention);
  const out = [...(hits.ids || [])];
  const q = normalize(mention);
  if (q) {
    for (const [id, d] of Object.entries(inputs.destinations)) {
      if (normalize(d.city).includes(q) || normalize(d.country).includes(q)) out.push(id);
    }
  }
  return [...new Set(out)];
}

/** Ranked ids from the linker: each place group's members, best group first. */
export function afterRank(linker, mention, ctx) {
  const r = linkPlace(linker, mention, ctx || {});
  return { ids: [...new Set(r.candidates.flatMap((c) => c.members || [c.id]))], groups: r.candidates.map((c) => c.members || [c.id]), result: r };
}

/** Rank of the first gold place (1-based), counting a place group as one row. */
function rankOf(groups, gold) {
  const g = new Set(gold);
  const i = groups.findIndex((members) => members.some((id) => g.has(id)));
  return i < 0 ? null : i + 1;
}

function summarise(rows) {
  const n = rows.length;
  if (!n) return { n: 0, mrr: null, acc1: null, acc3: null, found: null };
  const rr = rows.map((r) => (r.rank ? 1 / r.rank : 0));
  return {
    n,
    mrr: round(rr.reduce((a, b) => a + b, 0) / n),
    acc1: round(rows.filter((r) => r.rank === 1).length / n),
    acc3: round(rows.filter((r) => r.rank && r.rank <= 3).length / n),
    found: round(rows.filter((r) => r.rank).length / n),
  };
}
const round = (x) => Math.round(x * 1000) / 1000;

export function runLinkingEval({ seedDrop = false, verbose = false } = {}) {
  const set = JSON.parse(readFileSync(SET_PATH, 'utf8'));
  const inputs = loadInputs();
  // The seeded drop takes the exonym and endonym sources away: the gate must fail.
  const linker = makeLinker(seedDrop ? { destinations: inputs.destinations } : inputs);
  const rows = { before: [], after: [], after_noctx: [] };
  const conf = { linked: 0, linkedRight: 0, dym: 0, dymHas: 0, none: 0 };
  const times = [];
  const misses = [];
  for (const c of set.cases) {
    const b = beforeRank(inputs, c.mention);
    // Today's list has no groups: each id is its own row, but a gateway twin counts as the place.
    rows.before.push({ c, rank: rankOf(b.map((id) => [id]), c.gold) });
    const t0 = performance.now();
    const a = afterRank(linker, c.mention, c.ctx);
    times.push(performance.now() - t0);
    const ra = rankOf(a.groups, c.gold);
    rows.after.push({ c, rank: ra });
    rows.after_noctx.push({ c, rank: rankOf(afterRank(linker, c.mention, {}).groups, c.gold) });
    const res = a.result;
    if (res.confident) { conf.linked++; if (ra === 1) conf.linkedRight++; }
    else if (res.didYouMean.length) { conf.dym++; if (res.didYouMean.some((x) => c.gold.includes(x.id) || (res.candidates.find((k) => k.id === x.id)?.members || []).some((id) => c.gold.includes(id)))) conf.dymHas++; }
    else conf.none++;
    if (ra !== 1) misses.push({ id: c.id, src: c.src, mention: c.mention, gold: c.gold.join('|'), got: res.candidates.slice(0, 3).map((k) => `${k.id}:${k.score}`).join(' ') });
  }
  const by = (name, pick) => {
    const out = {};
    for (const [k, list] of Object.entries(rows)) out[k] = summarise(list.filter((r) => pick(r.c)));
    return [name, out];
  };
  const parts = Object.fromEntries([
    by('all', () => true),
    by('dev', (c) => c.split === 'dev'),
    by('test', (c) => c.split === 'test'),
    ...['ask', 'ask-sentence', 'booking', 'context', 'typo'].map((s) => by(`src.${s}`, (c) => c.src === s)),
  ]);
  times.sort((a, b) => a - b);
  const pctl = (p) => round(times[Math.min(times.length - 1, Math.floor(p * times.length))]);
  const summary = {
    parts,
    confidence: {
      linked: conf.linked,
      linked_precision: conf.linked ? round(conf.linkedRight / conf.linked) : null,
      did_you_mean: conf.dym,
      did_you_mean_has_gold: conf.dym ? round(conf.dymHas / conf.dym) : null,
      no_answer: conf.none,
    },
    latency_ms: { p50: pctl(0.5), p95: pctl(0.95), max: round(times[times.length - 1]) },
    aliases: linker.rows.length,
    n: set.cases.length,
  };
  if (verbose) for (const m of misses) console.log(`miss ${m.id} [${m.src}] "${m.mention}" want ${m.gold} got ${m.got}`);
  return { summary, misses, set };
}

export function gate(summary, baseline) {
  const failures = [];
  const a = summary.parts.all;
  if (a.after.mrr < a.before.mrr) failures.push({ key: 'after.mrr', was: a.before.mrr, now: a.after.mrr, why: 'the linker ranks worse than today\'s search' });
  if (baseline) {
    for (const k of ['mrr', 'acc1']) {
      const was = baseline.after?.[k];
      if (was != null && a.after[k] < was - TOLERANCE) failures.push({ key: `after.${k}`, was, now: a.after[k], why: `dropped more than ${TOLERANCE} from the blessed baseline` });
    }
  }
  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { summary } = runLinkingEval({ verbose: process.argv.includes('--verbose'), seedDrop: process.argv.includes('--seed-drop') });
  console.log(JSON.stringify(summary, null, 1));
  if (process.argv.includes('--bless')) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ blessed: new Date().toISOString().slice(0, 10), before: summary.parts.all.before, after: summary.parts.all.after }, null, 1)}\n`);
    console.log(`blessed ${BASELINE_PATH}`);
  }
}
