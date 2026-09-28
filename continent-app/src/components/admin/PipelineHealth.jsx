// Pipeline health, from migration 041 (T072): when run_pipeline.py last
// finished, which task keys ran, were skipped, failed or soft-failed, a row
// count per natural-feature layer, and the fare model's drift-gate verdict.
//
// The pipeline runs on the owner's laptop today, not on a server anyone else
// watches (Execution/P3, T046 to T048, moved the Hetzner infra code but not
// the run itself). This card is why that stops mattering silently: a run
// that failed, or a run that never happened this week, now shows on a
// screen someone actually opens instead of scrolling past in a terminal.
//
// Deliberately not i18n'd, like CacheHitRate and AiModelFallbacks beside it:
// this panel is owner-only.
export function PipelineHealth({ health }) {
  if (!health || health.error) return null;
  if (!health.hasRun) {
    return (
      <section className="adminpage-card">
        <h2 className="adminpage-h2">Pipeline health</h2>
        <p className="adminpage-muted">
          No run has reported yet. run_pipeline.py writes a row at the end of every run when
          CARTA_SUPABASE_URL and CARTA_SUPABASE_SERVICE_KEY are set on the machine that runs it.
        </p>
      </section>
    );
  }

  const { finishedAt, ageHours, ran, skipped, failed, softFailed, ok, layerCounts, driftGate, destCount } = health;
  const when = new Date(finishedAt);
  const ageLabel = ageHours < 48
    ? `${ageHours.toFixed(1)} hours ago`
    : `${(ageHours / 24).toFixed(1)} days ago`;
  const layers = Object.entries(layerCounts || {});

  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">Pipeline health</h2>
      <p className={ok ? 'adminpage-ok' : 'adminpage-err'}>
        {ok ? 'Last run finished clean' : 'Last run left a failed task'}
        {' - '}{when.toLocaleString()} ({ageLabel})
      </p>

      <div className="adminpage-tiles">
        <div className="adminpage-tile"><b>{destCount ?? '-'}</b><span>Destinations</span></div>
        <div className="adminpage-tile"><b>{ran?.length || 0}</b><span>Tasks ran</span></div>
        <div className="adminpage-tile"><b>{skipped?.length || 0}</b><span>Tasks skipped</span></div>
        <div className="adminpage-tile"><b>{failed?.length || 0}</b><span>Tasks failed</span></div>
      </div>

      {failed?.length > 0 && (
        <p className="adminpage-err">Failed: {failed.join(', ')}</p>
      )}
      {softFailed?.length > 0 && (
        <p className="adminpage-muted">Soft-failed (retries next run): {softFailed.join(', ')}</p>
      )}

      {layers.length > 0 && (
        <div className="adminpage-cols">
          <section className="adminpage-card">
            <h3 className="adminpage-h3">Layer row counts</h3>
            <ol className="adminpage-rank">
              {layers.map(([layer, n]) => (
                <li key={layer}>
                  <span className="adminpage-rankname">{layer}</span>
                  <span className="adminpage-ranknum">{n}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="adminpage-card">
            <h3 className="adminpage-h3">Fare model drift gate</h3>
            {driftGate ? (
              <>
                <p className={driftGate.action === 'retrain' ? 'adminpage-err' : 'adminpage-ok'}>
                  {driftGate.verdict} ({driftGate.action})
                </p>
                <p className="adminpage-muted">
                  Max PSI {driftGate.max_psi} on {driftGate.worst_feature}
                  {driftGate.mape?.now != null && `, MAPE ${(driftGate.mape.now * 100).toFixed(1)}%`}
                </p>
              </>
            ) : (
              <p className="adminpage-muted">
                No drift report in this run. Either fare_model did not run, or no model has trained yet.
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
