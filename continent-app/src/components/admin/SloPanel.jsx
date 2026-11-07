import React from 'react';
import { useSloSnapshot } from '../../hooks/useSloSnapshot.js';

// SLOs and error budgets (ROADMAP H8, T1160): uptime, error rate, p95 per API
// and data freshness, each against config/slo.json. Reads a snapshot built
// from the sources named there (see docs/runbooks/slo.md). Mounted as the
// Admin "slo" section (T1211, T1160-a). Not i18n'd, like the other owner-only panels.

const LABEL = { ok: 'Within budget', warn: 'Budget low', breached: 'Budget spent', nodata: 'No data yet' };
const pct = (v, d = 1) => (v == null ? 'n/a' : `${(v * 100).toFixed(d)}%`);

function Row({ r }) {
  const left = r.budgetLeft == null ? null : Math.max(0, Math.min(1, r.budgetLeft));
  return (
    <tr data-slo={r.id} data-status={r.status}>
      <td>{r.label}</td>
      <td>{r.kind === 'latency' ? (r.p95Ms == null ? 'n/a' : `p95 ${Math.round(r.p95Ms)} ms of ${r.thresholdMs}`) : pct(r.sli, 2)}</td>
      <td>{r.target != null && r.kind === 'ratio' ? pct(r.target, 1) : r.kind === 'latency' ? `<= ${r.thresholdMs} ms` : ''}</td>
      <td>
        {left == null ? <span className="adminpage-muted">n/a</span> : (
          <span className="adminpage-bartrack" role="img" aria-label={`${pct(left, 0)} of the error budget left`}>
            <span className="adminpage-barfill" style={{ width: `${left * 100}%` }} />
          </span>
        )}
      </td>
      <td>{r.budgetLeft == null ? '' : pct(r.budgetLeft, 0)}</td>
      <td><b>{LABEL[r.status]}</b>{r.bad != null && r.total ? <span className="adminpage-muted"> ({Math.round(r.bad)} bad of {r.total} {r.unit})</span> : null}</td>
    </tr>
  );
}

export function SloPanel({ snapshot, config }) {
  const view = useSloSnapshot(snapshot, config);
  return (
    <section className="adminpage-card" data-slo-panel={view.overall}>
      <h1 className="adminpage-h1">Service levels</h1>
      <p className="adminpage-muted">
        {view.generatedAt ? `Snapshot ${String(view.generatedAt).slice(0, 16).replace('T', ' ')} UTC, last ${view.windowDays} days.` : `No snapshot yet. Run the collector (docs/runbooks/slo.md); targets are in config/slo.json.`}
        {' '}Overall: <b>{LABEL[view.overall]}</b>.
      </p>
      <table className="adminpage-table">
        <thead><tr><th>SLO</th><th>Measured</th><th>Target</th><th>Error budget</th><th>Left</th><th>Status</th></tr></thead>
        <tbody>{view.rows.map((r) => <Row key={r.id} r={r} />)}</tbody>
      </table>
    </section>
  );
}
