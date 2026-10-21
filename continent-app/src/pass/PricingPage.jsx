import React, { useEffect, useRef, useState } from 'react';
import { useI18n, LANGUAGES } from '../i18n/index.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { usePageArrival } from '../hooks/usePageArrival.js';
import { PageBar } from '../browse/PageBar.jsx';
import { Button } from '../components/ui/index.js';
import { CheckIcon, PlusIcon } from '../components/Icons.jsx';
import { TermsOfService } from '../components/TermsOfService.jsx';
import { TIERS, formatPrice, monthlyCents, isRecurring } from '../lib/pricing.js';
import { FAIL_KEY, PENDING_PASS_KEY } from '../lib/passMoments.js';
import { startCheckout } from '../lib/checkout.js';
import { resumeYearly } from '../lib/billing.js';
import { CONTACT } from '../lib/contact.js';
import '../styles/72-pricing.css';

/**
 * The pricing page (T497, roadmap 1.15 and 2.18, owner T488-d): a real page
 * at /pricing, the one place the passes are laid out in full. Calm and plain,
 * the way a receipt is: what stays free, what a Trip Pass adds, the two plans
 * with their own figures, and the questions people ask before they pay.
 *
 *   head      the page heading and the one sentence about what is free
 *   compare   two columns, Free and "A Trip Pass adds", one bordered object
 *   plans     the Trip Pass and the yearly plan, each with its one button;
 *             the Trip Pass leads and carries the page's one primary
 *             (T488-g), the yearly plan its secondary
 *   questions what happens after 60 days, do I need an account, cancelling,
 *             a refund, and finding a pass bought on another device
 *
 * Every figure comes from lib/pricing.js through formatPrice (cents, the
 * reader's locale). Buying goes straight to Stripe for a signed-in traveller;
 * a guest signs in first and comes back to the pass sheet with the chosen
 * plan (PENDING_PASS_KEY, read by usePaywall). Nothing on this page opens by
 * itself.
 *
 * Props, all optional so the route can mount it bare:
 *   onBack     leaves the page (default: one step back in history)
 *   backLabel  names where back goes ("Account", "Explore")
 */
const PLAN_ORDER = ['trip', 'year'];

const FREE_ROWS = ['pricing.free1', 'pricing.free2', 'pricing.free3', 'pricing.free4', 'pricing.free5', 'pricing.free6'];

function useDocumentMeta(title, description) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const prevTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content');
    document.title = `${title} | Carta`;
    if (meta) meta.setAttribute('content', description);
    return () => {
      document.title = prevTitle;
      if (meta && prevDesc != null) meta.setAttribute('content', prevDesc);
    };
  }, [title, description]);
}

export default function PricingPage({ onBack = null, backLabel = '' }) {
  const { t, lang } = useI18n();
  const locale = (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).bcp47;
  const paywall = usePaywall();
  const e = paywall.entitlement;
  const signedIn = paywall.signedIn;
  const current = signedIn ? (e.tier || 'free') : 'free';
  const sub = e.subscription;
  const subscribed = current === 'year' && sub?.live && !sub?.cancelling;
  const cancelling = !!(sub?.live && sub?.cancelling);

  const [busy, setBusy] = useState('');
  const [fail, setFail] = useState({ tier: '', code: '' });
  const [checked, setChecked] = useState('');
  const [termsOpen, setTermsOpen] = useState(false);

  const leave = onBack || (() => { if (typeof window !== 'undefined') window.history.back(); });
  const pageRef = useRef(null);
  const backRef = useRef(null);
  const arrivalRef = usePageArrival(pageRef, 'pricing');
  useFocusTrap(pageRef, leave, { initialFocusRef: arrivalRef, enabled: !termsOpen });

  useDocumentMeta(t('pricing.docTitle'), t('pass.freeSentence'));

  // The bar takes over the name once the heading has scrolled away.
  const scrollEl = useRef(null);
  const headEl = useRef(null);
  const [nameOn, setNameOn] = useState(false);
  useEffect(() => {
    const el = headEl.current;
    const root = scrollEl.current;
    if (!el || !root || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setNameOn(!entry.isIntersecting), { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const fmtDate = (iso) => {
    try { return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)); } catch { return ''; }
  };
  const price = (id) => formatPrice(TIERS[id].priceCents, locale);

  // What the traveller holds now, in one line, as Account and the sheet say it.
  const holding = !signedIn || !e.known ? ''
    : current === 'trip' && e.expiresAt ? t('pass.holdTrip', { date: fmtDate(e.expiresAt) })
      : subscribed && sub.renewsAt ? t('pass.holdYear', { date: fmtDate(sub.renewsAt) })
        : cancelling ? t('pass.cancellingNote', { date: fmtDate(sub.renewsAt || e.expiresAt) })
          : current === 'year' && e.expiresAt ? t('pass.holdYearEnds', { date: fmtDate(e.expiresAt) })
            : '';

  const buy = async (tier) => {
    setFail({ tier: '', code: '' });
    if (!signedIn) {
      try { sessionStorage.setItem(PENDING_PASS_KEY, JSON.stringify({ tier, reason: 'pricing' })); } catch { /* private mode */ }
      paywall.signIn?.();
      return;
    }
    setBusy(tier);
    const res = await startCheckout(tier, 'pricing');
    // A good answer leaves the page for Stripe; only a failure comes back.
    if (!res.ok) { setFail({ tier, code: res.code || 'stripe_error' }); setBusy(''); }
  };

  const resume = async () => {
    setFail({ tier: '', code: '' });
    setBusy('year');
    const res = await resumeYearly();
    setBusy('');
    if (!res.ok) { setFail({ tier: 'year', code: res.code || 'stripe_error' }); return; }
    e.refresh?.();
  };

  const recheck = async () => {
    setBusy('check');
    setChecked('');
    await e.refresh?.();
    setBusy('');
    setChecked('done');
  };
  // Announced once the refreshed tier has landed, so it names the new plan.
  const checkedLine = checked ? t('pricing.restoreDone', { name: t((TIERS[current] || TIERS.free).labelKey) }) : '';

  const label = (id) => {
    if (id === 'trip') {
      return current === 'trip'
        ? t('pass.continueAddDays', { n: TIERS.trip.periodDays, price: price('trip') })
        : t('pass.continueTrip', { price: price('trip') });
    }
    return t('pass.continueYear', { price: price('year') });
  };

  const plan = (id) => {
    const tier = TIERS[id];
    const recurring = isRecurring(id);
    const failed = fail.tier === id && fail.code;
    // A running yearly plan is the end of the road: nothing to buy here.
    const action = subscribed ? null
      : id === 'year' && cancelling ? (
        <Button variant="secondary" block loading={busy === 'year'} onClick={resume}>{t('pass.resume')}</Button>
      ) : (
        <Button variant={id === 'trip' ? 'primary' : 'secondary'} block loading={busy === id}
          disabled={!!busy && busy !== id} onClick={() => buy(id)}>
          {label(id)}
        </Button>
      );
    return (
      <article className={`prc-plan${id === 'trip' ? ' is-lead' : ''}`} key={id} aria-labelledby={`prc-plan-${id}`}>
        <h3 className="prc-plan-name" id={`prc-plan-${id}`}>{t(tier.labelKey)}</h3>
        <p className="prc-plan-price">
          <span className="prc-plan-fig">{price(id)}</span>
          <span className="prc-plan-per">{t(recurring ? 'pass.perYearRenews' : 'pass.perOnce')}</span>
        </p>
        <p className="prc-plan-note">
          {recurring
            ? t('pass.yearNote', { month: formatPrice(monthlyCents(id), locale) })
            : t('pass.tripNote', { n: tier.periodDays })}
        </p>
        <p className="prc-plan-blurb">{t(tier.blurbKey)}</p>
        <ul className="prc-plan-lines">
          <li>{t(recurring ? 'pass.addPlansYear' : 'pass.addPlansTrip', { n: tier.aiPlans })}</li>
          <li>{t('pass.addSearches', { n: tier.grounded })}</li>
          {recurring && current === 'trip' && <li>{t('pass.carryOver')}</li>}
        </ul>
        <div className="prc-plan-act">
          {action}
          {failed && <p className="prc-error" role="alert">{t(FAIL_KEY[fail.code] || 'pass.errGeneric')}</p>}
          <p className="prc-legal">{t(recurring ? 'pass.legalYear' : 'pass.legalTrip', { price: price('year') })}</p>
        </div>
      </article>
    );
  };

  const questions = [
    { k: 'after', q: t('pricing.afterQ', { days: TIERS.trip.periodDays }), a: t('pricing.afterA') },
    { k: 'need', q: t('account.fq.needQ'), a: t('account.fq.needA') },
    { k: 'cancel', q: t('account.fq.cancelQ'), a: t('account.fq.cancelA') },
    { k: 'refund', q: t('account.fq.refundQ'), a: t('account.fq.refundA', { email: CONTACT }) },
    { k: 'restore', q: t('pricing.restoreQ'), a: t('pricing.restoreA', { email: CONTACT }), restore: true },
  ];

  return (
    <div className="prc" role="dialog" aria-modal="true" aria-labelledby="prc-title" ref={pageRef}>
      <PageBar
        t={t}
        backLabel={backLabel || t('pricing.back')}
        onBack={leave}
        backRef={backRef}
        name={t('pricing.docTitle')}
        nameOn={nameOn}
      />
      <div className="prc-scroll" ref={scrollEl}>
        <div className="prc-inner">
          <header className="prc-head" ref={headEl}>
            <h1 className="prc-title" id="prc-title">{t('home.priceTitle')}</h1>
            <p className="prc-lead">{t('pass.freeSentence')}</p>
            {holding && <p className="prc-holding">{holding}</p>}
          </header>

          <section className="prc-section" aria-labelledby="prc-compare-title">
            <h2 className="prc-h2" id="prc-compare-title">{t('pricing.compareTitle')}</h2>
            <div className="prc-compare">
              <div className="prc-col">
                <h3 className="prc-col-title">{t('pass.freeName')}</h3>
                <ul className="prc-list">
                  {FREE_ROWS.map((k) => (
                    <li key={k}>
                      <span className="prc-mark" aria-hidden="true"><CheckIcon size={16} /></span>
                      <span>{t(k, { n: TIERS.free.aiPlans })}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="prc-col">
                <h3 className="prc-col-title">{t('pricing.passCol')}</h3>
                <ul className="prc-list">
                  {[
                    t('pass.addExports'),
                    t('pass.addTrips'),
                    t('pass.addPlansTrip', { n: TIERS.trip.aiPlans }),
                    t('pass.addSearches', { n: TIERS.trip.grounded }),
                    t('pass.addImport'),
                  ].map((line) => (
                    <li key={line}>
                      <span className="prc-mark" aria-hidden="true"><PlusIcon size={16} /></span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="prc-section" aria-labelledby="prc-plans-title">
            <h2 className="prc-h2" id="prc-plans-title">{t('pricing.plansTitle')}</h2>
            <div className="prc-plans">
              {PLAN_ORDER.map(plan)}
            </div>
            <p className="prc-keep">{t('pass.keepNote')}</p>
          </section>

          <section className="prc-section" aria-labelledby="prc-q-title">
            <h2 className="prc-h2" id="prc-q-title">{t('pricing.qTitle')}</h2>
            <div className="prc-faq">
              {questions.map((r) => (
                <details className="prc-q" key={r.k}>
                  <summary className="prc-q-sum">{r.q}</summary>
                  <div className="prc-q-body">
                    <p className="prc-q-a">{r.a}</p>
                    {r.restore && (
                      <div className="prc-q-act">
                        {signedIn ? (
                          <Button size="sm" loading={busy === 'check'} onClick={recheck}>{t('pricing.restoreGo')}</Button>
                        ) : (
                          <Button size="sm" onClick={() => paywall.signIn?.()}>{t('pricing.restoreSignIn')}</Button>
                        )}
                        <p className="prc-status" role="status">{busy === 'check' ? '' : checkedLine}</p>
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <p className="prc-foot">
            <a className="prc-terms" href="?legal=terms" onClick={(ev) => { ev.preventDefault(); setTermsOpen(true); }}>{t('pass.terms')}</a>
          </p>
        </div>
      </div>
      {termsOpen && <TermsOfService onClose={() => setTermsOpen(false)} />}
    </div>
  );
}
