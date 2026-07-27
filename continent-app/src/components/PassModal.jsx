import React, { useState } from 'react';
import { useI18n, LANGUAGES } from '../i18n/index.jsx';
import {
  TIERS, TIER_ORDER, PAID_TIERS, formatPrice, yearPassTripsEquivalent, daysLeft,
} from '../lib/pricing.js';
import { startCheckout } from '../lib/checkout.js';
import { SparkIcon, CheckIcon } from './Icons.jsx';

const FAIL_KEY = {
  auth: 'pass.errSignIn',
  no_auth_config: 'pass.errSignIn',
  no_stripe: 'pass.errUnavailable',
  no_price: 'pass.errUnavailable',
  bad_tier: 'pass.errGeneric',
  stripe_error: 'pass.errGeneric',
  network: 'pass.errNetwork',
};

/**
 * The pass picker. Opened either from the account panel (browsing) or from a
 * spent allowance (the upsell moment), which `reason` distinguishes so the
 * heading can name what just ran out instead of asking a cold "want to pay?".
 *
 * Deliberately NOT a subscription pitch. Both passes are one-off payments and
 * the copy says so, because the thing being sold here is partly the absence of
 * a recurring charge to remember.
 */
export function PassModal({ entitlement, reason = '', onClose, onSignIn, signedIn }) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState('');
  const [failCode, setFailCode] = useState('');

  const locale = (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).bcp47;
  const current = entitlement?.tier || 'free';
  const left = daysLeft(entitlement?.expiresAt);

  const buy = async (tier) => {
    if (!signedIn) { onSignIn?.(); return; }
    setFailCode('');
    setBusy(tier);
    const res = await startCheckout(tier);
    if (!res.ok) {
      setFailCode(res.code || 'stripe_error');
      setBusy('');
    }
    // On success the browser is already navigating to Stripe; leaving `busy`
    // set keeps the button from being pressed twice during the handover.
  };

  const headingKey = reason === 'plans' ? 'pass.headingPlans'
    : reason === 'ground' ? 'pass.headingGround'
      : 'pass.heading';

  return (
    <div className="day-saved-overlay pass-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="day-saved-card pass-card" onClick={(e) => e.stopPropagation()}>
        <button className="day-saved-close" onClick={onClose} aria-label={t('shape.close')} title={t('shape.close')}>×</button>

        <div className="ai-plan-head">
          <span className="ai-plan-badge"><SparkIcon size={15} /></span>
          <h3>{t(headingKey)}</h3>
        </div>
        <p className="ai-plan-lead">{t('pass.lead')}</p>

        {current !== 'free' && left != null && (
          <p className="pass-current">{t('pass.current', { name: t(TIERS[current].labelKey), days: left })}</p>
        )}

        <div className="pass-grid">
          {TIER_ORDER.map((id) => {
            const tier = TIERS[id];
            const isCurrent = id === current;
            const buyable = PAID_TIERS.includes(id);
            return (
              <div key={id} className={`pass-tier ${tier.featured ? 'featured' : ''} ${isCurrent ? 'current' : ''}`}>
                {tier.featured && <span className="pass-flag">{t('pass.mostPopular')}</span>}
                <h4>{t(tier.labelKey)}</h4>
                <div className="pass-price">
                  {tier.priceCents === 0
                    ? t('pass.freePrice')
                    : formatPrice(tier.priceCents, locale)}
                  <small>
                    {id === 'trip' ? t('pass.perTrip') : id === 'year' ? t('pass.perYear') : ''}
                  </small>
                </div>
                <p className="pass-blurb">{t(tier.blurbKey)}</p>
                <ul className="pass-features">
                  <li>
                    <CheckIcon size={11} />
                    {id === 'free'
                      ? t('pass.featPlansFree', { n: tier.aiPlans })
                      : t('pass.featPlansPaid', { n: tier.aiPlans })}
                  </li>
                  <li>
                    <CheckIcon size={11} />
                    {tier.grounded > 0
                      ? t('pass.featSearchOn', { n: tier.grounded })
                      : t('pass.featSearchOff')}
                  </li>
                  {id === 'year' && (
                    <li><CheckIcon size={11} /> {t('pass.featValue', { n: yearPassTripsEquivalent() })}</li>
                  )}
                  {buyable && <li><CheckIcon size={11} /> {t('pass.featOneOff')}</li>}
                </ul>
                {buyable ? (
                  <button
                    className="guide-next pass-buy"
                    disabled={!!busy}
                    onClick={() => buy(id)}
                  >
                    {busy === id ? t('pass.opening') : t('pass.buy')}
                  </button>
                ) : (
                  <div className="pass-buy-placeholder">
                    {isCurrent ? t('pass.yourPlan') : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {failCode && (
          <p className="ai-plan-note ai-plan-note-warn">{t(FAIL_KEY[failCode] || 'pass.errGeneric')}</p>
        )}
        <p className="ai-plan-note">{t('pass.vatNote')}</p>
        <p className="ai-plan-note">{t('pass.noSubNote')}</p>
      </div>
    </div>
  );
}
