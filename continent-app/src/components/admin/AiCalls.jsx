import { aiCallsView, fmtMs, fmtUsd, fmtPct } from '../../lib/aiCalls.js';

// Model calls by week (E4, T1139): per feature the calls, failure rate, p50 and
// p95 latency and the estimated cost, plus cost per day. Takes its report as a
// prop; get it with useAiCalls. Staff only.
export function AiCalls({ report, t = (k) => k }) {
  const view = aiCallsView(report);
  if (!view) return null;
  const { weeks, costByDay } = view;
  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">{t('admin.aiCalls.title')}</h2>
      <p className="adminpage-muted">{t('admin.aiCalls.note')}</p>
      {weeks.every((w) => w.calls === 0) ? (
        <p className="adminpage-muted">{t('admin.aiCalls.empty')}</p>
      ) : weeks.map((w) => (
        <div key={w.week}>
          <h3 className="adminpage-h3">{t('admin.aiCalls.week').replace('{week}', w.week)}, {fmtUsd(w.costUsd)}</h3>
          <table className="adminpage-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.aiCalls.feature')}</th>
                <th scope="col">{t('admin.aiCalls.calls')}</th>
                <th scope="col">{t('admin.aiCalls.failRate')}</th>
                <th scope="col">{t('admin.aiCalls.p50')}</th>
                <th scope="col">{t('admin.aiCalls.p95')}</th>
                <th scope="col">{t('admin.aiCalls.cost')}</th>
              </tr>
            </thead>
            <tbody>
              {w.features.map((f) => (
                <tr key={f.feature}>
                  <th scope="row">{f.feature}</th>
                  <td>{f.calls}</td>
                  <td>{fmtPct(f.failRate)}</td>
                  <td>{fmtMs(f.p50)}</td>
                  <td>{fmtMs(f.p95)}</td>
                  <td>{fmtUsd(f.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {costByDay.length > 0 && (
        <>
          <h3 className="adminpage-h3">{t('admin.aiCalls.costByDay')}</h3>
          <ol className="adminpage-rank">
            {costByDay.slice(0, 14).map((d) => (
              <li key={d.day}>
                <span className="adminpage-rankname">{d.day}</span>
                <span className="adminpage-ranknum">{fmtUsd(d.costUsd)}, {d.calls}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
