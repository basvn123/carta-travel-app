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
  createContext, useContext, useState, useCallback, useMemo, useRef, useEffect,
} from 'react';
import { useEntitlement } from './useEntitlement.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { authConfigured } from '../lib/supabaseClient.js';
import { PassModal } from '../components/PassModal.jsx';
import { trackPaywall } from '../lib/paywallEvents.js';

/**
 * Every reason the pass modal can open, and how insistent each one is.
 *
 * `kind` is the only thing decided here. The copy each reason leads with
 * lives in REASON_COPY inside components/PassModal.jsx, because the modal
 * must not import the hook that mounts it. Adding a reason means adding its
 * heading there and to all six locales.
 */
export const GATES = {
  // Hard gates: the traveller pressed something that needs a pass.
  export:    { kind: 'hard' },
  import:    { kind: 'hard' },
  share:     { kind: 'hard' },
  save:      { kind: 'hard' },
  plans:     { kind: 'hard' },
  ground:    { kind: 'hard' },
  // Soft gates: nothing was blocked, this is an offer.
  plansLow:  { kind: 'soft' },
  celebrate: { kind: 'soft' },
  expiring:  { kind: 'soft' },
  // Browsing the prices on purpose, from the header or the account panel.
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
const PAY_MOCK = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('paymock');


export function PaywallProvider({ children, onSignIn }) {
  const { user } = useAuth();
  const entitlement = useEntitlement();
  const [reason, setReason] = useState('');
  // Set while a hard gate is open so closing it does not also count as
  // "the soft prompt for this session has been used".
  const openedHard = useRef(false);

  const signedIn = !!user && authConfigured;

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
  useEffect(() => {
    if (!reason) { reportedReason.current = ''; return; }
    if (reportedReason.current === reason) return;
    reportedReason.current = reason;
    trackPaywall('shown', reason, entitlement.tier);
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
    if (paid) return true;
    const gate = GATES[why] || GATES.browse;
    openedHard.current = gate.kind === 'hard';
    setReason(why);
    return false;
  }, [paid]);

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

  /** Open the price table because somebody asked to see it. */
  const openPrices = useCallback(() => {
    openedHard.current = true;
    setReason('browse');
  }, []);

  const handleClose = useCallback(() => {
    // Only counted on a real dismissal. Buying navigates the whole page to
    // Stripe, so this never runs for somebody who paid, and signing in goes
    // through close() rather than here.
    if (reason) trackPaywall('dismissed', reason, entitlement.tier);
    // Only a soft prompt earns a snooze. Dismissing a hard gate means "not
    // now, I did not want that button", not "stop offering me this".
    if (reason && !openedHard.current && GATES[reason]?.kind === 'soft') {
      writeSnooze({ ...readSnooze(), [reason]: Date.now() + SNOOZE_DAYS * 86400000 });
    }
    close();
  }, [reason, close, entitlement.tier]);

  const value = useMemo(() => ({
    paid, signedIn, entitlement, reason,
    require, nudge, openPrices, close,
    tier: entitlement.tier,
  }), [paid, signedIn, entitlement, reason, require, nudge, openPrices, close]);

  return (
    <PaywallContext.Provider value={value}>
      {children}
      {reason && (
        <div onClick={(e) => e.stopPropagation()}>
          <PassModal
            entitlement={entitlement}
            reason={reason}
            signedIn={signedIn}
            onClose={handleClose}
            onSignIn={() => { close(); onSignIn?.(); }}
          />
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
};
