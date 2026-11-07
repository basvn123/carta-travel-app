// T1209 (ROADMAP G14): the flag and the pure parts of the G14 home page
// (browse/home/HomeG14.jsx), apart so the component file exports only
// components and tests/homeG14.test.mjs can load these in Node.

/*
 * The G14 home is built behind a flag that is OFF until the owner approves
 * the design direction docs/design/direction.md (row T1111-a). While
 * HOME_G14 is false, every visitor gets today's home (v3, HomePage.jsx).
 *
 *   Flip it for everyone: set HOME_G14 = true.
 *   Preview it:           any address with ?home=g14 (kept for the tab's
 *                         session, so it survives the app's navigation);
 *                         ?home=v3 goes back to today's home.
 *
 * The same pattern as the cost card's flag (planner/trip/costCardVariant.js).
 */
export const HOME_G14 = false;
const HOME_KEY = 'carta.home';

/** Which home to draw: 'g14' or 'v3'. `search` and `store` are seams for tests. */
export function homeVariant(search, store, flag = HOME_G14) {
  let q = '';
  try { q = new URLSearchParams(search || '').get('home') || ''; } catch { q = ''; }
  try {
    if (q === 'g14' || q === 'v3') store?.setItem(HOME_KEY, q);
    q = q || store?.getItem(HOME_KEY) || '';
  } catch { /* storage blocked: the query alone decides */ }
  if (q === 'g14') return 'g14';
  if (q === 'v3') return 'v3';
  return flag ? 'g14' : 'v3';
}

/**
 * Remember a ?home= preview before the app rewrites the address (its state
 * writer drops the query on boot). App.jsx imports this module, so it runs
 * before the first render; on the server it does nothing.
 */
export function rememberHomePreview() {
  if (typeof window === 'undefined') return;
  let store = null;
  try { store = window.sessionStorage; } catch { store = null; }
  homeVariant(window.location.search, store);
}
rememberHomePreview();

/** The live example's place: Bled, the place the v3 story follows too. */
export const EXAMPLE_PLACE = 'gem:bled';

/** The sample trip one tap from home: a published journey (public/journeys),
 *  a hut to hut week in the Julian Alps, hikers first (PRODUCT.md). */
export const SAMPLE_JOURNEY = 'si-hiking-triglav-hut-to-hut';
export const sampleHref = (id = SAMPLE_JOURNEY) => `#journey=${encodeURIComponent(id)}`;

/**
 * The referral link (K3, client half; research in the T1209 report). One fixed
 * link for everyone: utm_medium=referral lands in the K12 channel counts'
 * referral bucket and utm_source names the channel, so the weekly view can
 * count visits that came from a shared link. The link carries no person, no
 * code and no id, and nothing is stored.
 */
export const SHARE_SOURCE = 'waitlist_share';
export function shareUrl(origin) {
  const base = String(origin || 'https://carta-europetravel.com').replace(/\/+$/, '');
  return `${base}/?utm_source=${SHARE_SOURCE}&utm_medium=referral`;
}

/**
 * The live example's day, a person: the place's own bed and food and drink at
 * the traveller's Lifestyle (App's cost index row), with each part's share of
 * the day for the bar (0 to 100, one decimal). Null when either part has no
 * price: the page then shows no example rather than a guess.
 */
export function dayParts(cost) {
  if (!cost || !(cost.stayEur > 0) || !(cost.foodEur > 0)) return null;
  const total = cost.stayEur + cost.foodEur;
  const share = (v) => Math.round((v / total) * 1000) / 10;
  return {
    total,
    parts: [
      { key: 'stay', eur: cost.stayEur, share: share(cost.stayEur) },
      { key: 'food', eur: cost.foodEur, share: share(cost.foodEur) },
    ],
  };
}

/** The month the day is priced for, from the traveller's start date
 *  (YYYY-MM-DD), else today's: the name in the reader's language. */
export function pricedMonth(startISO, lang, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(startISO || '');
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
  try {
    return new Intl.DateTimeFormat(lang || 'en', { month: 'long', timeZone: 'UTC' }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(d);
  }
}
