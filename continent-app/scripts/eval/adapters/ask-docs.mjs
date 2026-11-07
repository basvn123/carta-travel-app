/*
 * Adapter: the Ask the docs eval (T1168, ROADMAP B8) in the shared results format.
 * A second RAG system beside Ask Carta: BM25 over docs/, extractive answers
 * with [n] citations. Scores recall of the right doc, grounding and abstention
 * on scripts/eval/ask-docs/set.json. No model is called.
 */
import { existsSync, readFileSync } from 'node:fs';
import { makeResult } from '../lib/results.mjs';
import { BASELINE_PATH, TOLERANCE, gate, runAskDocsEval } from '../ask-docs/eval.mjs';

export const id = 'ask-docs';
export const title = 'Ask the docs (recall, grounding, abstention)';

export async function run({ seedDrop = false } = {}) {
  const { summary: s, rows } = runAskDocsEval({ seedDrop });
  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;
  const failures = gate(s, baseline);
  const metrics = { ...s, 'latency_ms.p50': s.latency_ms.p50, 'latency_ms.p95': s.latency_ms.p95 };
  delete metrics.latency_ms;
  const good = rows.filter((r) => (r.answerable ? r.docRank && r.docRank <= 5 : r.abstained)).length;
  const notes = [
    `Misses: ${rows.filter((r) => r.answerable && !(r.docRank && r.docRank <= 5)).map((r) => r.id).join(', ') || 'none'}. Answered an unanswerable question: ${rows.filter((r) => !r.answerable && !r.abstained).map((r) => r.id).join(', ') || 'none'}.`,
    'The question set was written by the session that built the feature (T1168): read recall as an upper bound until real questions are logged (T1168-d).',
  ];
  return makeResult({
    eval: id, title, kind: 'retrieval',
    status: failures.length ? 'fail' : 'pass', gated: true,
    headline: { key: 'recall5', value: s.recall5, label: 'recall@5 of the right doc on 48 doc questions', higher_is_better: true },
    metrics,
    gate: { ok: !failures.length, rule: 'recall@5 0.85, abstention 0.8 and grounding 1 at least, no metric more than 2 points under the baseline', tolerance: TOLERANCE, baseline: 'scripts/eval/ask-docs/baseline.json', failures },
    cases: { n: rows.length, passed: good },
    inputs: { set: 'scripts/eval/ask-docs/set.json', n: s.n, passages: s.passages, seed_drop: seedDrop },
    notes,
  });
}
