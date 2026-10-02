import { Sparkbars } from './Sparkbars.jsx';

/**
 * The AI usage rollup, from migration 030.
 *
 * Four questions in one section, in the order an owner actually asks them.
 * How close is the shared daily ceiling to biting. How much of the traffic
 * the cache absorbed. How many people were turned away, and by which cap.
 * Who is spending the most.
 *
 * Plan and ground are kept apart in every one of those, and that separation
 * is the point of the section rather than a detail of it. A plan unit is
 * tokens on Gemini Flash and is effectively free. A ground unit is a billed
 * Google Search query, and on Gemini 3 one grounded generation can run
 * several. A single blended "AI calls" figure would hide the only line item
 * that costs money behind the one that does not, which is exactly the blind
 * spot this section exists to close.
 *
 * The daily percentage is against an assumed ceiling and says so. The real
 * cap is AI_GLOBAL_DAILY_CAP in the Edge Function environment, which SQL
 * cannot read; the RPC reads a site_config mirror if one has been set and
 * otherwise assumes the function default of 200. A percentage against the
 * wrong ceiling is worse than no percentage, so the ceiling it was computed
 * against is printed next to it.
 *
 * Deliberately not i18n'd, the same as CacheHitRate above and for the same
 * reason: this panel has one reader.
 *
 * Self-contained: it takes its report as a prop and holds no state.
 */
export function AiUsage({ report }) {
  const cap = report.globalCap || 200;
  const daily = report.daily || [];
  const plan = report.plan || {};
  const ground = report.ground || {};
  const cache = report.cache || {};
  const rej = report.rejections || {};
  const byTier = report.rejectionsByTier || [];
  const users = report.topUsers || [];
  const peak = report.peakDay;
  const today = report.today || 0;
  const rate = cache.rate == null ? '-' : `${cache.rate}%`;

  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">AI usage ({report.days || 30} days)</h2>

      <div className="adminpage-tiles">
        <div className="adminpage-tile">
          <b>{today}</b><span>Units today of {cap} assumed cap</span>
        </div>
        <div className="adminpage-tile">
          <b>{peak ? peak.n : 0}</b>
          <span>{peak ? `Busiest day, ${peak.day}` : 'No traffic recorded'}</span>
        </div>
        <div className="adminpage-tile">
          <b>{report.daysAtCap || 0}</b><span>Days that reached the cap</span>
        </div>
        <div className="adminpage-tile">
          <b>{rate}</b><span>Served from cache</span>
        </div>
      </div>
      <p className="adminpage-muted">
        The shared daily ceiling lives in the Edge Function environment as
        AI_GLOBAL_DAILY_CAP, where SQL cannot read it, so {cap} is what this
        assumes. Set a site_config key named ai_global_daily_cap to the real
        number if the two ever drift apart.
      </p>

      <div className="adminpage-tiles">
        <div className="adminpage-tile">
          <b>{plan.units || 0}</b><span>Plan units, {plan.users || 0} accounts</span>
        </div>
        <div className="adminpage-tile">
          <b>{ground.units || 0}</b><span>Ground units, {ground.users || 0} accounts</span>
        </div>
        <div className="adminpage-tile">
          <b>{rej.userCap || 0}</b><span>Refused by their own cap</span>
        </div>
        <div className="adminpage-tile">
          <b>{rej.globalCap || 0}</b><span>Refused by the shared cap</span>
        </div>
      </div>
      <p className="adminpage-muted">
        Plan units are tokens on Flash and cost close to nothing. Ground units
        are billed Google Search queries and are the line that moves the bill,
        so the two are never added together. A refusal by a user cap is somebody
        who wanted more than their tier gives. A refusal by the shared cap is
        somebody who was turned away from a generation they had already paid for.
      </p>

      <div className="adminpage-cols">
        <section className="adminpage-card">
          <h3 className="adminpage-h3">Daily consumption</h3>
          {daily.length === 0 ? (
            <p className="adminpage-muted">
              Nothing recorded yet. The daily total ticks on the first AI call.
            </p>
          ) : (
            <>
              <Sparkbars series={daily.map((d) => ({ day: d.day, n: d.n }))} />
              <ul className="adminpage-bars">
                {daily.slice(0, 7).map((d) => (
                  <li key={d.day}>
                    <span className="adminpage-barlabel">{d.day}</span>
                    <span className="adminpage-bartrack">
                      <span className="adminpage-barfill"
                        style={{ width: `${Math.min((d.n / cap) * 100, 100)}%` }} />
                    </span>
                    <span className="adminpage-barnum">{d.n}</span>
                  </li>
                ))}
              </ul>
              <p className="adminpage-muted">
                Bars are scaled to the assumed cap, so a full bar is a day that
                ran out. The list shows the last seven days.
              </p>
            </>
          )}
        </section>

        <section className="adminpage-card">
          <h3 className="adminpage-h3">Refusals by tier</h3>
          {byTier.length === 0 ? (
            <p className="adminpage-muted">
              No refusals recorded. Logging starts when the functions are redeployed.
            </p>
          ) : (
            <ol className="adminpage-rank">
              {byTier.map((r) => (
                <li key={r.tier}>
                  <span className="adminpage-rankname">{r.tier}</span>
                  <span className="adminpage-ranknum">
                    {r.userCap || 0} own, {r.globalCap || 0} shared
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="adminpage-muted">
            Free accounts at their own wall is the offer working. Paid accounts
            at it is an allowance priced wrong.
          </p>
        </section>
      </div>

      <h3 className="adminpage-h3">Heaviest accounts</h3>
      {users.length === 0 ? (
        <p className="adminpage-muted">No AI usage recorded in this window.</p>
      ) : (
        <div className="adminpage-tablewrap">
          <table className="adminpage-table adminpage-table-static">
            <thead>
              <tr>
                <th>Account</th>
                <th>Tier</th>
                <th className="num">Plan</th>
                <th className="num">Ground</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId}>
                  <td>{u.email || u.userId}</td>
                  <td className="mono">{u.tier || 'free'}</td>
                  <td className="num mono">{u.plan || 0}</td>
                  <td className="num mono">{u.ground || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="adminpage-muted">
        Ranked on ground first. An account with a thousand cached plans is not
        the one eating the margin; an account with thirty grounded searches is.
      </p>
    </section>
  );
}
