import { useI18n } from '../../i18n/index.jsx';
import { Sparkbars } from './Sparkbars.jsx';
import { PaywallFunnel } from './PaywallFunnel.jsx';
import { Margin } from './Margin.jsx';
import { AiUsage } from './AiUsage.jsx';
import { CacheHitRate } from './CacheHitRate.jsx';
import { AiModelFallbacks } from './AiModelFallbacks.jsx';
import { RecentAudit } from './AuditLog.jsx';

// The Overview tab: how is it going. Pure render. Every figure here was
// fetched once at unlock by useOverview and useMargin, which live in the
// shell so that leaving the tab and coming back does not refetch.
export function Overview({ overview, marginDash, audit }) {
  const { t } = useI18n();
  const { stats, analytics, funnel, modelReport, cacheReport, aiUsage } = overview;
  const { margin, marginBack, setMarginBack } = marginDash;
  return (
    <>
      <h1 className="adminpage-h1">{t('admin.nav.overview')}</h1>
      <p className="adminpage-muted">{t('admin.hint')}</p>
      {stats ? (
        <div className="adminpage-tiles">
          <div className="adminpage-tile"><b>{stats.users}</b><span>{t('admin.statUsers')}</span></div>
          <div className="adminpage-tile"><b>{stats.newWeek}</b><span>{t('admin.statNewWeek')}</span></div>
          <div className="adminpage-tile"><b>{stats.newMonth}</b><span>{t('admin.statNewMonth')}</span></div>
          <div className="adminpage-tile"><b>{stats.passesTrip}</b><span>{t('admin.statTrip')}</span></div>
          <div className="adminpage-tile"><b>{stats.passesYear}</b><span>{t('admin.statYear')}</span></div>
          <div className="adminpage-tile"><b>{stats.tripPlans}</b><span>{t('admin.statTrips')}</span></div>
          <div className="adminpage-tile"><b>{stats.dayPlans}</b><span>{t('admin.statDayPlans')}</span></div>
          <div className="adminpage-tile"><b>{stats.aiToday}</b><span>{t('admin.statAiToday')}</span></div>
        </div>
      ) : (
        <p className="adminpage-err">{t('admin.statsFailed')}</p>
      )}

      {analytics && (
        <>
          <h2 className="adminpage-h2">{t('admin.activeTitle')}</h2>
          <p className="adminpage-muted">{t('admin.activeHint')}</p>
          <div className="adminpage-tiles">
            <div className="adminpage-tile"><b>{analytics.activeDay}</b><span>{t('admin.activeDay')}</span></div>
            <div className="adminpage-tile"><b>{analytics.activeWeek}</b><span>{t('admin.activeWeek')}</span></div>
            <div className="adminpage-tile"><b>{analytics.activeMonth}</b><span>{t('admin.activeMonth')}</span></div>
            <div className="adminpage-tile"><b>{analytics.neverSignedIn}</b><span>{t('admin.neverIn')}</span></div>
          </div>

          <div className="adminpage-cols">
            <section className="adminpage-card">
              <h3 className="adminpage-h3">{t('admin.signupsTitle')}</h3>
              {/* Four weeks of signups. A bar per day, scaled to the
                  busiest one, with the count in mono underneath the
                  peak so the shape is never the only information. */}
              <Sparkbars series={analytics.signups || []} />
              <p className="adminpage-muted">
                {t('admin.signupsTotal', {
                  n: (analytics.signups || []).reduce((s, d) => s + (d.n || 0), 0),
                })}
              </p>
            </section>

            <section className="adminpage-card">
              <h3 className="adminpage-h3">{t('admin.providerTitle')}</h3>
              <p className="adminpage-muted">{t('admin.providerHint')}</p>
              <ul className="adminpage-bars">
                {(analytics.providers || []).map((p) => {
                  const top = Math.max(...(analytics.providers || []).map((x) => x.n), 1);
                  return (
                    <li key={p.provider}>
                      <span className="adminpage-barlabel">{p.provider}</span>
                      <span className="adminpage-bartrack">
                        <span className="adminpage-barfill" style={{ width: `${(p.n / top) * 100}%` }} />
                      </span>
                      <span className="adminpage-barnum">{p.n}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <div className="adminpage-cols">
            <section className="adminpage-card">
              <h3 className="adminpage-h3">{t('admin.topDestsTitle')}</h3>
              <p className="adminpage-muted">{t('admin.topDestsHint')}</p>
              {(analytics.topDests || []).length === 0 ? (
                <p className="adminpage-muted">{t('admin.topNone')}</p>
              ) : (
                <ol className="adminpage-rank">
                  {analytics.topDests.map((d) => (
                    <li key={d.id}>
                      <span className="adminpage-rankname">
                        {d.city || d.id}
                        {d.country && <em>{d.country}</em>}
                      </span>
                      <span className="adminpage-ranknum">{d.n}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="adminpage-card">
              <h3 className="adminpage-h3">{t('admin.topCountriesTitle')}</h3>
              {(analytics.topCountries || []).length === 0 ? (
                <p className="adminpage-muted">{t('admin.topNone')}</p>
              ) : (
                <ol className="adminpage-rank">
                  {analytics.topCountries.map((c) => (
                    <li key={c.country}>
                      <span className="adminpage-rankname">{c.country}</span>
                      <span className="adminpage-ranknum">{c.n}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}

      {funnel && !funnel.error && <PaywallFunnel funnel={funnel} t={t} />}

      {margin && !margin.error && (
        <Margin report={margin} monthsBack={marginBack} onMonth={setMarginBack} />
      )}

      {aiUsage && !aiUsage.error && <AiUsage report={aiUsage} />}

      {cacheReport && !cacheReport.error && <CacheHitRate report={cacheReport} />}

      {modelReport && !modelReport.error && <AiModelFallbacks modelReport={modelReport} />}

      <RecentAudit audit={audit} />
    </>
  );
}
