import React, { useState } from 'react';
import { useI18n, LANGUAGES } from '../i18n/index.jsx';
import {
  TIERS, TIER_ORDER, PAID_TIERS, formatPrice, yearPassTripsEquivalent, daysLeft,
} from '../lib/pricing.js';
import { startCheckout } from '../lib/checkout.js';
import { SparkIcon, CheckIcon } from './Icons.jsx';
import { TermsOfService } from './TermsOfService.jsx';

/**
 * What the modal leads with, per reason code. Naming the moment beats a cold
 * "want to pay?", and `sub` replaces the generic lead where a reassurance is
 * worth more than the pitch (nobody's work is lost by a gate).
 *
 * The reason codes themselves live in hooks/usePaywall.jsx; this is only the
 * copy for them, kept here so the modal does not import the hook that mounts
 * it. Every key must exist in all six locales.
 */
const REASON_COPY = {
  plans:     { heading: 'pass.headingPlans' },
  ground:    { heading: 'pass.headingGround' },
  export:    { heading: 'pass.headingExport',    sub: 'pass.subExport' },
  import:    { heading: 'pass.headingImport',    sub: 'pass.subImport' },
  share:     { heading: 'pass.headingShare',     sub: 'pass.subShare' },
  save:      { heading: 'pass.headingSave',      sub: 'pass.subSave' },
  plansLow:  { heading: 'pass.headingPlansLow' },
  celebrate: { heading: 'pass.headingCelebrate' },
  expiring:  { heading: 'pass.headingExpiring' },
};

const FAIL_KEY = {
  auth: 'pass.errSignIn',
  no_auth_config: 'pass.errSignIn',
  no_stripe: 'pass.errUnavailable',
  no_price: 'pass.errUnavailable',
  bad_tier: 'pass.errGeneric',
  stripe_error: 'pass.errGeneric',
  // The pass already runs as far ahead as a pass can go (three years), so
  // the checkout function refused before Stripe charged for nothing.
  pass_max: 'pass.errMax',
  quota_check: 'pass.errUnavailable',
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
  const [termsOpen, setTermsOpen] = useState(false);

  const locale = (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).bcp47;
  const current = entitlement?.tier || 'free';
  const left = daysLeft(entitlement?.expiresAt);

  const buy = async (tier) => {
    if (!signedIn) { onSignIn?.(); return; }
    setFailCode('');
    setBusy(tier);
    const res = await startCheckout(tier, reason);
    if (!res.ok) {
      setFailCode(res.code || 'stripe_error');
      setBusy('');
    }
    // On success the browser is already navigating to Stripe; leaving `busy`
    // set keeps the button from being pressed twice during the handover.
  };

  const copy = REASON_COPY[reason] || {};
  const headingKey = copy.heading || 'pass.heading';
  const leadKey = copy.sub || 'pass.lead';

  return (
    <div className="day-saved-overlay pass-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="day-saved-card pass-card" onClick={(e) => e.stopPropagation()}>
        <button className="day-saved-close" onClick={onClose} aria-label={t('shape.close')} title={t('shape.close')}>×</button>

        <div className="ai-plan-head">
          <span className="ai-plan-badge"><SparkIcon size={15} /></span>
          <h3>{t(headingKey)}</h3>
        </div>
        <p className="ai-plan-lead">{t(leadKey)}</p>

        {current !== 'free' && left != null && (
          <p className="pass-current">{t('pass.current', { name: t(TIERS[current].labelKey), days: left })}</p>
        )}

        {/* The withdrawal waiver, stated BEFORE the buy buttons.
            A pass starts the moment payment lands, so under Article 16(m) of
            the Consumer Rights Directive the 14-day right of withdrawal only
            ends if the buyer asked for immediate access and acknowledged
            losing it. The explicit consent itself is the required checkbox on
            Stripe's own page (consent_collection in the checkout Edge
            Function), and the webhook records the answer against the grant
            (migration 025). This line is here so nobody meets that checkbox
            for the first time with their card details already typed, and so
            the terms can be read before leaving for Stripe. A second checkbox
            on this side would be duplicate friction, not a second consent. */}
        <p className="pass-waiver">
          {t('pass.waiverNote')}
          {' '}
          <button type="button" className="auth-link pass-terms-link" onClick={() => setTermsOpen(true)}>
            {t('pass.legalLink')}
          </button>
        </p>

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
                    className={`pass-buy ${tier.featured ? 'guide-next' : 'pass-buy-quiet'}`}
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
        {/* The contract line. The waiver and the link to the terms now sit
            above the buy buttons (see pass-waiver), where they are read before
            a price is chosen; this keeps the plain statement that buying is
            agreeing, without a second copy of the same link. */}
        <p className="ai-plan-note">{t('pass.legalNote')}</p>
      </div>
      {termsOpen && <TermsOfService onClose={() => setTermsOpen(false)} />}
    </div>
  );
}
