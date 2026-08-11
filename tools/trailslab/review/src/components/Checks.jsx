import { useState } from 'react';
import { num, score, stamp } from '../format.js';

// Order the checks the way a reviewer weighs them: the ones that can sink a
// trip first, the popularity signal (which only ranks the queue) last. A
// check name this list has not met yet sorts to the end rather than to the
// top, so a new check added upstream cannot quietly outrank continuity.
const ORDER = ['continuity', 'geometry_sanity', 'elevation_sanity', 'difficulty',
  'completeness', 'portal_agreement', 'gap_repair', 'description_grounding',
  'daytrip_compose', 'popularity'];

const rank = (name) => {
  const i = ORDER.indexOf(name);
  return i === -1 ? ORDER.length : i;
};

const WHAT = {
  continuity: 'Gaps between the assembled member ways, above a 50 m tolerance',
  geometry_sanity: 'Nonzero length, no vertex jumps above 2 km, bbox inside the country',
  elevation_sanity: 'Recomputed distance against the distance tag, grade and ascent plausible',
  difficulty: 'Difficulty derived from distance, ascent and sac_scale, contradictions flagged',
  completeness: 'Name, network and description present in the source tags',
  portal_agreement: 'Match against the official national portal geometry',
  gap_repair: 'Router-spliced repair of the geometry gaps',
  description_grounding: 'Each description sentence mapped back to the field it came from',
  daytrip_compose: 'How the daytrip was sequenced',
  popularity: 'Curation rank: fame, network level, portal agreement and quality',
};

function Check({ check }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="check">
      <button type="button" className="check-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`verdict ${check.passed ? 'pass' : 'fail'}`}>
          {check.passed ? 'pass' : 'fail'}
        </span>
        <span className="name">{check.check_name.replace(/_/g, ' ')}</span>
        <span className="spacer" />
        {check.score != null && <span className="score">{score(check.score)}</span>}
        <span className="muted mono" style={{ fontSize: '11.5px' }}>{stamp(check.run_at)}</span>
        <span className="muted">{open ? 'hide' : 'details'}</span>
      </button>
      {open && (
        <pre>
          {WHAT[check.check_name] ? `${WHAT[check.check_name]}\n\n` : ''}
          {JSON.stringify(check.details, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ChecksCard({ checks, lastValidatedAt }) {
  const latest = [...(checks.latest || [])].sort(
    (a, b) => rank(a.check_name) - rank(b.check_name)
      || a.check_name.localeCompare(b.check_name),
  );
  const failed = latest.filter((c) => !c.passed).length;
  return (
    <section className="card">
      <header>
        <h3>Validation</h3>
        <span className="spacer" />
        <span className="muted mono" style={{ fontSize: '11.5px' }}>
          {failed ? `${failed} of ${latest.length} failing` : `${latest.length} checks passing`}
          {lastValidatedAt ? `, last run ${stamp(lastValidatedAt)}` : ''}
        </span>
      </header>
      {latest.length
        ? latest.map((c) => <Check key={c.check_name} check={c} />)
        : <p className="muted" style={{ padding: '16px' }}>
            No validation has run on this trip yet. Run pipeline/trails/validate.py.
          </p>}
    </section>
  );
}

export function PortalCard({ check, portal, radius }) {
  if (!check) {
    return (
      <section className="card">
        <header><h3>Portal agreement</h3></header>
        <p className="muted" style={{ padding: '16px' }}>
          No crosscheck has run against this country's official portal data.
        </p>
      </section>
    );
  }
  const d = check.details || {};
  const facts = [
    ['Verdict', check.passed ? 'agrees' : 'no match'],
    ['Score', score(check.score)],
    ['Source', d.source || ''],
    ['Closest official name', d.name_best || 'none'],
    ['Name similarity', d.name_sim != null ? num(d.name_sim * 100, 0) + '%' : ''],
    ['Within 60 m', d.coverage_60m != null ? num(d.coverage_60m * 100, 0) + '% of the line' : ''],
    ['Within 150 m', d.coverage_150m != null ? num(d.coverage_150m * 100, 0) + '% of the line' : ''],
    ['Median distance', d.median_dist_m != null ? `${num(d.median_dist_m)} m` : ''],
    ['Length ratio', d.length_ratio != null ? num(d.length_ratio, 2) : ''],
  ].filter(([, v]) => v !== '' && v != null);

  return (
    <section className="card">
      <header>
        <h3>Portal agreement</h3>
        <span className="spacer" />
        <span className={`verdict ${check.passed ? 'pass' : 'fail'}`}>
          {check.passed ? 'pass' : 'fail'}
        </span>
      </header>
      <div className="pad">
        <div className="kv">
          {facts.map(([k, v]) => (
            <div key={k}>
              <div className="k">{k}</div>
              <div className="v">{v}</div>
            </div>
          ))}
        </div>
        {portal && (
          <p className="muted mono" style={{ marginTop: '14px', fontSize: '11.5px' }}>
            {portal.error
              ? `Overlay unavailable: ${portal.error}`
              : `${portal.segments.length} official segments within ${num(radius)} m`
                + `${portal.capped ? ', capped' : ''}`}
          </p>
        )}
        {(d.flags || []).length > 0 && (
          <p style={{ marginTop: '10px', color: 'var(--danger)' }}>
            Flagged: {d.flags.join(', ')}
          </p>
        )}
      </div>
    </section>
  );
}
