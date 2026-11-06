import { channelWeeksView } from '../../lib/channelCounts.js';

// One weekly number per channel (K12, T1109). Visits counted from the UTM
// source on landing, per day, with no cookie and no identifier. Owner-only,
// so not i18n'd like the cards around it.
export function ChannelCounts({ report }) {
  const view = channelWeeksView(report);
  if (!view) return null;
  const { current, weeks } = view;
  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">Visits by channel (weekly)</h2>
      <p className="adminpage-muted">
        Counted from utm_source on landing. No cookie, no device or session id; a reload counts
        again, and links without a UTM show as "none".
      </p>
      {!current || current.total === 0 ? (
        <p className="adminpage-muted">No visits counted in this window.</p>
      ) : (
        <ul className="adminpage-bars">
          {current.channels.map((c) => (
            <li key={c.channel}>
              <span className="adminpage-barlabel">{c.channel}</span>
              <span className="adminpage-bartrack">
                <span className="adminpage-barfill" style={{ width: `${(c.n / current.total) * 100}%` }} />
              </span>
              <span className="adminpage-barnum">{c.n}</span>
            </li>
          ))}
        </ul>
      )}
      {weeks.length > 1 && (
        <ol className="adminpage-rank">
          {weeks.map((w) => (
            <li key={w.week}>
              <span className="adminpage-rankname">Week of {w.week}</span>
              <span className="adminpage-ranknum">{w.total}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
