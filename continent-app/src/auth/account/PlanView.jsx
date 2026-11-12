import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip } from '../../components/ui/index.js';
import { CheckIcon } from '../../components/Icons.jsx';
import { TIERS, TIER_ORDER, formatPrice } from '../../lib/pricing.js';
import { fmtDate } from './parts.jsx';

/**
 * Plan (T935, the owner-approved spec): the plan held, its price and when it
 * ends, the allowances Carta counts, Change plan, and the plans from the real
 * catalogue (lib/pricing.js TIERS, the client mirror of plan_tiers).
 *
 * Both passes are one payment that runs to its end date and never renews
 * (decision 0010, ROADMAP I-f), so there is nothing to cancel: the Cancel
 * screen, resume and the Stripe portal went with the subscription.
 *
 *   entitlement  useEntitlement's shape (or the ?accountmock fixture's)
 */
function Meter({ label, used, cap, resetsAt, locale }) {
  const { t } = useI18n();
  if (!(cap > 0)) return null;
  const share = Math.max(0, Math.min(1, used / cap));
  const value = resetsAt
    ? t('ac.usedOfResets', { used, cap, date: fmtDate(resetsAt, locale) })
    : t('ac.usedOf', { used, cap });
  return (
    <div className="ac-meter">
      <div className="ac-meter-row">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <span className="ac-meter-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${share})` }} />
      </span>
    </div>
  );
}

const FEATURES = {
  free: (t, x) => [t('pass.addPlansTrip', { n: x.aiPlans })],
  trip: (t, x) => [
    t('pass.addPlansTrip', { n: x.aiPlans }), t('pass.addSearches', { n: x.grounded }),
    t('pass.addExports'), t('pass.addTrips'),
  ],
  year: (t, x) => [
    t('pass.addPlansYear', { n: x.aiPlans }), t('pass.addSearches', { n: x.grounded }),
    t('pass.addExports'), t('pass.addTrips'),
  ],
};

export function PlanView({ head, entitlement: e, onChangePlan }) {
  const { t, lang, languages } = useI18n();
  const locale = (languages.find((l) => l.code === lang) || languages[0]).bcp47;
  const tierKey = TIERS[e.tier] ? e.tier : 'free';
  const tier = TIERS[tierKey];
  const when = e.known && tierKey !== 'free' && e.expiresAt
    ? t('ac.until', { date: fmtDate(e.expiresAt, locale) }) : '';
  const unit = (key) => (key === 'free' ? '' : t('pass.perOnce'));

  return (
    <>
      {head}
      {!e.known ? (
        <div className="ac-plancard is-loading" aria-hidden="true" />
      ) : (
        <section className="ac-plancard" aria-labelledby="ac-plan-name">
          <div className="ac-plan-hd">
            <span className="ac-plan-name">
              <b id="ac-plan-name">{t(tier.labelKey)}</b>
              {tierKey !== 'free' && <span>{formatPrice(tier.priceCents, locale)} {unit(tierKey)}</span>}
            </span>
            {when && <Chip kind="status" tone="neutral">{when}</Chip>}
          </div>
          {tierKey === 'free' && <p className="ac-plan-free">{t('pass.freeSentence')}</p>}
          {/* No reset date: a pass ends rather than refills, and Free's two
              plans are once for the life of the account. */}
          <Meter label={t('ac.meterPlans')} used={e.plansUsed} cap={e.plansCap} locale={locale} />
          <Meter label={t('ac.meterSearches')} used={e.groundUsed} cap={e.groundCap} locale={locale} />
          <div className="ac-plan-acts">
            <Button onClick={onChangePlan}>{t('ac.changePlan')}</Button>
          </div>
        </section>
      )}

      <section className="ac-group" aria-labelledby="ac-plans-h">
        <h2 className="ac-group-h" id="ac-plans-h">{t('ac.allPlans')}</h2>
        <div className="ac-plans">
          {TIER_ORDER.map((key) => {
            const x = TIERS[key];
            const mine = e.known && key === tierKey;
            return (
              <div key={key} className={`ac-pc${mine ? ' is-mine' : ''}`}>
                <div className="ac-pc-hd">
                  <b>{t(x.labelKey)}</b>
                  {mine ? <Chip kind="status" tone="neutral">{t('ac.yours')}</Chip>
                    : x.featured ? <Chip kind="status" tone="neutral">{t('pass.recommended')}</Chip> : null}
                </div>
                <span className="ac-pc-p">
                  {formatPrice(x.priceCents, locale)}
                  {key !== 'free' && <small>{key === 'trip' ? t('pass.tripNote', { n: x.periodDays }) : unit(key)}</small>}
                </span>
                <ul>
                  {FEATURES[key](t, x).map((f) => <li key={f}><CheckIcon size={16} />{f}</li>)}
                </ul>
                {!mine && key !== 'free' && (
                  <Button size="sm" onClick={onChangePlan}>{t('ac.choose')}</Button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
