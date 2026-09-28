/**
 * The ai_plan_cache hit rate, from migration 029.
 *
 * This is the cheapest lever the AI side has: a hit costs nothing at Google
 * and answers the traveller immediately, so the rate is read here as money
 * and as latency at once. It is shown three ways because one number cannot
 * answer the question on its own. The headline rate says where we are. The
 * per-version split says whether the last change to the cache key helped,
 * which matters because the key is normalised deliberately (T039 collapsed
 * the group bands, the free-text spelling and the empty fields into v5) and
 * a normalisation that does not move the rate is a normalisation that was
 * wrong about what forks it. The miss list says where to look next: a
 * destination that misses constantly is either genuinely rare traffic or is
 * still forking its key on something nobody has noticed.
 *
 * Deliberately not i18n'd: this panel is owner-only and the section beside it
 * is written the same way. Adding six locale files for one reader would be
 * work with no reader.
 */
export function CacheHitRate({ report }) {
  const lookups = report.lookups || 0;
  const hits = report.hits || 0;
  const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '-');
  const byVersion = report.byVersion || [];
  const misses = report.topMisses || [];

  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">Plan cache hit rate ({report.days || 30} days)</h2>
      {lookups === 0 ? (
        <p className="adminpage-muted">
          No plan-day lookups recorded yet. Logging starts when the function is redeployed.
        </p>
      ) : (
        <>
          <div className="adminpage-tiles">
            <div className="adminpage-tile"><b>{pct(hits, lookups)}</b><span>Served from cache</span></div>
            <div className="adminpage-tile"><b>{hits}</b><span>Cache hits</span></div>
            <div className="adminpage-tile"><b>{lookups - hits}</b><span>Generations bought</span></div>
            <div className="adminpage-tile"><b>{report.freshRows || 0}</b><span>Rows still fresh</span></div>
          </div>
          <p className="adminpage-muted">
            Every hit is a Gemini generation not bought, and a plan the traveller gets
            without waiting. The cache serves a row for seven days, so rows past that
            age count as misses.
          </p>

          {byVersion.length > 0 && (
            <div className="adminpage-cols">
              <section className="adminpage-card">
                <h3 className="adminpage-h3">By cache key version</h3>
                <ol className="adminpage-rank">
                  {byVersion.map((v) => (
                    <li key={v.v}>
                      <span className="adminpage-rankname">v{v.v}</span>
                      <span className="adminpage-ranknum">
                        {pct(v.hits || 0, v.lookups || 0)} of {v.lookups || 0}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              {misses.length > 0 && (
                <section className="adminpage-card">
                  <h3 className="adminpage-h3">Where the misses are</h3>
                  <ol className="adminpage-rank">
                    {misses.map((m) => (
                      <li key={m.destId}>
                        <span className="adminpage-rankname">{m.destId}</span>
                        <span className="adminpage-ranknum">{m.misses}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
