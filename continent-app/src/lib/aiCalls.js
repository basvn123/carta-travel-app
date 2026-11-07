/**
 * aiCalls.js: shape admin_ai_calls_weekly (migration 071, T1139, ROADMAP E4)
 * for the admin panel. Pure, so it runs under node. Failure rate counts calls
 * that failed after reaching the providers; refused calls (config, no key,
 * too big, unsafe input) are kept apart, since they are not the model's fault.
 */
const num = (v) => Number(v) || 0;

/** Weeks newest first; each feature gets its failure rate (failed / calls) and totals per week. */
export function aiCallsView(report) {
  if (!report || report.error || !Array.isArray(report.weeks)) return null;
  const weeks = report.weeks.map((w) => {
    const features = (w.features || []).map((f) => {
      const calls = num(f.calls);
      return {
        feature: f.feature, calls, failed: num(f.failed), refused: num(f.refused), fallbacks: num(f.fallbacks),
        failRate: calls > 0 ? num(f.failed) / calls : 0,
        p50: f.p50 == null ? null : num(f.p50), p95: f.p95 == null ? null : num(f.p95),
        costUsd: num(f.costUsd),
      };
    }).sort((a, b) => b.calls - a.calls);
    return {
      week: w.week, features,
      calls: features.reduce((n, f) => n + f.calls, 0),
      costUsd: Math.round(features.reduce((n, f) => n + f.costUsd, 0) * 1e4) / 1e4,
    };
  }).sort((a, b) => (a.week < b.week ? 1 : -1));
  const costByDay = (report.costByDay || []).map((d) => ({ day: d.day, costUsd: num(d.costUsd), calls: num(d.calls) }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
  return { weeks, current: weeks[0] || null, costByDay };
}

export const fmtMs = (ms) => (ms == null ? 'n/a' : ms >= 10000 ? `${(ms / 1000).toFixed(0)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
export const fmtUsd = (v) => (v > 0 && v < 0.01 ? '<$0.01' : `$${v.toFixed(2)}`);
export const fmtPct = (r) => `${(r * 100).toFixed(r > 0 && r < 0.1 ? 1 : 0)}%`;
