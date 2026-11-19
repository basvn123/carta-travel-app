/**
 * useEntitlement, the client's read of what the signed-in traveller may do.
 *
 * Reads the ai_status() RPC, which is the same resolver the Edge Functions
 * spend against, so the number shown in the UI and the number enforced on the
 * server come from one place.
 *
 * This is a HINT, never a gate. The server refuses over-quota calls on its
 * own; everything here does is decide what to render, so a stale or failed
 * read degrades to "free tier, unknown balance" rather than to a locked app.
 * Never guard a purchase or a generation on this value alone.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase, authConfigured } from '../lib/supabaseClient.js';
import { useAuth } from '../auth/AuthContext.jsx';

const GUEST = {
  tier: 'free',
  expiresAt: null,
  resetsAt: null,
  plansUsed: 0,
  plansCap: 0,
  plansLeft: 0,
  groundUsed: 0,
  groundCap: 0,
  groundLeft: 0,
  loading: false,
  known: false,
};

// V-5 (logic wave 0a): Stripe's return (?pass=ok, ?pass=cancel) is read once
// for the whole page, before anything strips it, so the poll below does not
// hang on the address: the address loses `pass` right away (else a later
// reload, and every copied link, carried it), and a `user` that changes
// identity while the session settles cannot cancel the poll.
let passAtBoot;
export function passReturn() {
  if (passAtBoot === undefined) {
    passAtBoot = typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('pass') || '');
  }
  return passAtBoot;
}

/** The address without `pass`, or null when it has none. */
export function addressWithoutPass(loc) {
  const params = new URLSearchParams(loc.search);
  if (!params.has('pass')) return null;
  params.delete('pass');
  const qs = params.toString();
  return `${loc.pathname}${qs ? `?${qs}` : ''}${loc.hash || ''}`;
}

export function useEntitlement() {
  const { user } = useAuth();
  const [state, setState] = useState(GUEST);
  // Guards against a slow response for a previous user landing after a switch
  // (sign out then in as somebody else would otherwise show their balance).
  const reqId = useRef(0);

  const refresh = useCallback(async () => {
    if (!authConfigured || !user) { setState(GUEST); return; }
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.rpc('ai_status', { p_user: user.id });
      if (id !== reqId.current) return;
      if (error || !data || data.error) {
        setState({ ...GUEST, loading: false });
        return;
      }
      setState({
        tier: data.tier || 'free',
        expiresAt: data.expiresAt || null,
        resetsAt: data.resetsAt || null,
        plansUsed: data.plansUsed ?? 0,
        plansCap: data.plansCap ?? 0,
        plansLeft: data.plansLeft ?? 0,
        groundUsed: data.groundUsed ?? 0,
        groundCap: data.groundCap ?? 0,
        groundLeft: data.groundLeft ?? 0,
        loading: false,
        known: true,
      });
    } catch {
      if (id === reqId.current) setState({ ...GUEST, loading: false });
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Returning from Stripe: the webhook may land a beat after the browser does,
  // so a single read on arrival often still shows the old tier. Re-read a few
  // times before giving up rather than leaving somebody who just paid looking
  // at the free tier.
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return undefined;
    if (passReturn() !== 'ok') return undefined;
    let tries = 0;
    const timers = [];
    const poll = () => {
      refresh();
      if (++tries < 5) timers.push(setTimeout(poll, 1500));
    };
    timers.push(setTimeout(poll, 800));
    return () => timers.forEach(clearTimeout);
  }, [user, refresh]);

  // One shot: take `pass` out of the address. Not added to urlState's
  // OWN_KEYS, which would drop it before `user` arrives.
  const stripped = useRef(false);
  useEffect(() => {
    if (stripped.current || typeof window === 'undefined') return;
    stripped.current = true;
    passReturn();
    const url = addressWithoutPass(window.location);
    if (url) {
      try { window.history.replaceState(window.history.state, '', url); } catch { /* ignore */ }
    }
  }, []);

  return { ...state, refresh };
}
