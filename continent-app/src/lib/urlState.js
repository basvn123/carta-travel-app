/**
 * Shareable / persistent app state via the URL query string (and a localStorage
 * mirror so a plain reload restores everything even without a shared link).
 *
 * Kept deliberately compact: short keys, lifestyle packed as a fixed-order CSV.
 * Everything is optional, missing keys fall back to the app defaults.
 */

const LS_ORDER = [
  'dinners_per_week', 'lunches_per_week', 'fastfood_per_week', 'drinks_per_week',
  'club_nights_per_week', 'coffees_per_day', 'self_catered_days_per_week',
];

const STORAGE_KEY = 'continent.state.v1';

// The numeric counts are packed in LS_ORDER, then a trailing cadence flag
// (0 = per week, 1 = per day). Older links without the flag default to weekly.
function packLifestyle(ls) {
  if (!ls) return null;
  const counts = LS_ORDER.map((k) => ls[k] ?? '').join(',');
  return `${counts},${ls.cadence === 'day' ? 1 : 0}`;
}

function unpackLifestyle(s) {
  if (!s) return null;
  const parts = s.split(',');
  const out = {};
  LS_ORDER.forEach((k, i) => {
    const v = Number(parts[i]);
    if (parts[i] !== '' && !Number.isNaN(v)) out[k] = v;
  });
  if (parts.length > LS_ORDER.length) out.cadence = parts[LS_ORDER.length] === '1' ? 'day' : 'week';
  return Object.keys(out).length ? out : null;
}

/** Build a query string (no leading '?') from the live app state. */
export function encodeState({
  departDate, returnDate, choices, priceMode, countryFilter,
  tripKinds, priceRange, priceBounds, selectedId, favorites, sortKey, showFavOnly,
  minTier, unescoOnly, topBeachOnly, topPick, activeTab,
}) {
  const q = new URLSearchParams();
  if (activeTab && activeTab !== 'map') q.set('tab', activeTab);
  if (departDate) q.set('d', departDate);
  if (returnDate) q.set('r', returnDate);
  if (choices?.group_size) q.set('g', String(choices.group_size));
  if (choices?.baggage_key) q.set('b', choices.baggage_key);
  if (choices?.transport_mode && choices.transport_mode !== 'plane') q.set('t', choices.transport_mode);
  if (choices?.origin) q.set('o', choices.origin);
  // Store anything that differs from the APP default ('pp', see App.jsx),
  // else "Total" silently flips back to per-person on reload.
  if (priceMode && priceMode !== 'pp') q.set('pm', priceMode);
  if (countryFilter && countryFilter !== 'all') q.set('cf', countryFilter);
  if (tripKinds && tripKinds.length) q.set('tk', tripKinds.join('.'));
  // Only store a price range if it's actually a narrowing of the full bounds.
  if (priceRange && priceBounds &&
      (priceRange[0] > priceBounds[0] || priceRange[1] < priceBounds[1])) {
    q.set('pr', `${Math.round(priceRange[0])}.${Math.round(priceRange[1])}`);
  }
  // Note: the open destination (selectedId) is deliberately NOT persisted, so
  // the app always opens on the full map with nothing pre-selected.
  if (favorites && favorites.size) q.set('fav', [...favorites].join('.'));
  // App default is 'beauty' (App.jsx), so a price sort must be stored too.
  if (sortKey && sortKey !== 'beauty') q.set('sort', sortKey);
  if (showFavOnly) q.set('favonly', '1');
  if (minTier && minTier > 0) q.set('mt', String(minTier));
  if (unescoOnly) q.set('un', '1');
  if (topBeachOnly) q.set('tb', '1');
  if (topPick && topPick.by && topPick.n) q.set('top', `${topPick.by}.${topPick.n}`);
  const ls = packLifestyle(choices?.lifestyle);
  if (ls) q.set('ls', ls);
  return q.toString();
}

/** Parse the current URL (or a stored mirror) into a partial state object. */
export function decodeState(search) {
  const q = new URLSearchParams(search || '');
  const has = (k) => q.has(k);
  const out = {};
  if (has('tab')) out.activeTab = q.get('tab');
  if (has('d')) out.departDate = q.get('d');
  if (has('r')) out.returnDate = q.get('r');
  if (has('g')) out.group_size = Math.max(1, parseInt(q.get('g'), 10) || 1);
  if (has('b')) out.baggage_key = q.get('b');
  if (has('t')) out.transport_mode = q.get('t');
  if (has('o')) out.origin = q.get('o');
  if (has('pm')) out.priceMode = q.get('pm');
  if (has('cf')) out.countryFilter = q.get('cf');
  if (has('tk')) out.tripKinds = q.get('tk').split('.').filter(Boolean);
  if (has('pr')) {
    const [lo, hi] = q.get('pr').split('.').map(Number);
    if (!Number.isNaN(lo) && !Number.isNaN(hi)) out.priceRange = [lo, hi];
  }
  // 'sel' is intentionally ignored on load (see encodeState), open the full map.
  if (has('fav')) out.favorites = q.get('fav').split('.').filter(Boolean);
  if (has('sort')) out.sortKey = q.get('sort');
  if (has('favonly')) out.showFavOnly = q.get('favonly') === '1';
  if (has('mt')) out.minTier = Math.max(0, Math.min(3, parseInt(q.get('mt'), 10) || 0));
  // Legacy links: 'mb' was the min-gems (1-5) beauty filter; map it onto the
  // closest rating tier so old shared URLs still narrow sensibly.
  else if (has('mb')) {
    const mb = parseInt(q.get('mb'), 10) || 1;
    out.minTier = mb >= 5 ? 3 : mb >= 4 ? 2 : mb >= 2 ? 1 : 0;
  }
  if (has('un')) out.unescoOnly = q.get('un') === '1';
  if (has('tb')) out.topBeachOnly = q.get('tb') === '1';
  if (has('top')) {
    const [by, n] = q.get('top').split('.');
    const count = parseInt(n, 10);
    if ((by === 'price' || by === 'beauty') && count > 0) out.topPick = { by, n: count };
  }
  const ls = unpackLifestyle(q.get('ls'));
  if (ls) out.lifestyle = ls;
  return out;
}

/** Best-effort: read URL first, then fall back to the localStorage mirror. */
export function loadInitialState() {
  if (typeof window === 'undefined') return {};
  const fromUrl = window.location.search ? decodeState(window.location.search) : {};
  if (Object.keys(fromUrl).length) return fromUrl;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return decodeState(stored);
  } catch { /* ignore */ }
  return {};
}

/** Push the encoded state into the URL (replaceState) and the localStorage mirror. */
export function persistState(state) {
  if (typeof window === 'undefined') return;
  const qs = encodeState(state);
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  try { window.history.replaceState(null, '', url); } catch { /* ignore */ }
  try { window.localStorage.setItem(STORAGE_KEY, qs); } catch { /* ignore */ }
}
