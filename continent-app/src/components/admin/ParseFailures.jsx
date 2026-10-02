import { Sparkbars } from './Sparkbars.jsx';

// Booking and itinerary imports that came back unusable, from migration 042
// (T073, admin_parse_failures). Structural failures only: the model's reply
// was not JSON, lacked a key, had the wrong shape or was empty. Counts, never
// a single failure. The AI failure card beside it covers timeouts and
// upstream errors; this one covers replies that arrived and were refused by
// the checks.
//
// Deliberately not i18n'd, like the other owner-only cards in the Overview.
export function ParseFailures({ report }) {
  if (!report || report.error) return null;
  const total = report.total || 0;
  const byKind = report.byKind || [];
  const byCheck = report.byCheck || [];
  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">Import parse failures ({report.days || 7} days)</h2>
      {total === 0 ? (
        <p className="adminpage-muted">No parse failures recorded in this window.</p>
      ) : (
        <>
          <div className="adminpage-tiles">
            <div className="adminpage-tile"><b>{total}</b><span>Failures</span></div>
            <div className="adminpage-tile"><b>{report.users || 0}</b><span>Travellers affected</span></div>
          </div>
          <Sparkbars series={report.daily || []} />
          <div className="adminpage-cols">
            <Breakdown title="By input kind" rows={byKind} labelKey="kind" total={total} />
            <Breakdown title="By failed check" rows={byCheck} labelKey="check" total={total} />
          </div>
          <p className="adminpage-muted">Kept for {report.retentionDays || 30} days.</p>
        </>
      )}
    </section>
  );
}

function Breakdown({ title, rows, labelKey, total }) {
  if (rows.length === 0) return null;
  return (
    <section className="adminpage-card">
      <h3 className="adminpage-h3">{title}</h3>
      <ul className="adminpage-bars">
        {rows.map((r) => (
          <li key={r[labelKey]}>
            <span className="adminpage-barlabel">{r[labelKey]}</span>
            <span className="adminpage-bartrack">
              <span className="adminpage-barfill" style={{ width: `${(r.n / total) * 100}%` }} />
            </span>
            <span className="adminpage-barnum">{r.n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
