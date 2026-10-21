import React, { useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useI18n, LANGUAGES } from '../i18n/index.jsx';
import {
  TIERS, formatPrice, daysLeft, monthlyCents, isRecurring,
} from '../lib/pricing.js';
import { startCheckout } from '../lib/checkout.js';
import { resumeYearly } from '../lib/billing.js';
import { CheckIcon, CloseIcon } from './Icons.jsx';
import { Button, Chip, IconButton } from './ui/index.js';
import { TermsOfService } from './TermsOfService.jsx';
import {
  REASON_COPY, SOFT, initialPick, FAIL_KEY, PENDING_PASS_KEY,
} from '../lib/passMoments.js';
import '../styles/71-pass.css';

/**
 * The pass panel (T460): built to be decided in one look.
 *
 *   1. A heading that names what the Trip Pass gives at this moment, with
 *      the full name (roadmap 1.15 point 5, T497), and a line under it with
 *      the price and the days from pricing.js.
 *   2. Two plans as one radio choice: the Trip Pass, paid once for 60 days,
 *      chosen at a paid moment (T488-g), and Yearly, which renews. The billed
 *      amount is the large figure; the monthly figure is small and only ever
 *      beside it, never instead of it.
 *   3. What the plan adds, in plain numbers, once, only where no line under
 *      the heading says it already.
 *   4. One primary, "Continue to payment". Stripe's page carries the order
 *      button the law words ("Pay" or "Subscribe") and the withdrawal waiver
 *      tick box (checkout function, consent_collection).
 *   5. One line of small print: VAT included, the yearly plan renews until
 *      cancelled, the terms.
 *
 * Free is a line, not a card: it is what the traveller already has.
 */
export { PENDING_PASS_KEY };

export function PassModal({ entitlement, reason = '', onClose, onSignIn, signedIn, initialTier = '' }) {
  const { t, lang } = useI18n();
  const locale = (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).bcp47;
  const current = entitlement?.tier || 'free';
  const subscribed = current === 'year' && entitlement?.subscription?.live && !entitlement?.subscription?.cancelling;
  // Cancelled with paid time left: the answer is to keep it, not to buy a
  // second subscription beside it.
  const cancelling = !!(entitlement?.subscription?.live && entitlement?.subscription?.cancelling);
  const [pick, setPick] = useState(() => initialPick(reason, current, initialTier));
  // The recommended mark only where the sheet itself recommends: an offer
  // nobody asked for. At a paid moment the Trip Pass is chosen, and a chip on
  // the other plan would argue with the choice the sheet just made.
  const recommend = SOFT.has(reason);
  const [busy, setBusy] = useState(false);
  const [failCode, setFailCode] = useState('');
  const [termsOpen, setTermsOpen] = useState(false);
  const cardRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap(cardRef, onClose, { initialFocusRef: closeRef, enabled: !termsOpen });

  const copy = REASON_COPY[reason] || {};
  // Every figure in the heading and the line under it comes from pricing.js.
  const vars = {
    price: formatPrice(TIERS.trip.priceCents, locale),
    days: TIERS.trip.periodDays,
    n: reason === 'plans' ? TIERS.trip.aiPlans : TIERS.trip.grounded,
  };
  // A pass holder who used up the pass's own plans has no free plans to name.
  const headingKey = reason === 'plans' && current !== 'free' ? 'pass.headingPlansUsed' : copy.heading;
  const heading = t(headingKey || 'pass.heading', { n: TIERS.free.aiPlans });
  const left = daysLeft(entitlement?.expiresAt);
  const fmtDate = (iso) => {
    try { return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)); } catch { return ''; }
  };

  const buy = async () => {
    if (!signedIn) {
      try { sessionStorage.setItem(PENDING_PASS_KEY, JSON.stringify({ tier: pick, reason })); } catch { /* private mode */ }
      onSignIn?.();
      return;
    }
    setFailCode('');
    setBusy(true);
    const res = await startCheckout(pick, reason);
    if (!res.ok) { setFailCode(res.code || 'stripe_error'); setBusy(false); }
  };

  const resume = async () => {
    setFailCode('');
    setBusy(true);
    const res = await resumeYearly();
    setBusy(false);
    if (!res.ok) { setFailCode(res.code || 'stripe_error'); return; }
    entitlement?.refresh?.();
    onClose?.();
  };

  const plan = TIERS[pick];
  // What the plan adds, the thing the traveller just reached for first.
  const ADD = {
    plans: t(isRecurring(pick) ? 'pass.addPlansYear' : 'pass.addPlansTrip', { n: plan.aiPlans }),
    ground: t('pass.addSearches', { n: plan.grounded }),
    export: t('pass.addExports'),
    save: t('pass.addTrips'),
    import: t('pass.addImport'),
  };
  // The list only where no line under the heading says what the pass adds:
  // asking for the prices, an offer, a pass running out.
  const first = ADD[reason] ? reason : 'plans';
  const adds = copy.sub ? [] : [first, ...['plans', 'ground', 'export', 'save', 'import'].filter((k) => k !== first)]
    .map((k) => ADD[k]);

  // What the traveller holds now, in one line.
  const holding = current === 'trip' && left != null
    ? t('pass.holdTrip', { date: fmtDate(entitlement.expiresAt) })
    : subscribed && entitlement.subscription.renewsAt
      ? t('pass.holdYear', { date: fmtDate(entitlement.subscription.renewsAt) })
      : current === 'year' && entitlement?.expiresAt
        ? t('pass.holdYearEnds', { date: fmtDate(entitlement.expiresAt) })
        : '';

  return (
    <div className="pass-overlay shell-scrim" onClick={onClose}>
      <div
        className="pass-sheet shell-dialog"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pass-head">
          <h2 className="pass-title" id="pass-title">{heading}</h2>
          <IconButton ref={closeRef} label={t('shape.close')} onClick={onClose}><CloseIcon size={16} /></IconButton>
        </div>
        {copy.sub && <p className="pass-sub">{t(copy.sub, vars)}</p>}
        {holding && <p className="pass-holding">{holding}</p>}

        {subscribed ? (
          <p className="pass-sub">{t('pass.subscribedNote', { date: fmtDate(entitlement.subscription.renewsAt) })}</p>
        ) : cancelling ? (
          <>
            <p className="pass-holding">{t('pass.cancellingNote', { date: fmtDate(entitlement.subscription.renewsAt || entitlement.expiresAt) })}</p>
            {failCode && <p className="pass-error" role="alert">{t(FAIL_KEY[failCode] || 'pass.errGeneric')}</p>}
            <Button variant="primary" block loading={busy} onClick={resume}>{t('pass.resume')}</Button>
          </>
        ) : (
          <>
            <div className="pass-plans" role="radiogroup" aria-label={t('pass.choose')}>
              {['trip', 'year'].map((id) => {
                const tier = TIERS[id];
                const on = pick === id;
                const recurring = isRecurring(id);
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    className={`pass-plan${on ? ' is-selected' : ''}`}
                    onClick={() => setPick(id)}
                    onKeyDown={(e) => {
                      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                        e.preventDefault();
                        setPick(id === 'year' ? 'trip' : 'year');
                        requestAnimationFrame(() => cardRef.current?.querySelector('.pass-plan[aria-checked="true"]')?.focus());
                      }
                    }}
                  >
                    <span className="pass-plan-mark" aria-hidden="true">{on && <CheckIcon size={14} />}</span>
                    <span className="pass-plan-body">
                      <span className="pass-plan-top">
                        <span className="pass-plan-name">{t(tier.labelKey)}</span>
                        {tier.featured && recommend && <Chip kind="status" tone="neutral">{t('pass.recommended')}</Chip>}
                      </span>
                      <span className="pass-plan-price">
                        <span className="pass-plan-fig">{formatPrice(tier.priceCents, locale)}</span>
                        <span className="pass-plan-per">{t(recurring ? 'pass.perYearRenews' : 'pass.perOnce')}</span>
                      </span>
                      <span className="pass-plan-note">
                        {recurring
                          ? t('pass.yearNote', { month: formatPrice(monthlyCents(id), locale) })
                          : t('pass.tripNote', { n: tier.periodDays })}
                      </span>
                      {recurring && current === 'trip' && (
                        <span className="pass-plan-note">{t('pass.carryOver')}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {adds.length > 0 && (
              <div className="pass-adds">
                <h3 className="pass-adds-title">{t('pass.addsTitle')}</h3>
                <ul>
                  {adds.map((a) => <li key={a}><span aria-hidden="true"><CheckIcon size={16} /></span><span>{a}</span></li>)}
                </ul>
              </div>
            )}

            {failCode && <p className="pass-error" role="alert">{t(FAIL_KEY[failCode] || 'pass.errGeneric')}</p>}

            <Button variant="primary" block loading={busy} onClick={buy}>
              {!signedIn ? t('pass.signInToBuy')
                : isRecurring(pick) ? t('pass.continueYear', { price: formatPrice(plan.priceCents, locale) })
                  : current === 'trip' ? t('pass.continueAddDays', { n: plan.periodDays, price: formatPrice(plan.priceCents, locale) })
                    : t('pass.continueTrip', { price: formatPrice(plan.priceCents, locale) })}
            </Button>
            <p className="pass-free">
              {/* The one sentence about what is free (roadmap 1.15 point 6). */}
              {current === 'free' ? `${t('pass.freeSentence')} ` : ''}{t('pass.keepNote')}
            </p>
          </>
        )}

        <p className="pass-legal">
          {t(isRecurring(pick) || subscribed ? 'pass.legalYear' : 'pass.legalTrip', { price: formatPrice(TIERS.year.priceCents, locale) })}
          {' '}
          <a className="pass-terms" href="?legal=terms" onClick={(e) => { e.preventDefault(); setTermsOpen(true); }}>{t('pass.terms')}</a>
        </p>
      </div>
      {termsOpen && <TermsOfService onClose={() => setTermsOpen(false)} />}
    </div>
  );
}
