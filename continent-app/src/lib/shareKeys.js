/**
 * What a share link may carry (logic wave 0a, ROADMAP C9 and I12; owner
 * defaults 11 and 12).
 *
 * A share link is the view, never the person. The audit found three builders
 * that copied the whole address or the whole draft, so a friend got the
 * sender's home point, shortlist, party and taste. Every share builder now
 * goes through this module, and its lists are allow-lists: a key that is not
 * named here stays private by default.
 *
 * Not here on purpose: the dates and When (`d r df wm wy wn`, the lens month
 * `xm`), the way (`t`), the price view (`pv ps px`) and the Together group id
 * (`tg`). Opening a link would overwrite the recipient's own settings with
 * them (critic correctness). Lists and pure functions only: the full state
 * key table is wave 2 (E9).
 */

/** The address keys an Explore "share this view" link keeps. */
export const SHARE_VIEW_KEYS = [
  // The place and category.
  'tab', 'cat', 'dc', 'dq', 'dm',
  // The filters.
  'cf', 'cn', 'tk', 'sort', 'rr', 'gem', 'un', 'tb', 'big', 'top', 'rh',
  // Explore's lens and its filter mirror (useExploreLens.js, ExploreTab.jsx).
  'xk', 'xv', 'xr', 'xb', 'xp', 'xe', 'xa', 'xn', 'xd', 'xg', 'xu', 'xw', 'xi', 'xall',
  'xc', 'xo', 'xs',
];

/** Trip share fields that describe the sender, not the trip. Party counts
 * stay: the shared booked figures (ownFlight, ownStays) are party totals. */
export const TRIP_SHARE_DROP = ['anchorOrigin', 'homeTown', 'drive_home', 'dh'];

/** Decimals a stored home point keeps: 0.01 degree, about 1 km. */
export const HOME_POINT_DP = 2;

const hrefNow = () => (typeof window !== 'undefined' && window.location ? window.location.href : '');

/** The page a share link points at: origin and path, no query, no hash. */
export function shareBase(href = hrefNow()) {
  return String(href || '').split('#')[0].split('?')[0];
}

/** The Explore view as a link: the page plus only the SHARE_VIEW_KEYS. */
export function shareViewUrl(href = hrefNow()) {
  const raw = String(href || '').split('#')[0];
  const cut = raw.indexOf('?');
  const from = new URLSearchParams(cut >= 0 ? raw.slice(cut + 1) : '');
  const q = new URLSearchParams();
  for (const [k, v] of from) if (SHARE_VIEW_KEYS.includes(k)) q.append(k, v);
  const qs = q.toString();
  return `${shareBase(href)}${qs ? `?${qs}` : ''}`;
}

/** A sanitized trip draft without the sender's own fields; null stays null. */
export function tripForShare(draft) {
  if (!draft || typeof draft !== 'object') return null;
  const out = { ...draft };
  for (const k of TRIP_SHARE_DROP) delete out[k];
  return out;
}

/** A home point's coordinates rounded to HOME_POINT_DP decimals. */
export function roundHomePoint(lat, lon) {
  const f = 10 ** HOME_POINT_DP;
  const r = (n) => (Number.isFinite(n) ? Math.round(n * f) / f : n);
  return { lat: r(lat), lon: r(lon) };
}
