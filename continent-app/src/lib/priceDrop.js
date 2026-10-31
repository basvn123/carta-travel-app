/**
 * priceDrop.js, the page's half of the price drop email (T944).
 *
 * Carta's day prices are computed here in the browser from the traveller's
 * own settings, so only the page can see that a saved place now costs
 * clearly less than when it was saved (lib/savedLists.js records meta.eur,
 * the day price shown at save time, the "since you saved" figure My trips
 * shows). When it does, and the traveller turned on price drops, the page
 * sends the notify Edge Function a small request; the function checks the
 * switch again, rate limits and sends at most one email a day.
 *
 * The rule is the function's (supabase/functions/notify/logic.mjs); the
 * test keeps the two equal. This device asks at most once in 20 hours and
 * never twice for the same place at the same or a higher price.
 */
export const DROP_MIN_EUR = 5;
export const DROP_MIN_SHARE = 0.1;
export const ASK_GAP_MS = 20 * 3600 * 1000;
const KEY = 'carta.priceDropAsk.v1';
const MAX_ITEMS = 5;

export function isClearDrop(was, now) {
  if (!Number.isFinite(was) || !Number.isFinite(now) || was <= 0 || now <= 0) return false;
  const diff = was - now;
  return diff >= DROP_MIN_EUR && diff >= was * DROP_MIN_SHARE;
}

/**
 * The saved destinations whose day price now is a clear drop against the
 * price at save time, cheapest drop first by share.
 *   favorites     Set of favourite keys ('dest:LIS')
 *   meta          savedLists meta { [key]: { eur, gone } }
 *   priceOf(id)   today's day price a person, whole euros, or null
 *   nameOf(id)    the place's name
 *   asked         { [key]: eur last reported } from this device
 */
export function findDrops({ favorites, meta, priceOf, nameOf, asked = {} }) {
  const out = [];
  for (const key of favorites || []) {
    if (!String(key).startsWith('dest:')) continue;
    const m = meta?.[key];
    if (!m || Number.isFinite(m.gone) || !Number.isFinite(m.eur)) continue;
    const id = key.slice(5);
    const now = priceOf(id);
    if (!Number.isFinite(now)) continue;
    const nowEur = Math.round(now);
    if (!isClearDrop(m.eur, nowEur)) continue;
    if (Number.isFinite(asked[key]) && nowEur >= asked[key]) continue;
    const city = nameOf(id);
    if (!city) continue;
    out.push({ key, city, was: m.eur, now: nowEur });
  }
  return out.sort((a, b) => (b.was - b.now) / b.was - (a.was - a.now) / a.was).slice(0, MAX_ITEMS);
}

function readAsk() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') || { at: 0, keys: {} }; } catch { return { at: 0, keys: {} }; }
}
function writeAsk(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
}

/** True when this device may ask again (once in 20 hours). */
export function mayAsk(now = Date.now()) {
  return now - (readAsk().at || 0) >= ASK_GAP_MS;
}

/**
 * Finds the drops and, if any, asks the function to mail them. Quiet: a
 * missing function, a signed-out traveller or a network failure does
 * nothing visible. Answers the number of places reported.
 */
export async function reportPriceDrops({ favorites, meta, priceOf, nameOf, now = Date.now() }) {
  if (!mayAsk(now)) return 0;
  const ask = readAsk();
  const items = findDrops({ favorites, meta, priceOf, nameOf, asked: ask.keys || {} });
  if (!items.length) return 0;
  // Loaded here, not at the top, so the rule above stays testable in node.
  const supabase = await import('./supabaseClient.js').then((m) => m.getSupabase()).catch(() => null);
  if (!supabase) return 0;
  writeAsk({ at: now, keys: { ...(ask.keys || {}), ...Object.fromEntries(items.map((i) => [i.key, i.now])) } });
  try {
    await supabase.functions.invoke('notify', { body: { kind: 'price', items } });
  } catch { /* the next visit tomorrow asks again for a lower price only */ }
  return items.length;
}
