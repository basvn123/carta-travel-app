/*
 * Adapter: the place linking eval (T1153, ROADMAP F4) in the shared results format.
 *
 * 300 messy mentions (scripts/eval/linking/set.json, built by build-set.mjs),
 * scored for today's Explore search ("before") and the linker
 * (src/lib/linking/, "after"): MRR and accuracy@1, per split and per source,
 * plus the confidence split (linked, "did you mean", nothing) and latency.
 * Gate: after MRR and accuracy@1 within 2 points of linking/baseline.json and
 * after MRR not below before. --seed-drop links without the exonym and
 * endonym sources, a known regression the gate must catch. No model is called.
 */
import { existsSync, readFileSync } from 'node:fs';
import { makeResult } from '../lib/results.mjs';
import { BASELINE_PATH, TOLERANCE, gate, runLinkingEval } from '../linking/eval.mjs';

export const id = 'linking';
export const title = 'Place linking (MRR, accuracy@1)';

export async function run({ seedDrop = false } = {}) {
  const { summary: s } = runLinkingEval({ seedDrop });
  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;
  const failures = gate(s, baseline);
  const metrics = {};
  for (const [part, sides] of Object.entries(s.parts)) {
    for (const [side, m] of Object.entries(sides)) {
      for (const k of ['mrr', 'acc1', 'acc3']) metrics[`${part}.${side}.${k}`] = m[k];
    }
  }
  Object.assign(metrics, {
    'confidence.linked': s.confidence.linked,
    'confidence.linked_precision': s.confidence.linked_precision,
    'confidence.did_you_mean': s.confidence.did_you_mean,
    'confidence.did_you_mean_has_gold': s.confidence.did_you_mean_has_gold,
    'confidence.no_answer': s.confidence.no_answer,
    'latency_ms.p50': s.latency_ms.p50,
    'latency_ms.p95': s.latency_ms.p95,
    aliases: s.aliases,
  });
  const a = s.parts.all;
  return makeResult({
    eval: id,
    title,
    kind: 'retrieval',
    status: failures.length ? 'fail' : 'pass',
    gated: true,
    headline: { key: 'all.after.acc1', value: a.after.acc1, label: 'accuracy@1 of the place linker on 300 messy mentions', higher_is_better: true },
    metrics,
    gate: { ok: !failures.length, rule: 'after MRR and accuracy@1 not below the baseline, after MRR not below today\'s search', tolerance: TOLERANCE, baseline: 'scripts/eval/linking/baseline.json', failures },
    cases: { n: a.after.n, passed: Math.round(a.after.acc1 * a.after.n) },
    inputs: { set: 'scripts/eval/linking/set.json', n: s.n, seed_drop: seedDrop },
    notes: [
      `Before (today's Explore search): MRR ${a.before.mrr}, accuracy@1 ${a.before.acc1}. After: MRR ${a.after.mrr}, accuracy@1 ${a.after.acc1} (${a.after_noctx.acc1} without context).`,
      'The set was written by the session that built the linker (T1153): read the after numbers as an upper bound until real search and parse-booking logs are labelled (T1153-c).',
    ],
  });
}
