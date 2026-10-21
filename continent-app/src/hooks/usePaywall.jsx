/**
 * usePaywall, the one door between a free traveller and a paid surface.
 *
 * Before this existed the pass modal was mounted in three places and opened
 * from four, each with its own idea of when to ask. Every rule about
 * frequency, dismissal and hard-versus-soft now lives here instead of being
 * rediscovered at each call site.
 *
 * A call site asks one question and gets a boolean:
 *
 *     if (!paywall.require('export')) return;   // gate opened, stop here
 *     openDayPlanPdf(...)                       // allowed, carry on
 *
 * WHAT THIS DOES AND DOES NOT ENFORCE. Exports, imports and saves are built
 * in the browser, so the browser is the only place they can be gated. Someone
 * determined can bypass this with devtools, and that is fine: the gate exists
 * to ask people who would happily pay, not to defeat people who would not.
 * The surfaces that cost real money (Carta bot plans, grounded search) are
 * still enforced server-side by ai_consume, which this file never touches.
 *
 * HARD versus SOFT. A hard gate always opens, every time, because a button
 * that silently does nothing reads as a bug. A soft gate is a suggestion: it
 * fires at most once a session, never twice for the same reason inside a
 * month, and never at all for somebody who already pays.
 */
import React, {
  createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, Suspense, lazy,
} from 'react';
import { useEntitlement } from './useEntitlement.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { authConfigured } from '../lib/supabaseClient.js';
// The panel and its stylesheet load when it first opens (T460), not with the app.
const PassModal = lazy(() => import('../components/PassModal.jsx').then((m) => ({ default: m.PassModal })));
import {
  trackPaywall, trackPaywallOnExit, isLeavingForCheckout,
} from '../lib/paywallEvents.js';
import { E2E_SEAMS } from '../lib/e2eSeams.js';

/**
 * Every reason the pass modal can open, and how insistent each one is.
 *
 * `kind` is the only thing decided here. The copy each reason leads with
 * lives in REASON_COPY in lib/passMoments.js (T497), because the modal
 * must not import the hook that mounts it. Adding a reason means adding its
 * heading there and to all six locales.
 */
// Gates asked only when a metered allowance is spent or nearly spent.
const QUOTA_REASONS = new Set(['plans', 'ground', 'plansLow']);

export const GATES = {
  // Hard gates: the traveller pressed something that needs a pass. Every PDF
  // is one (T488-a: the trip, the day, the destination and every item page
  // through useItemPdf); the calendar and map files name themselves.
  // Planning together and a second share link are free (T488-b), so there is
  // no 'share' gate any more.
  export:    { kind: 'hard' },
  exportCal: { kind: 'hard' },
  exportMap: { kind: 'hard' },
  import:    { kind: 'hard' },
  save:      { kind: 'hard' },
  plans:     { kind: 'hard' },
  ground:    { kind: 'hard' },
  // Soft gates: nothing was blocked, this is an offer. Only the two that
  // inform: a plan left, a pass nearly up. The offer after a first trip
  // ("celebrate") is gone (T488-c): it opened while nothing paid was tapped.
  plansLow:  { kind: 'soft' },
  expiring:  { kind: 'soft' },
  // Browsing the prices on purpose, from Account, Home or an AI allowance.
  browse:    { kind: 'hard' },
};

/** How long a dismissed soft prompt stays dismissed. */
const SNOOZE_DAYS = 30;
const SNOOZE_KEY = 'carta.paywall.snooze.v1';
/** One soft prompt per session, whatever the reason. */
const SESSION_KEY = 'carta.paywall.softShown.v1';

function readSnooze() {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' ? obj : {};
  } catch { return {}; }
}

function writeSnooze(next) {
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
}

function softAlreadyShown() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

function markSoftShown() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* private mode */ }
}

const PaywallContext = createContext(null);

/**
 * Mounts once, high in the tree, and owns three things: the single ai_status
 * read, the modal, and the frequency rules.
 *
 * `onSignIn` is handed down rather than reached for through context because
 * the auth modal lives in App's own state, and a paywall that could open the
 * sign-in sheet by itself would be a second door into the same flow.
 */
// ?paymock verify seam, same precedent as ?savedmock, ?sharemock, ?badgemock
// and ?provmock. A headless harness cannot sign in and cannot hold an
// entitlement, so every gated action (the GPX export, the KML, the PDF) opens
// a paywall dialog instead of doing anything, and the check that was meant to
// prove the GPX is one continuous track proves only that the paywall works.
//
// Read once at module load and only from the query string, so it cannot be
// reached by a link somebody shares, cannot persist, and is invisible to a
// build that never sets it. The server enforces the metered surfaces
// regardless of what this returns, which is why a client-side seam is safe
// here at all.
const PAY_MOCK = E2E_SEAMS && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('paymock');


export function PaywallProvider({ children, onSignIn, onOpenPricing }) {
  const { user } = useAuth();
  const entitlement = useEntitlement();
  const [reason, setReason] = useState('');
  // Set while a hard gate is open so closing it does not also count as
  // "the soft prompt for this session has been used".
  const openedHard = useRef(false);

  const signedIn = !!user && authConfigured;
  // A guest who chose a plan and was sent to sign in comes back to it.
  const [initialTier, setInitialTier] = useState('');
  useEffect(() => {
    if (!signedIn) return;
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('carta.pendingPass') || 'null'); } catch { /* none */ }
    if (!pending) return;
    try { sessionStorage.removeItem('carta.pendingPass'); } catch { /* private mode */ }
    setInitialTier(pending.tier === 'trip' ? 'trip' : 'year');
    openedHard.current = true;
    setReason(GATES[pending.reason] ? pending.reason : 'browse');
  }, [signedIn]);

  // Counted here rather than at each call site: require(), nudge() and
  // openPrices() are three doors into one modal, and a funnel that depends on
  // all three remembering to report is a funnel that silently loses a door.
  // The tier travels with the event so "who is being asked" is answerable
  // without joining anything.
  //
  // Keyed on the reason having CHANGED, not merely on the effect running. The
  // tier is in the dependency list because the event carries it, and without
  // this ref a tier arriving late (the ai_status read resolving while the
  // modal stands open) would report the same offer a second time and inflate
  // the top of the funnel against a checkout count that cannot move.
  const reportedReason = useRef('');
  // Set once this opening's dismissal has been sent from pagehide, so a page
  // restored from the back-forward cache and then closed by hand does not
  // count the same offer as dismissed twice.
  const exitReported = useRef(false);
  useEffect(() => {
    if (!reason) { reportedReason.current = ''; return; }
    if (reportedReason.current === reason) return;
    reportedReason.current = reason;
    exitReported.current = false;
    trackPaywall('shown', reason, entitlement.tier);
  }, [reason, entitlement.tier]);

  // A modal left open through a tab close, a reload or a typed address never
  // reaches handleClose, so pagehide counts it (T314, row T265-b). Skipped
  // when the page is leaving for Stripe: that is a checkout, already counted
  // by startCheckout, not a dismissal. The request is a keepalive fetch built
  // in paywallEvents.js, because supabase-js does not survive the unload.
  useEffect(() => {
    if (!reason || typeof window === 'undefined') return undefined;
    const onHide = () => {
      if (exitReported.current || isLeavingForCheckout()) return;
      exitReported.current = true;
      trackPaywallOnExit('dismissed', reason, entitlement.tier);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [reason, entitlement.tier]);

  /**
   * True when the traveller may use paid surfaces.
   *
   * Fails OPEN when the status read did not land. Blocking somebody who has
   * paid because an RPC timed out is a far worse mistake than letting a free
   * traveller export one PDF, and the metered surfaces are enforced on the
   * server regardless of what this says.
   */
  const paid = useMemo(() => {
    if (PAY_MOCK) return true;
    if (!signedIn) return false;
    if (entitlement.loading) return true;
    if (!entitlement.known) return true;
    return entitlement.tier !== 'free';
  }, [signedIn, entitlement.loading, entitlement.known, entitlement.tier]);

  const close = useCallback(() => {
    setReason('');
    // A plan chosen before signing in applies to that one opening only.
    setInitialTier('');
    openedHard.current = false;
    entitlement.refresh();
  }, [entitlement]);

  /**
   * Ask permission for a paid surface. Returns true to proceed.
   *
   * Always opens the modal when it returns false, so a call site never has to
   * decide whether to explain itself.
   */
  const require = useCallback((why) => {
    // A paying traveller passes every gate except the ones that are only
    // asked when an allowance has run out or is about to (T460): those used
    // to return true for anyone who paid, so "See passes" did nothing for the
    // one person most likely to buy again.
    if (paid && !(QUOTA_REASONS.has(why) && entitlement.known)) return true;
    const gate = GATES[why] || GATES.browse;
    openedHard.current = gate.kind === 'hard';
    setReason(why);
    return false;
  }, [paid, entitlement.known]);

  /**
   * Offer a pass without blocking anything. Returns true if the prompt was
   * actually shown, which callers can use to avoid stacking their own toast
   * on top of it.
   */
  const nudge = useCallback((why) => {
    if (paid || !GATES[why]) return false;
    if (softAlreadyShown()) return false;
    const snooze = readSnooze();
    if (snooze[why] && Date.now() < snooze[why]) return false;
    markSoftShown();
    openedHard.current = false;
    setReason(why);
    return true;
  }, [paid]);

  /**
   * Open the price table because somebody asked to see it.
   *
   * Takes an optional reason so a paying traveller can open the modal for a
   * named moment: the expiry banner passes 'expiring', so the heading says
   * the pass is nearly up and the funnel sees that gate (T265). require()
   * cannot do this, because it returns true for anyone who already pays.
   * Opened by a press, so it never earns a snooze.
   */
  const openPrices = useCallback((why = 'browse') => {
    openedHard.current = true;
    setReason(typeof why === 'string' && GATES[why] ? why : 'browse');
  }, []);

  const handleClose = useCallback(() => {
    // Only counted on a real dismissal. Buying navigates the whole page to
    // Stripe, so this never runs for somebody who paid, and signing in goes
    // through close() rather than here. A dismissal already sent from
    // pagehide (the page went into the back-forward cache and came back)
    // is not sent again.
    if (reason && !exitReported.current) trackPaywall('dismissed', reason, entitlement.tier);
    // Only a soft prompt earns a snooze. Dismissing a hard gate means "not
    // now, I did not want that button", not "stop offering me this".
    if (reason && !openedHard.current && GATES[reason]?.kind === 'soft') {
      writeSnooze({ ...readSnooze(), [reason]: Date.now() + SNOOZE_DAYS * 86400000 });
    }
    close();
  }, [reason, close, entitlement.tier]);

  // `signIn` is App's own door (the onSignIn it hands this provider), passed
  // on so a surface with no prop chain to App, the upload dialog on a trail
  // page, can offer "Sign in" instead of a dead end (T390, brief V3-12). It is
  // the same door, not a second one: App still owns the sign-in sheet.
  const signIn = useCallback(() => { onSignIn?.(); }, [onSignIn]);
  // The pricing page, App's own door like signIn (T503, T497-a): "See all
  // prices" under Account's Your plan and under the pass sheet. Null where no
  // App hands one in, so a surface draws no link it cannot follow.
  // Held in a ref: App hands in a fresh arrow each render, and the context
  // value must not change with it.
  const pricingRef = useRef(onOpenPricing);
  pricingRef.current = onOpenPricing;
  const hasPricing = typeof onOpenPricing === 'function';
  const goPricing = useCallback(() => { pricingRef.current?.(); }, []);
  const openPricingPage = hasPricing ? goPricing : null;
  const value = useMemo(() => ({
    paid, signedIn, entitlement, reason,
    require, nudge, openPrices, close, signIn, openPricingPage,
    tier: entitlement.tier,
  }), [paid, signedIn, entitlement, reason, require, nudge, openPrices, close, signIn, openPricingPage]);

  return (
    <PaywallContext.Provider value={value}>
      {children}
      {reason && (
        <div onClick={(e) => e.stopPropagation()}>
          <Suspense fallback={null}>
            <PassModal
              entitlement={entitlement}
              reason={reason}
              signedIn={signedIn}
              initialTier={initialTier}
              onClose={handleClose}
              onSignIn={() => { close(); onSignIn?.(); }}
              onSeeAll={openPricingPage ? () => { handleClose(); openPricingPage(); } : null}
            />
          </Suspense>
        </div>
      )}
    </PaywallContext.Provider>
  );
}

/**
 * Read the paywall from anywhere under the provider.
 *
 * Degrades to "everything is allowed" outside a provider rather than
 * throwing, so a component rendered in isolation (a test, a storybook page,
 * the shared-trip view) is never gated by accident.
 */
export function usePaywall() {
  const ctx = useContext(PaywallContext);
  return ctx || FALLBACK;
}

const FALLBACK = {
  paid: true,
  signedIn: false,
  // Shaped like a real entitlement, never null: consumers read .tier and
  // .plansLeft straight off it, and a null here would crash the one case this
  // fallback exists to keep alive.
  entitlement: {
    tier: 'free', expiresAt: null, resetsAt: null,
    plansUsed: 0, plansCap: 0, plansLeft: 0,
    groundUsed: 0, groundCap: 0, groundLeft: 0,
    loading: false, known: false, refresh: () => {},
  },
  reason: '',
  tier: 'free',
  require: () => true,
  nudge: () => false,
  openPrices: () => {},
  close: () => {},
  openPricingPage: null,
};
