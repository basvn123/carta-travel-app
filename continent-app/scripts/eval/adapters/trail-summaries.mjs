/*
 * Adapter: the trail summaries fact check (T1179, ROADMAP D24) in the shared
 * results format. It runs pipeline/trails/summaries.py's own run() on the
 * shipped trail wire, in memory, so the committed data/trails/summaries.json
 * is never rewritten. Every top-band walk whose summary fails check() (the
 * closed vocabulary, the loop and season consistency, the house rules) is a
 * refused row. The gate: no refused row and every candidate written.
 */
import { makeResult } from '../lib/results.mjs';
import { runPython } from './python.mjs';

export const id = 'trail-summaries';
export const title = 'Trail summaries fact check';

export async function run({ all = false } = {}) {
  const d = runPython(`
import json, sys
sys.path.insert(0, 'pipeline/trails')
import summaries as s
items, stats, wire_at = s.run(s.WIRE_DIR, None, top_only=${all ? 'False' : 'True'})
print(json.dumps({"stats": stats, "wire_at": wire_at, "bands": list(s.TOP_BANDS)}))
`);
  const c = d.stats.counts;
  const candidates = c.candidates || 0;
  const written = c.written || 0;
  const refused = c.failed || 0;
  const share = candidates ? written / candidates : null;
  const failures = [];
  if (refused) failures.push({ key: 'counts.failed', was: 0, now: refused, why: `refused by check(): ${Object.entries(d.stats.failures).map(([k, v]) => `${k} (${v})`).join('; ')}` });
  if (!candidates) failures.push({ key: 'counts.candidates', was: null, now: 0, why: 'no top-band walk read: wire missing?' });
  return makeResult({
    eval: id,
    title,
    kind: 'text-check',
    status: failures.length ? 'fail' : 'pass',
    gated: true,
    headline: { key: 'pass_share', value: share == null ? null : Math.round(share * 10000) / 10000, label: 'summaries that pass every check', higher_is_better: true },
    metrics: {
      pass_share: share == null ? null : Math.round(share * 10000) / 10000,
      'counts.rated_rows': c.rated_rows ?? null,
      'counts.candidates': candidates,
      'counts.written': written,
      'counts.failed': refused,
      'counts.no_detail_file': c.no_detail_file ?? 0,
      'chars.min': d.stats.chars?.min ?? null,
      'chars.median': d.stats.chars?.median ?? null,
      'chars.max': d.stats.chars?.max ?? null,
      ...Object.fromEntries(Object.entries(d.stats.clauses || {}).map(([k, v]) => [`clauses.${k}`, v])),
    },
    gate: { ok: !failures.length, rule: 'no top-band summary refused by summaries.check(), and at least one read', tolerance: 0, baseline: null, failures },
    cases: { n: candidates, passed: written },
    inputs: { scope: all ? 'all rated walks' : `top band (v5 ${d.bands.join(', ')})`, wire: 'continent-app/public/trails', wire_generated_at: d.wire_at },
  });
}
