/**
 * priceAlerts.js, the page's half of price alerts (T1205, ROADMAP I17).
 *
 * A signed-in traveller saves an alert on a place (the destination page's
 * price card) with the share it must fall by. The alert carries what the box
 * needs to price it (pipeline/price_alerts.py): the stops, the month or the
 * dates, the nights, the party, the bed tier and, when the card priced a
 * Carta flight, the airports and days. The box sets the baseline at its first
 * check and prices every later check with the same formula, so the one email
 * compares like with like. The page never sets a baseline, a consent or a
 * fired time: it saves through price_alert_save (migration 073).
 *
 * Double opt-in: the first save also records the consent request; when the
 * account has not confirmed yet the page asks the price-alerts Edge Function
 * to mail the one confirmation link. No alert email goes out before the click.
 *
 * Behind a flag: the control shows only when the build sets
 * VITE_PRICE_ALERTS=1 (or the ?pricealerts seam in a dev or seams build;
 * ?pricealerts=mock keeps alerts in memory), and the function
 * sends nothing until PRICE_ALERTS_ENABLED=1 on the server.
 *
 * Every call answers and never throws:
 *   { state: 'ok', ... }   done
 *   { state: 'missing' }   073 is not applied: the control hides
 *   { state: 'error' }     the network or the database said no
 */

export const SHARES = [0.05, 0.1, 0.2];
export const DEFAULT_SHARE = 0.1;
/** The consent wording version stored with the request (alerts.consent in i18n). */
export const WORDING = 'alerts-v1';
const BEDS = ['dorm', 'private', 'room', 'home', 'hotel2', 'hotel3', 'hotel4', 'hotel5'];
const LANGS = ['en', 'nl', 'fr', 'de', 'es', 'it'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const IATA = /^[A-Z]{3}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

// The headless seams (lib/e2eSeams.js, read inline so the node tests load
// this file): ?pricealerts shows the control in a dev or seams build, and
// ?pricealerts=mock also keeps the alerts in memory for a signed-out page.
const SEAMS = (() => {
  try { return !!(import.meta.env?.DEV || import.meta.env?.VITE_E2E_SEAMS === '1'); } catch { return false; }
})();
const SEAM = SEAMS && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('pricealerts') : null;
export const ALERTS_MOCK = SEAM === 'mock';
const mockStore = [];
let mockConfirmed = false;

export function alertsOn() {
  try {
    return import.meta.env?.VITE_PRICE_ALERTS === '1' || SEAM !== null;
  } catch {
    return false;
  }
}

/**
 * The spec of a place alert, or null when the card cannot describe one.
 *   dest     { id, iso2 }
 *   start    the first night (YYYY-MM-DD) when the traveller chose dates
 *   month    1 to 12 when they did not
 *   nights, adults, bed
 *   fly      { from, to, out, back } when the card priced a Carta flight
 */
export function placeSpec({ dest, start = null, month = null, nights, adults, bed, fly = null }) {
  const id = String(dest?.id || '');
  const cc = String(dest?.iso2 || dest?.cc || '').toUpperCase();
  const n = Math.round(Number(nights));
  const a = Math.round(Number(adults));
  if (!ID.test(id) || !/^[A-Z]{2}$/.test(cc) || !(n >= 1 && n <= 60) || !(a >= 1 && a <= 12)) return null;
  const spec = { stops: [{ id, cc, nights: n }], adults: a, bed: BEDS.includes(bed) ? bed : 'home' };
  if (start && DAY.test(start)) spec.start = start;
  else if (Number.isInteger(month) && month >= 1 && month <= 12) spec.month = month;
  else return null;
  if (fly && IATA.test(fly.from || '') && IATA.test(fly.to || '') && DAY.test(fly.out || '') && DAY.test(fly.back || '')
      && fly.from !== fly.to) {
    spec.fly = { from: fly.from, to: fly.to, out: fly.out, back: fly.back };
  }
  return spec;
}

const isMissing = (error) => {
  const code = String(error?.code || '');
  return code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883';
};

async function client(opts) {
  if (opts?.supabase) return opts.supabase;
  // Loaded on use, so the node tests (which stub the client) never read the build's env.
  return import('./supabaseClient.js').then((m) => m.getSupabase()).catch(() => null);
}

/** The account's alerts, newest first. */
export async function listAlerts(userId, opts = {}) {
  if (ALERTS_MOCK && !opts.supabase) return { state: 'ok', alerts: mockStore.slice() };
  if (!userId) return { state: 'error' };
  const supabase = await client(opts);
  if (!supabase) return { state: 'error' };
  try {
    const { data, error } = await supabase.from('price_alerts')
      .select('id, kind, ref, label, drop_share, baseline_eur, last_eur, fired_at, expires_at')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (error) return { state: isMissing(error) ? 'missing' : 'error' };
    return { state: 'ok', alerts: data || [] };
  } catch {
    return { state: 'error' };
  }
}

/**
 * Saves (or re-arms) an alert. Answers { state: 'ok', id, confirmed, mailed }:
 * confirmed false means the confirmation email was asked for (mailed true
 * when the function sent it now, false when one went out minutes ago or the
 * function is off).
 */
export async function saveAlert({ kind = 'place', ref, label, spec, share = DEFAULT_SHARE, lang = 'en' }, opts = {}) {
  if (!spec || !ref || !label || !SHARES.includes(share)) return { state: 'error' };
  if (ALERTS_MOCK && !opts.supabase) {
    const i = mockStore.findIndex((a) => a.kind === kind && a.ref === ref);
    if (i >= 0) mockStore.splice(i, 1);
    mockStore.unshift({ id: `mock-${ref}`, kind, ref, label, drop_share: share, fired_at: null });
    const confirmed = mockConfirmed;
    mockConfirmed = true;
    return { state: 'ok', id: `mock-${ref}`, confirmed, mailed: !confirmed };
  }
  const supabase = await client(opts);
  if (!supabase) return { state: 'error' };
  try {
    const { data, error } = await supabase.rpc('price_alert_save', {
      p_kind: kind, p_ref: ref, p_label: String(label).slice(0, 120), p_spec: spec, p_share: share,
      p_lang: LANGS.includes(lang) ? lang : 'en', p_wording: WORDING,
    });
    if (error) return { state: isMissing(error) ? 'missing' : 'error' };
    const confirmed = !!data?.confirmed;
    let mailed = false;
    if (!confirmed) {
      const res = await supabase.functions.invoke('price-alerts', { body: { job: 'optin', lang } }).catch(() => null);
      mailed = res?.data?.code === 'sent';
    }
    return { state: 'ok', id: data?.id || null, confirmed, mailed };
  } catch {
    return { state: 'error' };
  }
}

export async function deleteAlert(id, opts = {}) {
  if (!id) return { state: 'error' };
  if (ALERTS_MOCK && !opts.supabase) {
    const i = mockStore.findIndex((a) => a.id === id);
    if (i >= 0) mockStore.splice(i, 1);
    return { state: 'ok' };
  }
  const supabase = await client(opts);
  if (!supabase) return { state: 'error' };
  try {
    const { error } = await supabase.from('price_alerts').delete().eq('id', id);
    if (error) return { state: isMissing(error) ? 'missing' : 'error' };
    return { state: 'ok' };
  } catch {
    return { state: 'error' };
  }
}
