import { hours, km, metres, num, score, stamp } from '../format.js';

const LABEL = {
  distance: 'Distance',
  ascent: 'Ascent',
  descent: 'Descent',
  duration: 'Duration',
};

const show = (field, value) => {
  if (value == null) return 'not set';
  if (field === 'distance') return km(value, 2);
  if (field === 'duration') return hours(value);
  return metres(value);
};

/** What the DEM and the geometry measured, next to what the mapper claimed. */
export function MetricsCard({ trip, comparison }) {
  return (
    <section className="card">
      <header>
        <h3>Metrics against source tags</h3>
        <span className="spacer" />
        <span className="muted mono" style={{ fontSize: '11.5px' }}>
          {num(trip.n_points)} vertices, geometry measures {km(trip.geom_length_m, 2)}
        </span>
      </header>
      <table className="data">
        <thead>
          <tr>
            <th>Measure</th>
            <th style={{ textAlign: 'right' }}>Computed</th>
            <th style={{ textAlign: 'right' }}>Source tag</th>
            <th style={{ textAlign: 'right' }}>Difference</th>
          </tr>
        </thead>
        <tbody>
          {comparison.map((row) => (
            <tr key={row.field}>
              <td>{LABEL[row.field] || row.field}</td>
              <td className="num">{show(row.field, row.computed)}</td>
              <td className="num">
                {row.tag_value == null
                  ? <span className="muted">no {row.tag_key} tag</span>
                  : show(row.field, row.tag_value)}
              </td>
              <td className="num">
                {row.delta_pct == null ? '' : (
                  <span className={`delta ${Math.abs(row.delta_pct) <= 25 ? 'ok' : 'off'}`}>
                    {row.delta_pct > 0 ? '+' : ''}{num(row.delta_pct, 1)}%
                  </span>
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td>Difficulty</td>
            <td className="num wide">{trip.difficulty || <span className="muted">not set</span>}</td>
            <td className="num wide">
              {trip.sac_scale || <span className="muted">no sac_scale tag</span>}
            </td>
            <td className="num" />
          </tr>
          <tr>
            <td>Network</td>
            <td className="num wide">{trip.network || <span className="muted">not set</span>}</td>
            <td className="num wide">
              {(trip.raw_tags || {}).network || <span className="muted">no network tag</span>}
            </td>
            <td className="num" />
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/** The upstream tags verbatim, so a reviewer can check the derivation. */
export function TagsCard({ trip }) {
  const tags = Object.entries(trip.raw_tags || {});
  const gaps = trip.gap_info || {};
  return (
    <section className="card">
      <header>
        <h3>Source tags</h3>
        <span className="spacer" />
        <span className="muted mono" style={{ fontSize: '11.5px' }}>
          {trip.source}
          {trip.source_ref ? ` ${trip.source_ref}` : ''}, {trip.license}
        </span>
      </header>
      {tags.length ? (
        <table className="data">
          <tbody>
            {tags.map(([k, v]) => (
              <tr key={k}>
                <td style={{ width: '180px' }} className="mono">{k}</td>
                <td>{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted" style={{ padding: '16px' }}>No tags kept for this trip.</p>}
      {Object.keys(gaps).length > 0 && (
        <div className="pad" style={{ borderTop: '1px solid var(--rule-soft)' }}>
          <div className="k muted" style={{ fontSize: '11.5px', marginBottom: '6px' }}>
            Assembly notes from ingest
          </div>
          <pre className="mono" style={{ fontSize: '11.5px', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(gaps, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}

/** The repaired geometry, when repair.py routed across the gaps. */
export function RepairCard({ repair }) {
  if (!repair) return null;
  const info = repair.repair_info || {};
  const gaps = info.gaps || [];
  return (
    <section className="card">
      <header>
        <h3>Gap repair</h3>
        <span className="spacer" />
        <span className={`verdict ${repair.repaired ? 'pass' : 'fail'}`}>
          {repair.repaired ? 'auto-accepted' : 'needs a human'}
        </span>
      </header>
      <div className="pad">
        <div className="kv">
          <div>
            <div className="k">Original length</div>
            <div className="v">{km(repair.original_len_m, 2)}</div>
          </div>
          <div>
            <div className="k">Repaired length</div>
            <div className="v">{km(repair.repaired_len_m, 2)}</div>
          </div>
          <div>
            <div className="k">Divergence</div>
            <div className="v">{score(repair.divergence_pct)}%</div>
          </div>
          <div>
            <div className="k">Gaps bridged</div>
            <div className="v">
              {gaps.filter((g) => g.status === 'routed').length} of {gaps.length}
            </div>
          </div>
          <div>
            <div className="k">Repaired at</div>
            <div className="v">{stamp(repair.repaired_at)}</div>
          </div>
          <div>
            <div className="k">Still current</div>
            <div className="v">{repair.fresh ? 'yes' : 'geometry changed since'}</div>
          </div>
        </div>
        <p className="muted" style={{ marginTop: '12px' }}>
          Repaired geometry carries Z = 0, so ascent figures come from the original
          sampling until elevation.py runs again.
        </p>
      </div>
    </section>
  );
}
