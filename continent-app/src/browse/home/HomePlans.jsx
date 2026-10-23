import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip } from '../../components/ui/index.js';
import { CheckIcon } from '../../components/Icons.jsx';
import { usePaywall } from '../../hooks/usePaywall.jsx';
import { formatMoney } from '../../lib/money.js';
import { TIERS, TIER_ORDER, formatPrice, isRecurring, monthlyCents } from '../../lib/pricing.js';
import { useReveal } from './useHome.js';

/**
 * The plans (T606, owner D9: they stay on the home page; the owner's Linear
 * pricing reference, in Carta's light colours). The free sentence word for
 * word (pass.freeSentence), then the three plans
 * as columns split by hairlines, no boxes: name, price, what it is for, and
 * what it holds as a short tick list. One secondary door opens the prices;
 * the page's one primary stays in the hero.
 */
export function HomePlans() {
  const { t } = useI18n();
  const paywall = usePaywall();
  const reveal = useReveal();
  const lists = {
    free: ['home.free1', 'home.free2', 'home.free3', 'home.free4'].map((k) => t(k)),
    trip: [t('pass.addPlansTrip', { n: TIERS.trip.aiPlans }), t('pass.addExports'), t('pass.addTrips'), t('pass.addImport')],
    year: ['home.year1', 'home.year2'].map((k) => t(k)),
  };
  const per = (tier) => (tier.priceCents ? t(isRecurring(tier.id) ? 'pass.perYearRenews' : 'pass.perOnce') : null);
  const note = (tier) => {
    if (tier.id === 'trip') return t('pass.tripNote', { n: tier.periodDays });
    if (isRecurring(tier.id)) return t('pass.yearNote', { month: formatPrice(monthlyCents(tier.id)) });
    return null;
  };
  return (
    <section className="hv-section hv-plans" aria-labelledby="hv-plans-title" {...reveal}>
      <h2 id="hv-plans-title" className="hv-h2">{t('home.priceTitle')}</h2>
      <p className="hv-lead">{t('pass.freeSentence')}</p>
      <ul className="hv-plan-cols">
        {TIER_ORDER.map((id) => {
          const tier = TIERS[id];
          const p = per(tier);
          const n = note(tier);
          const list = lists[id === 'trip' ? 'trip' : isRecurring(id) ? 'year' : 'free'];
          return (
            <li key={id} className={`hv-plan${tier.featured ? ' is-featured' : ''}`}>
              <span className="hv-plan-top">
                <span className="hv-plan-name">{t(tier.labelKey)}</span>
                {tier.featured && <Chip kind="status" tone="neutral">{t('pass.recommended')}</Chip>}
              </span>
              <span className="hv-plan-price">
                <span className="hv-plan-fig">{tier.priceCents ? formatPrice(tier.priceCents) : formatMoney(0)}</span>
                {p && <span className="hv-plan-per">{p}</span>}
              </span>
              <span className="hv-plan-note">{n || t(tier.blurbKey)}</span>
              <ul className="hv-plan-list">
                {list.map((x) => (
                  <li key={x}><span className="hv-tick" aria-hidden="true"><CheckIcon size={16} /></span><span>{x}</span></li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" className="hv-plans-door" onClick={() => paywall.openPrices('home')}>
        {t('home.priceDoor')}
      </Button>
    </section>
  );
}
