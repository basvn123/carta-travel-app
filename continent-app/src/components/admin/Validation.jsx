import React from 'react';
import { useValidation } from './useValidation.js';

// External validation (ROADMAP D23, T1187): one card per layer from
// scripts/validation/runner.py, beside the D2 Data health card. Each check
// against outside references shows its value, its baseline and its trend
// over the last runs. A failed hard check also fails the D2 quality run
// (scripts/quality/engine.py), so it shows in the gate line above too.
//
// Owner-only and English-only, like DataHealth.

const pct = (v) => (v == null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const isRank = (metric) => metric.startsWith('agreement_');
const fmt = (metric, v) => (v == null ? 'n/a' : isRank(metric) ? v.toFixed(3) : pct(v));
// Rank agreement runs from -1 to 1; every other check is a share.
const height = (metric, v) => (isRank(metric) ? (v + 1) / 2 : v);

const LABEL = {
  coverage: 'coverage (references Carta has)',
  in_top: 'share in the top band',
  fact_share: 'share of matching facts',
  agreement_tau: 'rank agreement (Kendall tau-b)',
  error_mdape: 'median error (% of the reference)',
};
const label = (m) => LABEL[m] || (m.startsWith('fact.') ? `fact: ${m.slice(5)}` : m);

/** One bar per run; the first and latest values are written beside it, so
 *  the bars are never the only carrier. A failed run's bar is marked. */
function Trend({ metric, series, name }) {
  if (!series.length) return <span className="adminpage-muted">no runs yet</span>;
  const first = series[0];
  const last = series[series.length - 1];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="adminpage-spark" role="img" data-vtrend={name} style={{ height: 28, minWidth: 64, maxWidth: 160 }}
        aria-label={`${name}: ${series.map((p) => `${p.at} ${fmt(metric, p.v)}${p.ok ? '' : ' (gate failed)'}`).join(', ')}`}>
        {series.map((p, i) => (
          <span key={`${p.at}-${i}`} className="adminpage-sparkbar" data-ok={p.ok ? 'yes' : 'no'}
            title={`${p.at}: ${fmt(metric, p.v)}${p.ok ? '' : ', gate failed'}`}>
            <span style={{ height: `${Math.max(Math.min(height(metric, p.v), 1) * 100, 2)}%` }} />
          </span>
        ))}
      </span>
      <span className="mono adminpage-muted">
        {series.length > 1 ? ` ${fmt(metric, first.v)} to ${fmt(metric, last.v)}` : ` ${fmt(metric, last.v)}`}
      </span>
    </span>
  );
}

export function Validation({ data }) {
  const v = useValidation(data);
  if (!v.layers.length) {
    return (
      <section data-validation="empty">
        <h2 className="adminpage-h2">External validation</h2>
        <p className="adminpage-muted">
          No validation run yet. python -I scripts/validation/runner.py trails --write writes one; the next
          build shows it here.
        </p>
      </section>
    );
  }
  return (
    <section data-validation="card">
      <h2 className="adminpage-h2">External validation</h2>
      <p className="adminpage-muted">
        Each layer checked against outside references (D23): how many Carta has, how well its ranks agree and
        how many facts match. A hard check that drops below its baseline fails the quality run.
      </p>
      <p className={v.ok ? 'adminpage-ok' : 'adminpage-err'} data-vgate={v.ok ? 'pass' : 'fail'}>
        {v.ok ? 'Every hard check holds at its baseline' : 'A hard check fell below its baseline'}
        {`: ${v.layers.length} ${v.layers.length === 1 ? 'layer' : 'layers'} validated`}
      </p>
      {v.layers.map((l) => (
        <div key={l.layer} data-vlayer={l.layer}>
          <h3 className="adminpage-h2">
            {l.layer}: run of {l.latest}, baseline of {l.baselineAt || 'none'}
          </h3>
          <p className="adminpage-muted">
            {l.sample.sampled
              ? `${l.sample.n} of ${l.referenceN} references sampled in ${l.sample.countries} countries`
              : `all ${l.referenceN} references, ${l.sample.countries} countries`}
            {`; ${l.runs} ${l.runs === 1 ? 'run' : 'runs'} on file; ${l.gaps} largest gaps listed for review.`}
          </p>
          {(l.failures.length > 0 || l.warnings.length > 0) && (
            <ul className="adminpage-keylist" data-validation="breaches">
              {l.failures.map((f) => (
                <li key={`f-${f.metric}`} className="adminpage-err"><code>{f.metric}</code> {f.why}</li>
              ))}
              {l.warnings.map((w) => (
                <li key={`w-${w.metric}`} className="adminpage-muted"><code>{w.metric}</code> {w.why} ({w.kind}, warns only)</li>
              ))}
            </ul>
          )}
          <div className="adminpage-tablewrap" tabIndex={0}>
            <table className="adminpage-table" data-validation="checks">
              <thead>
                <tr><th>check</th><th>kind</th><th>now</th><th>baseline</th><th>items</th><th>status</th><th>trend</th></tr>
              </thead>
              <tbody>
                {l.checks.map((c) => (
                  <tr key={c.metric} data-check={c.metric} data-status={c.status}>
                    <td>{label(c.metric)}</td>
                    <td className="mono">{c.kind}</td>
                    <td className="mono"><b>{fmt(c.metric, c.now)}</b></td>
                    <td className="mono">{fmt(c.metric, c.baseline)}</td>
                    <td className="mono">{l.metrics[c.metric]?.n ?? 'n/a'}</td>
                    <td className={c.status === 'fail' ? 'adminpage-err' : 'mono'}>{c.status}</td>
                    <td><Trend metric={c.metric} series={c.series} name={`${l.layer} ${c.metric}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
