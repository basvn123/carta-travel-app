import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { TIERS } from '../lib/pricing.js';
import { SparkIcon } from './Icons.jsx';

/**
 * What an AI action costs, said before the tap (T433).
 *
 * Every control that spends a Carta bot plan carries this beside its label,
 * so the traveller knows the price of the click and how many they have left
 * and can choose to build the day themselves instead. The balance is the
 * ai_status() read PaywallProvider already holds: the same resolver the Edge
 * Functions spend against, so the figure here and the figure enforced agree.
 * It is a hint, never a gate; the server refuses an over-quota call itself.
 *
 *   free    true for a change of a plan already paid for (no plan spent)
 *   freeLeft  how many free changes remain, when free
 *   inline  render as running text (inside a button) rather than a chip
 */
export function useCredit() {
  const paywall = usePaywall();
  const e = paywall.entitlement || {};
  const signedIn = !!paywall.signedIn;
  const known = !!e.known;
  const left = known ? Math.max(0, e.plansLeft ?? 0) : null;
  const cap = known ? Math.max(0, e.plansCap ?? 0) : null;
  return {
    signedIn,
    known,
    left,
    cap,
    // Out of plans only when the balance is actually known: a failed read is
    // "unknown", and the server decides.
    out: signedIn && known && left === 0,
    refresh: e.refresh || (() => {}),
    openPasses: (why = 'plansLow') => paywall.require(why),
  };
}

export function creditText(t, c, { free = false, freeLeft = 0 } = {}) {
  if (free) return t('credit.freeChange', { n: freeLeft });
  if (!c.signedIn) return t('credit.guest', { n: TIERS.free.aiPlans });
  if (c.out) return t('credit.none');
  if (c.left == null) return t('credit.uses');
  return t('credit.usesLeft', { n: c.left });
}

export function CreditChip({ free = false, freeLeft = 0, inline = false, className = '' }) {
  const { t } = useI18n();
  const c = useCredit();
  const text = creditText(t, c, { free, freeLeft });
  if (inline) return <span className={`credit-inline ${className}`}>{text}</span>;
  return (
    <span className={`credit-chip${c.out && !free ? ' is-out' : ''} ${className}`}>
      <SparkIcon size={13} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
