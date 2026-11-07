/*
 * The Ask the docs eval (T1168, ROADMAP B8): recall of the right doc and
 * section, grounding of the answers, and abstention on questions the docs do
 * not answer. Extractive answers, BM25 over docs/, no model is called.
 * --seed-drop builds the index without docs/runbooks, a known regression.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { core, loadPassages } from '../../../../scripts/docs/ask_docs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const SET_PATH = join(here, 'set.json');
export const BASELINE_PATH = join(here, 'baseline.json');
export const TOLERANCE = 0.02;
// Floors from the research (B-R4): recall@5 at least 0.85, abstention at least 0.8.
export const FLOORS = { recall5: 0.85, abstain: 0.8, grounded: 1 };
const K = 5;
const r3 = (x) => Math.round(x * 1000) / 1000;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

const isGold = (p, g) => p.path === g.path;
const isGoldSection = (p, g) => p.path === g.path && (!g.anchor || p.anchor.startsWith(g.anchor) || p.anchor.includes(g.anchor));

export function runAskDocsEval({ seedDrop = false, docsDir } = {}) {
  const set = JSON.parse(readFileSync(SET_PATH, 'utf8')).questions;
  let passages = loadPassages(docsDir);
  if (seedDrop) passages = passages.filter((p) => !p.path.startsWith('runbooks/'));
  const index = core.buildIndex(passages);
  const rows = [];
  for (const q of set) {
    const t0 = performance.now();
    const ans = core.answer(index, q.q);
    const ms = performance.now() - t0;
    const docs = [];
    for (const h of ans.hits) if (!docs.includes(h.passage.path)) docs.push(h.passage.path);
    const g = core.groundingCheck(ans);
    const row = { id: q.id, lang: q.lang, answerable: q.answerable, abstained: ans.abstained, grounded: g.ok, problems: g.problems, ms };
    if (q.answerable) {
      const rank = ans.hits.findIndex((h) => isGold(h.passage, q.gold));
      const docRank = docs.indexOf(q.gold.path);
      row.docRank = docRank < 0 ? null : docRank + 1;
      row.sectionHit = ans.hits.slice(0, K).some((h) => isGoldSection(h.passage, q.gold));
      row.cited = ans.citations.some((c) => c.path === q.gold.path);
      void rank;
    }
    rows.push(row);
  }
  const ok = rows.filter((r) => r.answerable);
  const un = rows.filter((r) => !r.answerable);
  const at = (k) => mean(ok.map((r) => (r.docRank && r.docRank <= k ? 1 : 0)));
  const lat = rows.map((r) => r.ms).sort((a, b) => a - b);
  const answered = rows.filter((r) => !r.abstained);
  const nl = ok.filter((r) => r.lang === 'nl');
  const summary = {
    n: rows.length, answerable: ok.length, unanswerable: un.length, passages: passages.length,
    recall1: r3(at(1)), recall3: r3(at(3)), recall5: r3(at(5)),
    mrr: r3(mean(ok.map((r) => (r.docRank ? 1 / r.docRank : 0)))),
    section5: r3(mean(ok.map((r) => (r.sectionHit ? 1 : 0)))),
    answered: r3(mean(ok.map((r) => (r.abstained ? 0 : 1)))),
    cited_gold: r3(mean(ok.map((r) => (r.cited ? 1 : 0)))),
    nl_recall5: nl.length ? r3(mean(nl.map((r) => (r.docRank && r.docRank <= 5 ? 1 : 0)))) : null,
    abstain: r3(mean(un.map((r) => (r.abstained ? 1 : 0)))),
    grounded: r3(mean(answered.map((r) => (r.grounded ? 1 : 0)))),
    latency_ms: { p50: r3(lat[Math.floor(lat.length / 2)]), p95: r3(lat[Math.floor(lat.length * 0.95)]) },
  };
  return { summary, rows };
}

export function gate(s, baseline) {
  const failures = [];
  for (const [k, floor] of Object.entries(FLOORS)) {
    if (s[k] < floor) failures.push({ key: k, was: floor, now: s[k], why: `${k} ${s[k]} is under the floor ${floor}` });
  }
  if (baseline) {
    for (const k of ['recall1', 'recall5', 'mrr', 'section5', 'abstain', 'grounded']) {
      if (s[k] < baseline[k] - TOLERANCE) failures.push({ key: k, was: baseline[k], now: s[k], why: `${k} fell from ${baseline[k]} to ${s[k]}` });
    }
  }
  return failures;
}

export const baselineExists = () => existsSync(BASELINE_PATH);
