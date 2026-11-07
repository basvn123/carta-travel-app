/*
 * Adapter: the trails external check (T1181, ROADMAP D23 and D24) in the
 * shared results format, as a data eval. It runs
 * scripts/validation/trails_external.py's run() in memory against the
 * committed reference list and baseline, so nothing is written. The gate:
 * the share of reference trails Carta publishes (coverage) and the share in
 * its top band (v5 exceptional or excellent) must not fall below the
 * baseline in data/reports/validation/trails_external_baseline.json.
 */
import { makeResult } from '../lib/results.mjs';
import { runPython } from './python.mjs';

export const id = 'trails-external';
export const title = 'Trails external check';

export async function run() {
  const d = runPython(`
import json, sys
sys.path.insert(0, 'scripts/validation')
import trails_external as t
p = t.run()
print(json.dumps({"summary": p["summary"], "gate": p["gate"], "reference": p["reference"],
                  "wire_at": p["wire_generated_at"], "wire_rows": p["wire_rows"],
                  "gaps": [{"id": g["id"], "status": g["status"], "cause_code": g["cause_code"]} for g in p["gaps"]]}))
`);
  const s = d.summary;
  const g = d.gate;
  const base = g.baseline || {};
  const failures = (g.failures || []).map((f) => {
    const key = f.startsWith('top_share') ? 'top_share' : f.startsWith('coverage') ? 'coverage' : 'baseline';
    return { key, was: base[key] ?? null, now: s[key] ?? null, why: f };
  });
  const metrics = {
    coverage: s.coverage,
    top_share: s.top_share,
    top_share_of_matched: s.top_share_of_matched,
    reference_trails: s.n,
    matched: s.matched,
    in_top: s.in_top,
  };
  for (const [k, e] of Object.entries(s.by_label || {})) {
    metrics[`label.${k}.coverage`] = e.n ? Math.round((e.matched / e.n) * 10000) / 10000 : null;
    metrics[`label.${k}.top_share`] = e.n ? Math.round((e.in_top / e.n) * 10000) / 10000 : null;
  }
  for (const [k, v] of Object.entries(s.causes || {})) metrics[`cause.${k}`] = v;
  return makeResult({
    eval: id,
    title,
    kind: 'data',
    status: g.ok ? 'pass' : 'fail',
    gated: true,
    headline: { key: 'coverage', value: s.coverage, label: 'reference trails Carta publishes', higher_is_better: true },
    metrics,
    gate: {
      ok: g.ok,
      rule: 'coverage and the top-band share of the reference trails at or above the baseline',
      tolerance: 0,
      baseline: base.at ? `baseline of the wire ${base.at}, reference ${base.reference_sha}` : null,
      failures,
    },
    cases: { n: s.n, passed: s.matched },
    inputs: { reference: d.reference.path, reference_sha: d.reference.sha, wire: 'continent-app/public/trails', wire_generated_at: d.wire_at, wire_rows: d.wire_rows },
    notes: d.reference.sha !== base.reference_sha && base.reference_sha
      ? [`the reference list changed since the baseline (${base.reference_sha} to ${d.reference.sha}): review and move the baseline with --write-baseline`]
      : [],
  });
}
