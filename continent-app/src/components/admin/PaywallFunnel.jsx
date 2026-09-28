// GATES only for its hard/soft kind, as a fallback when the RPC still answers
// the pre-027 shape (no `kind` on each reason). See PaywallFunnel's kindOf.
import { GATES } from '../../hooks/usePaywall.jsx';
import { Sparkbars } from './Sparkbars.jsx';

/**
 * The pass funnel, thirty days.
 *
 * Reads top to bottom as the journey itself: how many people were asked, how
 * many walked away, how many pressed buy, how many actually hold a pass. The
 * two rates between them are the only numbers that say whether a change to
 * the gates or the price did anything.
 *
 * Guests are called out rather than folded in. They can be shown an offer but
 * cannot be followed to a purchase, so a conversion rate that quietly includes
 * them in the denominator understates every gate.
 */
export function PaywallFunnel({ funnel, t }) {
  const shown = funnel.shown || 0;
  const checkout = funnel.checkout || 0;
  const bought = funnel.purchased || 0;
  const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '-');
  const reasons = funnel.byReason || [];
  const kinds = funnel.byKind || [];
  // byKind and the conversionRate per reason are only on the RPC from
  // migration 027. An admin panel talking to a project still on 022 (or one
  // where 027 has not been pasted into the SQL editor yet) gets the older
  // shape back, and reading r.kind off it would be undefined for every row.
  // Falling back to the client-side GATES kind keeps the badge correct either
  // way instead of showing a blank.
  const kindOf = (reason) => (GATES[reason]?.kind === 'soft' ? 'soft' : 'hard');

  return (
    <>
      <h2 className="adminpage-h2">{t('admin.funnelTitle')}</h2>
      <p className="adminpage-muted">{t('admin.funnelHint', { days: funnel.days || 30 })}</p>
      <div className="adminpage-tiles">
        <div className="adminpage-tile"><b>{shown}</b><span>{t('admin.funnelShown')}</span></div>
        <div className="adminpage-tile"><b>{funnel.dismissed || 0}</b><span>{t('admin.funnelDismissed')}</span></div>
        <div className="adminpage-tile"><b>{checkout}</b><span>{t('admin.funnelCheckout')}</span></div>
        <div className="adminpage-tile"><b>{bought}</b><span>{t('admin.funnelBought')}</span></div>
        <div className="adminpage-tile"><b>{pct(checkout, shown)}</b><span>{t('admin.funnelRateOffer')}</span></div>
        <div className="adminpage-tile"><b>{pct(bought, checkout)}</b><span>{t('admin.funnelRatePaid')}</span></div>
      </div>
      {!!funnel.shownGuest && (
        <p className="adminpage-muted">
          {t('admin.funnelGuests', { n: funnel.shownGuest, pct: pct(funnel.shownGuest, shown) })}
        </p>
      )}

      {kinds.length > 0 && (
        <div className="adminpage-tiles adminpage-tiles-kind">
          {kinds.map((k) => (
            <div className="adminpage-tile" key={k.kind}>
              <b>{k.conversionRate != null ? `${k.conversionRate}%` : pct(k.bought || 0, k.shown || 0)}</b>
              <span>{t(k.kind === 'soft' ? 'admin.funnelKindSoft' : 'admin.funnelKindHard', { n: k.shown || 0 })}</span>
            </div>
          ))}
        </div>
      )}
      <p className="adminpage-muted">{t('admin.funnelKindHint')}</p>

      <div className="adminpage-cols">
        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.funnelByGate')}</h3>
          {reasons.length === 0 ? (
            <p className="adminpage-muted">{t('admin.funnelEmpty')}</p>
          ) : (
            <ol className="adminpage-rank">
              {reasons.map((r) => {
                const kind = r.kind || kindOf(r.reason);
                const rate = r.conversionRate != null ? `${r.conversionRate}%` : pct(r.bought || 0, r.shown || 0);
                return (
                  <li key={r.reason}>
                    <span className="adminpage-rankname">
                      {r.reason}
                      <span className={`adminpage-kindtag adminpage-kindtag-${kind}`}>
                        {t(kind === 'soft' ? 'admin.funnelKindTagSoft' : 'admin.funnelKindTagHard')}
                      </span>
                      <em>{rate} {t('admin.funnelRateGate')}</em>
                    </span>
                    <span className="adminpage-ranknum">
                      {r.shown} / {r.checkout}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="adminpage-muted">{t('admin.funnelByGateHint')}</p>
        </section>

        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.funnelDaily')}</h3>
          <Sparkbars series={(funnel.daily || []).map((d) => ({ day: d.day, n: d.shown }))} />
          <p className="adminpage-muted">{t('admin.funnelDailyHint')}</p>
        </section>
      </div>
    </>
  );
}
