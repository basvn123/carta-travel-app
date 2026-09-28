// AI failures the traveller saw as a message, from migration 040 (T071
// wired the writer; this is T071-c, the card that reads it). ai_timeout,
// ai_bad_output, url_unreachable and ai_error, per code, per function and
// per upstream status, over the reported window.
//
// Deliberately not i18n'd, like the other AI sections beside it: this panel
// is owner-only.
export function EdgeErrors({ report }) {
  if (!report || report.error) return null;
  const total = report.total || 0;
  const byCode = report.byCode || [];
  const byFunction = report.byFunction || [];

  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">AI failures ({report.days || 30} days)</h2>
      {total === 0 ? (
        <p className="adminpage-muted">No AI failures recorded in this window.</p>
      ) : (
        <>
          <div className="adminpage-tiles">
            <div className="adminpage-tile"><b>{total}</b><span>Failures</span></div>
            <div className="adminpage-tile"><b>{report.users || 0}</b><span>Travellers affected</span></div>
          </div>

          <div className="adminpage-cols">
            <section className="adminpage-card">
              <h3 className="adminpage-h3">By code</h3>
              <ul className="adminpage-bars">
                {byCode.map((c) => (
                  <li key={c.code}>
                    <span className="adminpage-barlabel">{c.code}</span>
                    <span className="adminpage-bartrack">
                      <span className="adminpage-barfill" style={{ width: `${(c.n / total) * 100}%` }} />
                    </span>
                    <span className="adminpage-barnum">{c.n}</span>
                  </li>
                ))}
              </ul>
            </section>

            {byFunction.length > 0 && (
              <section className="adminpage-card">
                <h3 className="adminpage-h3">By function</h3>
                <ol className="adminpage-rank">
                  {byFunction.map((f) => (
                    <li key={`${f.fn}-${f.code}`}>
                      <span className="adminpage-rankname">{f.fn} / {f.code}</span>
                      <span className="adminpage-ranknum">{f.n}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </>
      )}
    </section>
  );
}
