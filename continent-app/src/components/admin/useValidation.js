import { useMemo } from 'react';
import snapshot from './validationScorecard.json';

// External validation scorecard (ROADMAP D23, T1187): the snapshot
// scripts/validation/runner.py --write copies here from
// data/reports/validation/scorecard.json. Nothing is fetched; the build
// carries the cards of the last runs.

/** Shape the scorecard for the view: per layer, its checks with a trend
 *  series each (oldest first), and the headline metrics. Pure, so the view
 *  test can feed it a fixture. */
export function shapeValidation(data) {
  const layers = (data?.layers || []).map((l) => {
    const trend = l.trend || [];
    const checks = (l.gate?.checks || []).map((c) => ({
      ...c,
      series: trend.filter((p) => p.metrics?.[c.metric] != null)
        .map((p) => ({ at: p.date, v: p.metrics[c.metric], ok: p.gate_ok })),
    }));
    return {
      layer: l.layer,
      latest: l.latest,
      baselineAt: l.baseline_at,
      referenceN: l.reference_n,
      sample: l.sample || {},
      ok: !!l.gate?.ok,
      failures: l.gate?.failures || [],
      warnings: l.gate?.warnings || [],
      metrics: l.metrics || {},
      runs: trend.length,
      gaps: l.gaps || 0,
      checks,
    };
  });
  return { generatedAt: data?.generated_at || null, ok: layers.every((l) => l.ok), layers };
}

export function useValidation(data = snapshot) {
  return useMemo(() => shapeValidation(data), [data]);
}
