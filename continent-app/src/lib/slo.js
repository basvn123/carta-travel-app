// SLO maths (ROADMAP H8, T1160). Pure: config/slo.json plus a snapshot of the
// sources in, one row per SLO with its error budget out. The admin SLO panel
// renders these rows; scripts/ops/drill.py uses the same definitions.
//
// Two kinds:
//   ratio    good / total must stay at or above `target`. The budget is the
//            number of bad events the target allows: (1 - target) * total.
//   latency  at most (1 - quantile) of the calls may be slower than
//            `threshold_ms`. The budget is that share of the calls; the bad
//            events are the calls over the threshold.
// Remaining budget = 1 - bad / allowed. Negative means the SLO is blown.
//
// Snapshot: { generatedAt, windowDays, data: { <slo id>: { good, total } |
// { total, slow, p95Ms } } }. A missing entry reads "nodata", never "ok".

const round6 = (v) => Math.round(v * 1e6) / 1e6;

/** Evaluate one SLO against its measured entry. */
export function evaluateSlo(slo, entry, warnBelow = 0.25) {
  const base = { id: slo.id, label: slo.label, kind: slo.kind, unit: slo.unit || '', source: slo.source };
  if (!entry || !(entry.total > 0)) {
    return { ...base, status: 'nodata', total: 0, bad: 0, allowed: 0, budgetLeft: null, sli: null };
  }
  const total = entry.total;
  let bad;
  let allowed;
  let sli;
  if (slo.kind === 'latency') {
    bad = entry.slow;
    if (!Number.isFinite(bad)) {
      // Only a p95 is known: it can say breached or inside, not how much budget is left.
      const inside = Number.isFinite(entry.p95Ms) && entry.p95Ms <= slo.threshold_ms;
      return { ...base, status: inside ? 'ok' : 'breached', total, bad: null, allowed: null, budgetLeft: null,
        sli: entry.p95Ms ?? null, p95Ms: entry.p95Ms ?? null, thresholdMs: slo.threshold_ms };
    }
    allowed = round6((1 - (slo.quantile ?? 0.95)) * total);
    sli = 1 - bad / total;
  } else {
    bad = total - entry.good;
    allowed = round6((1 - slo.target) * total);
    sli = entry.good / total;
  }
  const budgetLeft = allowed > 0 ? round6(1 - bad / allowed) : (bad > 0 ? -1 : 1);
  const status = budgetLeft <= 0 && bad > 0 ? 'breached' : budgetLeft < warnBelow ? 'warn' : 'ok';
  return { ...base, status, total, bad, allowed, budgetLeft, sli,
    p95Ms: entry.p95Ms ?? null, thresholdMs: slo.threshold_ms ?? null, target: slo.target ?? slo.quantile ?? null };
}

/** Every SLO in the config, in config order. */
export function evaluateAll(config, snapshot) {
  const warn = config.burn?.warn_below ?? 0.25;
  const data = snapshot?.data || {};
  return config.slos.map((s) => evaluateSlo(s, data[s.id], warn));
}

/** Worst status wins: breached, warn, nodata, ok. */
export function overall(rows) {
  for (const s of ['breached', 'warn', 'nodata']) if (rows.some((r) => r.status === s)) return s;
  return 'ok';
}

// ---- adapters: raw source rows to snapshot entries ----

/** Actions runs of the uptime workflow: [{ conclusion }]. In-progress runs are skipped. */
export function fromUptimeRuns(runs) {
  const done = (runs || []).filter((r) => r && (r.conclusion === 'success' || r.conclusion === 'failure'));
  return { good: done.filter((r) => r.conclusion === 'success').length, total: done.length };
}

/** scripts/freshness_report.py output: a wire is good when it is inside its cadence and its stamp is sound. */
export function fromFreshness(report) {
  const rows = report?.wires || [];
  return { good: rows.filter((w) => w.status === 'ok' && !w.over_cadence).length, total: rows.length };
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

/** ai_model_events kind 'call' rows for one feature: { outcome, latency_ms }. */
export function fromAiEvents(rows, feature, thresholdMs, q = 0.95) {
  const mine = (rows || []).filter((r) => r && r.kind !== 'plan' && r.feature === feature);
  const lat = mine.map((r) => r.latency_ms).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    good: mine.filter((r) => r.outcome !== 'failed').length,
    total: mine.length,
    slow: lat.filter((v) => v > thresholdMs).length,
    p95Ms: quantile(lat, q),
  };
}

/** Error tracker plus function analytics: { requests, errors, latenciesMs? } per route. */
export function fromFunctionStats(stats, thresholdMs, q = 0.95) {
  if (!stats) return null;
  const lat = (stats.latenciesMs || []).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    good: Math.max(0, (stats.requests || 0) - (stats.errors || 0)),
    total: stats.requests || 0,
    slow: lat.length ? lat.filter((v) => v > thresholdMs).length : undefined,
    p95Ms: lat.length ? quantile(lat, q) : (stats.p95Ms ?? null),
  };
}

/** Build a snapshot from raw sources, using the SLO config to pick the right adapter. */
export function buildSnapshot(config, raw, now = new Date()) {
  const data = {};
  for (const s of config.slos) {
    if (s.source === 'uptime') data[s.id] = fromUptimeRuns(raw.uptimeRuns);
    else if (s.source === 'freshness') data[s.id] = fromFreshness(raw.freshness);
    else if (s.source === 'ai_model_events') data[s.id] = fromAiEvents(raw.aiEvents, s.feature, s.threshold_ms ?? 0, s.quantile);
    else if (s.source === 'error_tracking') {
      const route = s.id.replace(/^(error|p95)-/, '');
      const e = fromFunctionStats(raw.functions?.[route], s.threshold_ms ?? 0, s.quantile);
      if (e) data[s.id] = e;
    }
  }
  return { generatedAt: now.toISOString(), windowDays: config.window_days, data };
}
