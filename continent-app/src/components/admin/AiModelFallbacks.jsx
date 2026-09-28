// The Gemini model fallback count from migration 028, thirty days.
//
// It was written inline in the overview. T062 gave it its own file so the
// overview reads as a list of sections. Not i18n'd, like the other AI
// sections beside it: this panel has one reader.
export function AiModelFallbacks({ modelReport }) {
  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">AI Model Fallbacks (30 days)</h2>
      {modelReport.totalFallbacks > 0 ? (
        <>
          <p className="adminpage-muted">
            Total fallbacks: <b>{modelReport.totalFallbacks}</b>
          </p>
          <div className="adminpage-cols">
            <section className="adminpage-card">
              <h3 className="adminpage-h3">By Model</h3>
              <ul className="adminpage-bars">
                {Object.entries(modelReport.byModel || {}).map(([model, count]) => {
                  const total = Object.values(modelReport.byModel || {}).reduce((a, b) => a + b, 0);
                  return (
                    <li key={model}>
                      <span className="adminpage-barlabel">{model}</span>
                      <span className="adminpage-bartrack">
                        <span className="adminpage-barfill" style={{ width: `${(count / total) * 100}%` }} />
                      </span>
                      <span className="adminpage-barnum">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </>
      ) : (
        <p className="adminpage-muted">No fallbacks recorded in the last 30 days.</p>
      )}
    </section>
  );
}
