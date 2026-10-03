import { Sparkbars } from './Sparkbars.jsx';

// Two launch numbers nothing recorded before migration 048 (T315): priced
// trips finished in the wizard (T215-b) and clicks on decorated partner links
// by the sub-ID they carry (T215-c). Per-day counts with no identifier, so
// guests are in them and no traveller can be picked out. The AI call counts
// from the same table feed the rate on the AI failures card instead.
//
// Deliberately not i18n'd, like the AI sections beside it: this panel is
// owner-only.
export function LaunchMetrics({ report }) {
  if (!report || report.error) return null;
  const trips = report.tripsPriced || {};
  const clicks = report.affiliateClicks || {};
  const tripTotal = trips.total || 0;
  const clickTotal = clicks.total || 0;
  const bySurface = trips.bySurface || [];
  const byPartner = clicks.byPartner || [];
  const clickSurfaces = clicks.bySurface || [];
  const surfaceN = (s) => (bySurface.find((x) => x.surface === s) || {}).n || 0;

  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">Priced trips and partner clicks ({report.days || 30} days)</h2>
      <p className="adminpage-muted">
        Counted per day with no identifier, guests included. A priced trip is a finished trip
        wizard. A click is a followed partner link inside the app; links in an exported PDF are
        not counted.
      </p>
      <div className="adminpage-tiles">
        <div className="adminpage-tile"><b>{tripTotal}</b><span>Priced trips</span></div>
        <div className="adminpage-tile"><b>{surfaceN('built')}</b><span>Built in the wizard</span></div>
        <div className="adminpage-tile"><b>{surfaceN('ready')}</b><span>From a ready journey</span></div>
        <div className="adminpage-tile"><b>{clickTotal}</b><span>Partner clicks</span></div>
      </div>

      <div className="adminpage-cols">
        <section className="adminpage-card">
          <h3 className="adminpage-h3">Priced trips per day</h3>
          {tripTotal === 0 ? (
            <p className="adminpage-muted">No priced trips counted in this window.</p>
          ) : (
            <Sparkbars series={trips.daily || []} />
          )}
        </section>

        <section className="adminpage-card">
          <h3 className="adminpage-h3">Clicks by partner</h3>
          {clickTotal === 0 ? (
            <p className="adminpage-muted">No partner clicks counted in this window.</p>
          ) : (
            <ul className="adminpage-bars">
              {byPartner.map((p) => (
                <li key={p.partner}>
                  <span className="adminpage-barlabel">{p.partner}</span>
                  <span className="adminpage-bartrack">
                    <span className="adminpage-barfill" style={{ width: `${(p.n / clickTotal) * 100}%` }} />
                  </span>
                  <span className="adminpage-barnum">{p.n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {clickSurfaces.length > 0 && (
        <section className="adminpage-card">
          <h3 className="adminpage-h3">Clicks by surface</h3>
          <ol className="adminpage-rank">
            {clickSurfaces.map((s) => (
              <li key={`${s.partner}-${s.surface}`}>
                <span className="adminpage-rankname">{s.partner} / {s.surface}</span>
                <span className="adminpage-ranknum">{s.n}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
