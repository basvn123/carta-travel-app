/*
 * Adapter: the data quality gate (T1142, ROADMAP D2) in the shared results
 * format, as a data eval. It calls scripts/quality/engine.py's run() in
 * check mode (no card, history line, panel or snapshot is written) against
 * the engine's own output folder, so the verdict is that of
 * `python scripts/quality/engine.py`. Headline: the share of the rules met.
 */
import { makeResult } from '../lib/results.mjs';
import { runPython } from './python.mjs';

export const id = 'data-quality';
export const title = 'Data quality gate';

export async function run() {
  const d = runPython(`
import json, os, sys
from pathlib import Path
sys.path.insert(0, 'scripts/quality')
import engine
sc = engine._scorecard()
out = Path(os.environ.get("CARTA_QUALITY_OUT") or str(sc.OUT))
rc, data = engine.run(Path(sc.PUBLIC).resolve(), None, out, engine.RULES, False, None)
print(json.dumps({"rc": rc, "data": data}))
`);
  if (d.rc === 2) {
    return makeResult({
      eval: id, title, kind: 'data', status: 'error', gated: true,
      headline: { key: 'rules_met', value: null, label: 'quality rules met', higher_is_better: true },
      gate: { ok: false, rule: 'engine configuration', tolerance: null, baseline: null, failures: (d.data.config_errors || []).map((e) => ({ key: 'config', was: null, now: null, why: e })) },
      notes: ['scripts/quality/rules.yaml does not cover the scorecard'],
    });
  }
  const p = d.data;
  const g = p.gate;
  const met = g.rules ? (g.rules - g.failures.length) / g.rules : null;
  const metrics = { rules_met: met == null ? null : Math.round(met * 10000) / 10000, rules: g.rules, failures: g.failures.length, warnings: g.warnings.length };
  for (const l of p.layers) for (const k of ['score', 'completeness', 'validity', 'freshness']) metrics[`${l.layer}.${k}`] = l[k];
  return makeResult({
    eval: id,
    title,
    kind: 'data',
    status: g.ok ? 'pass' : 'fail',
    gated: true,
    headline: { key: 'rules_met', value: metrics.rules_met, label: 'quality rules met', higher_is_better: true },
    metrics,
    gate: {
      ok: g.ok,
      rule: 'no must_see field down more than 2 points on the last passing card, no hard rule under its floor (scripts/quality/rules.yaml)',
      tolerance: 0.02,
      baseline: g.baseline_at ? `last passing card ${g.baseline_at}` : null,
      failures: g.failures.map((f) => ({ key: f.id, was: null, now: null, why: `[${f.kind}] ${f.why}` })),
    },
    cases: { n: g.rules, passed: g.rules - g.failures.length },
    inputs: { public: p.public, card_generated_at: p.generated_at, layers: p.layers.length },
    notes: g.warnings.map((w) => `warn [${w.kind}] ${w.id}: ${w.why}`),
  });
}
