import React from 'react';
import snapshot from '../../admin/dataHealth.json';
import { Validation } from './Validation.jsx';

// Data health (ROADMAP D2, T1142): the quality scorecard of the shipped data
// and its 90-day trend. scripts/quality/engine.py writes the snapshot at the
// end of every pipeline run (run_pipeline.py hook), after checking the card
// against scripts/quality/rules.yaml, and the next build carries it here.
// Nothing is fetched: what this tab shows is what the build shipped with.
//
// Deliberately not i18n'd, like PipelineHealth and PriceProvenance: this
// panel is owner-only and English-only.

const pct = (v) => (v == null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const pts = (v) => (v == null ? 'n/a' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`);
const day = (s) => (s ? String(s).slice(0, 10) : 'none');

/** One bar per run, scaled 0 to 100%. Never the only carrier: the first and
 *  latest score are written beside it. */
function Trend({ series, label }) {
  if (!series.length) return <span className="adminpage-muted">no runs yet</span>;
  return (
    <div className="adminpage-spark" role="img" data-trend={label} style={{ height: 28, minWidth: 96, maxWidth: 180 }}
      aria-label={`${label}: ${series.map((p) => `${day(p.at)} ${pct(p.v)}`).join(', ')}`}>
      {series.map((p, i) => (
        <span key={`${p.at}-${i}`} className="adminpage-sparkbar" title={`${day(p.at)}: ${pct(p.v)}`}>
          <span style={{ height: `${Math.max((p.v || 0) * 100, 2)}%` }} />
        </span>
      ))}
    </div>
  );
}

export function DataHealth({ data = snapshot, validation }) {
  if (!data?.layers?.length) {
    return (
      <section data-health="empty">
        <h1 className="adminpage-h1">Data health</h1>
        <p className="adminpage-muted">
          No scorecard yet. run_pipeline.py writes one at the end of every run
          (scripts/quality/engine.py --write); the next build shows it here.
        </p>
        <Validation data={validation} />
      </section>
    );
  }
  const { gate = {}, layers, must_see: mustSee = [], trend = { days: 90, points: [] } } = data;
  const points = trend.points || [];
  const series = (layer) => points.filter((p) => p.scores?.[layer] != null)
    .map((p) => ({ at: p.at, v: p.scores[layer] }));
  const failures = gate.failures || [];
  const warnings = gate.warnings || [];
  const moved = mustSee.filter((r) => r.delta_points != null && r.delta_points !== 0);

  return (
    <section data-health="card">
      <h1 className="adminpage-h1">Data health</h1>
      <p className="adminpage-muted">
        Scorecard of the shipped data ({data.public || 'public'}) from the run of {day(data.generated_at)},
        checked against scripts/quality/rules.yaml and compared with the card of {day(gate.baseline_at)}.
        A must-see field that falls by more than 2 points fails the run.
      </p>

      <p className={gate.ok ? 'adminpage-ok' : 'adminpage-err'} data-gate={gate.ok ? 'pass' : 'fail'}>
        {gate.ok ? 'Quality gate passed' : 'Quality gate failed: the run was marked failed'}
        {`: ${gate.rules ?? '-'} rules, ${failures.length} failed, ${warnings.length} warnings`}
      </p>

      <div className="adminpage-tiles">
        <div className="adminpage-tile"><b>{layers.length}</b><span>Layers scored</span></div>
        <div className="adminpage-tile"><b>{gate.rules ?? '-'}</b><span>Rules</span></div>
        <div className="adminpage-tile"><b>{failures.length}</b><span>Hard breaches</span></div>
        <div className="adminpage-tile"><b>{points.length}</b><span>Runs in {trend.days} days</span></div>
      </div>

      {(failures.length > 0 || warnings.length > 0) && (
        <ul className="adminpage-keylist" data-health="breaches">
          {failures.map((f) => (
            <li key={`f-${f.id}`} className="adminpage-err"><code>{f.id}</code> {f.why}</li>
          ))}
          {warnings.map((w) => (
            <li key={`w-${w.id}`} className="adminpage-muted"><code>{w.id}</code> {w.why} (soft, warns only)</li>
          ))}
        </ul>
      )}

      <h2 className="adminpage-h2">The card, and its {trend.days}-day trend</h2>
      <div className="adminpage-tablewrap" tabIndex={0}>
        <table className="adminpage-table" data-health="layers">
          <thead>
            <tr>
              <th>layer</th><th>wire</th><th>records</th><th>completeness</th><th>validity</th>
              <th>freshness (age d)</th><th>accuracy</th><th>score</th><th>trend</th>
            </tr>
          </thead>
          <tbody>
            {layers.map((r) => (
              <tr key={r.layer} data-layer={r.layer}>
                <td className="mono">{r.layer}</td>
                <td className="mono">{r.wire}</td>
                <td className="mono">{r.records}</td>
                <td className="mono">{pct(r.completeness)}</td>
                <td className="mono">{pct(r.validity)}</td>
                <td className="mono">{`${pct(r.freshness)} (${r.age_days == null ? 'n/a' : Math.round(r.age_days)})`}</td>
                <td className="mono">{pct(r.accuracy)}</td>
                <td className="mono"><b>{pct(r.score)}</b></td>
                <td><Trend series={series(r.layer)} label={r.layer} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="adminpage-h2">Must-see fields</h2>
      <p className="adminpage-muted">
        {moved.length
          ? `${moved.length} of ${mustSee.length} moved since the last passing card.`
          : `None of the ${mustSee.length} moved since the last passing card.`}
      </p>
      <div className="adminpage-tablewrap" tabIndex={0}>
        <table className="adminpage-table" data-health="must-see">
          <thead>
            <tr><th>rule</th><th>kind</th><th>share</th><th>previous</th><th>change (points)</th><th>floor</th></tr>
          </thead>
          <tbody>
            {mustSee.map((r) => (
              <tr key={r.id} data-rule={r.id}>
                <td className="mono">{r.id}</td>
                <td className="mono">{r.kind}</td>
                <td className="mono">{pct(r.value)}</td>
                <td className="mono">{pct(r.previous)}</td>
                <td className="mono">{pts(r.delta_points)}</td>
                <td className="mono">{pct(r.min)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* D23 (T1187): the external validation scorecard, beside the D2 card. */}
      <Validation data={validation} />
    </section>
  );
}
