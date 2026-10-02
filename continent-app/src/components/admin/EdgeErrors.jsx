// AI failures the traveller saw as a message, from migration 040 (T071
// wired the writer; this is T071-c, the card that reads it). ai_timeout,
// ai_bad_output, url_unreachable and ai_error, per code, per function and
// per upstream status, over the reported window.
//
// Deliberately not i18n'd, like the other AI sections beside it: this panel
// is owner-only.
//
// The rate (T215-d, migration 048) comes from admin_launch_metrics: the AI
// calls the app counted, and the failures above counted over the same days,
// from the first day a call was counted. Client crashes stay off it, as 047
// decided. Without 048, or before the first counted call, the rate is not
// shown at all rather than shown as zero.
const pct = (r) => `${(Number(r) * 100).toFixed(1)}%`;

export function EdgeErrors({ report, calls = null }) {
  if (!report || report.error) return null;
  const total = report.total || 0;
  const byCode = report.byCode || [];
  const byFunction = report.byFunction || [];
  const rated = calls && calls.countedSince && calls.rate != null ? calls : null;

  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">AI failures ({report.days || 30} days)</h2>
      {rated && (
        <>
          <div className="adminpage-tiles">
            <div className="adminpage-tile"><b>{pct(rated.rate)}</b><span>Failure rate</span></div>
            <div className="adminpage-tile"><b>{rated.total}</b><span>AI calls</span></div>
          </div>
          <p className="adminpage-muted">
            {rated.failures} of {rated.total} calls failed since {rated.countedSince}
            {(rated.byFunction || []).filter((f) => f.calls > 0).map((f) => (
              `; ${f.fn} ${pct(f.rate)} of ${f.calls}`
            )).join('')}.
          </p>
        </>
      )}
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
