import { funnelWeeksView } from '../../lib/funnelCounts.js';

const LABELS = {
  explore_opened: 'Explore opened', place_opened: 'Place opened', plan_started: 'Plan started',
  priced_draft: 'Priced draft reached', trip_saved: 'Trip saved', shared: 'Shared',
};

// The funnel by week (I11, T1129): visits that reached each step, counted per
// day with no cookie and no identifier. Owner-only, so not i18n'd.
export function FunnelCounts({ report }) {
  const view = funnelWeeksView(report);
  if (!view) return null;
  const { current, weeks } = view;
  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">Funnel (weekly)</h2>
      <p className="adminpage-muted">
        Visits that reached each step, once per page load. No cookie, no device or session id, so
        steps are not linked to one person; read the shares as a rough funnel.
      </p>
      {!current || current.steps.every((s) => s.n === 0) ? (
        <p className="adminpage-muted">No steps counted in this window.</p>
      ) : (
        <ul className="adminpage-bars">
          {current.steps.map((s) => (
            <li key={s.step}>
              <span className="adminpage-barlabel">{LABELS[s.step]}</span>
              <span className="adminpage-bartrack">
                <span className="adminpage-barfill" style={{ width: `${Math.min(100, (s.share ?? 0) * 100)}%` }} />
              </span>
              <span className="adminpage-barnum">{s.n}</span>
            </li>
          ))}
        </ul>
      )}
      {weeks.length > 1 && (
        <ol className="adminpage-rank">
          {weeks.map((w) => (
            <li key={w.week}>
              <span className="adminpage-rankname">Week of {w.week}</span>
              <span className="adminpage-ranknum">{w.steps.map((s) => s.n).join(' / ')}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
