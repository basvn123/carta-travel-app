import React, { useEffect, useRef, useState } from 'react';
import { useI18n, LANGUAGES } from '../../i18n/index.jsx';
import { Button, Chip } from '../../components/ui/index.js';
import { usePaywall } from '../../hooks/usePaywall.jsx';
import { TIERS, daysLeft } from '../../lib/pricing.js';
import { openBillingPortal, cancelYearly, resumeYearly } from '../../lib/billing.js';
import { tabHref } from '../../lib/urlState.js';

/**
 * Your plan, on the Account hub (T461, with T460's billing behind it).
 *
 *   Guest       Free, the one sentence about what is free, and "See Trip
 *               Pass prices" (roadmap 1.15: the block shows for guests too)
 *   Free        the same, with what is left of the free plans
 *   Trip Pass   the days left and the plans left, "Add days or switch"
 *   Yearly      "Renews {date}", the plans left, "Manage payment" (Stripe's
 *               billing page: card, invoices) and "Cancel yearly plan"
 *   Cancelling  "Ends {date}" and "Keep my yearly plan"
 *
 * "Cancel yearly plan" is the online cancellation the terms and the checkout
 * box promise (German BGB 312k): one tap, one sentence to confirm in place,
 * done; the plan runs to the end of the paid year.
 */
export function PlanSection({ balance = null }) {
  const { t, lang } = useI18n();
  const paywall = usePaywall();
  const e = paywall.entitlement;
  const sub = e.subscription;
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [said, setSaid] = useState('');
  const keepRef = useRef(null);
  const cancelRef = useRef(null);
  const headRef = useRef(null);
  // Where focus goes when the confirm closes: back to the control that
  // opened it, or, after a cancel or resume changed the card, to its heading.
  const after = useRef(null);
  useEffect(() => {
    if (ask) { keepRef.current?.focus(); return; }
    const to = after.current;
    after.current = null;
    if (to === 'cancel') cancelRef.current?.focus();
    else if (to === 'head') headRef.current?.focus();
  }, [ask, busy]);

  const locale = (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).bcp47;
  const fmt = (iso) => {
    try { return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)); } catch { return ''; }
  };
  const close = () => { after.current = 'cancel'; setErr(''); setAsk(false); };
  const run = async (key, fn) => {
    setBusy(key);
    setErr('');
    setSaid('');
    const res = await fn();
    // A billing page answer with no address to open is a failure too.
    if (!res.ok || (key === 'portal' && !res.url)) { setBusy(''); setErr(t('account.planFailed')); return; }
    const date = fmt(sub?.renewsAt || e.expiresAt);
    if (key === 'cancel') setSaid(t('account.planCancelled', { date }));
    if (key === 'resume') setSaid(t('account.planResumed', { date }));
    if (key !== 'portal') after.current = 'head';
    setBusy('');
    setAsk(false);
    e.refresh?.();
  };

  // A guest holds the free plan and has no balance to wait for.
  const guest = !paywall.signedIn;
  const tier = guest ? TIERS.free : (TIERS[e.tier] || TIERS.free);
  const free = guest || e.tier === 'free';
  const yearly = e.tier === 'year' && sub?.live;
  const cancelling = yearly && sub.cancelling;
  const left = daysLeft(e.expiresAt);
  const status = !e.known ? null
    : yearly && !cancelling ? t('account.planRenews', { date: fmt(sub.renewsAt || e.expiresAt) })
      : cancelling ? t('account.planEnds', { date: fmt(sub.renewsAt || e.expiresAt) })
        // A Trip Pass states its days in the balance line under the name,
        // so the chip would say it twice; it only appears where the balance
        // carries no days (a paid tier other than trip, should one exist).
        : e.tier !== 'free' && e.tier !== 'trip' && left != null ? t(left === 1 ? 'account.planDaysLeft1' : 'account.planDaysLeftN', { n: left })
          : null;

  return (
    <section className="panel-section acct-plan" aria-labelledby="acct-plan-title">
      <h2 className="acct-group-title" id="acct-plan-title" ref={headRef} tabIndex={-1}>{t('account.planTitle')}</h2>
      <div className="acct-card">
        <div className="acct-plan-head">
          <span className="acct-plan-name">{t(tier.labelKey)}</span>
          {status && <Chip kind="status" tone="neutral">{status}</Chip>}
        </div>
        {free && <p className="acct-plan-free">{t('pass.freeSentence')}</p>}
        {guest ? null : e.known ? balance : <span className="account-pass-status is-loading" aria-hidden="true" />}
        {err && <p className="acct-error" role="alert">{err}</p>}
        <p className="acct-status" role="status">{said}</p>

        {ask ? (
          <div
            className="acct-confirm"
            role="group"
            aria-label={t('account.planCancel')}
            aria-describedby="acct-plan-ask"
            onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } }}
          >
            <p id="acct-plan-ask">{t('account.planCancelAsk', { date: fmt(sub.renewsAt || e.expiresAt) })}</p>
            <div className="acct-confirm-row">
              <Button ref={keepRef} size="sm" onClick={close}>{t('account.planCancelKeep')}</Button>
              <Button size="sm" variant="danger" loading={busy === 'cancel'} onClick={() => run('cancel', cancelYearly)}>
                {t('account.planCancelGo')}
              </Button>
            </div>
          </div>
        ) : (guest || e.known) && (
          <div className="acct-plan-actions">
            {free && (
              <Button onClick={() => paywall.openPrices('browse')}>{t('account.planSee')}</Button>
            )}
            {e.tier === 'trip' && (
              <Button onClick={() => paywall.openPrices('browse')}>{t('account.planAddOrSwitch')}</Button>
            )}
            {cancelling && (
              <Button loading={busy === 'resume'} onClick={() => run('resume', resumeYearly)}>{t('pass.resume')}</Button>
            )}
            {yearly && (
              <Button variant="quiet" loading={busy === 'portal'} onClick={() => run('portal', openBillingPortal)}>
                {t('account.planManage')}
              </Button>
            )}
            {yearly && !cancelling && (
              <Button ref={cancelRef} variant="quiet" className="acct-cancel" onClick={() => { setSaid(''); setAsk(true); }}>{t('account.planCancel')}</Button>
            )}
          </div>
        )}
        {/* Every state ends in one quiet link to the pricing page (T503,
            T497-a): the whole comparison, never a second primary. */}
        {paywall.openPricingPage && (
          <a
            className="acct-plan-all"
            href={tabHref('pricing')}
            onClick={(ev) => {
              if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
              ev.preventDefault();
              paywall.openPricingPage();
            }}
          >
            {t('pass.seeAll')}
          </a>
        )}
      </div>
    </section>
  );
}
