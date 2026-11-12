/*
 * Adapter: the Ask eval (T1136, ROADMAP E1) in the shared results format.
 * It calls T1136's runEval and gate unchanged, so every score and the gate
 * verdict are exactly those of `node scripts/eval/ask-eval.mjs --check`.
 */
import { readFileSync } from 'node:fs';
import { runEval, BASELINE_PATH } from '../ask-eval.mjs';
import { gate } from '../ask-eval-lib.mjs';
import { flatten, makeResult } from '../lib/results.mjs';

export const id = 'ask';
export const title = 'Ask retrieval and grounding';

export async function run({ seedDrop = false, only = null } = {}) {
  const { summary, results } = await runEval({ seedDrop, only });
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const g = gate(summary, baseline);
  const { set, bm25, skipped, seedDrop: sd, ...numbers } = summary;
  const head = summary.retrievers.rules?.['ndcg@10'] ?? null;
  return makeResult({
    eval: id,
    title,
    kind: 'retrieval',
    status: g.ok ? 'pass' : 'fail',
    gated: true,
    headline: { key: 'rules.ndcg@10', value: head, label: 'nDCG@10, rules path', higher_is_better: true },
    metrics: flatten(numbers),
    gate: {
      ok: g.ok,
      rule: 'every gated number within the tolerance of scripts/eval/ask-baseline.json',
      tolerance: g.tolerance,
      baseline: `continent-app/scripts/eval/ask-baseline.json (blessed ${baseline.blessed})`,
      failures: g.failures.map((f) => ({ key: f.key, was: f.was, now: f.now, why: f.drop != null ? `down ${(f.drop * 100).toFixed(1)} points` : 'case count changed' })),
      gains: g.gains,
      skipped: g.skipped,
    },
    cases: { n: summary.n, passed: results.filter((r) => (r.abstain ? r.abstained : !r.abstained)).length },
    inputs: { set: set.version, questions: set.cases, bm25, skipped_retrievers: skipped, seed_drop: !!sd },
    notes: skipped.length ? [`not built here: ${skipped.join(', ')}`] : [],
  });
}
