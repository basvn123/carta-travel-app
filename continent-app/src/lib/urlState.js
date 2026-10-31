/**
 * Shareable / persistent app state via the URL query string (and a localStorage
 * mirror so a plain reload restores everything even without a shared link).
 *
 * Kept deliberately compact: short keys, lifestyle packed as a fixed-order CSV.
 * Everything is optional, missing keys fall back to the app defaults.
 */

import { isFullRatingRange, clampRatingRange, rangeFromMinTier } from './rating.js';
import { readFavList, writeFavList } from './favorites.js';
import { decodeTaste, encodeTaste, isEmptyTaste } from './taste.js';

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

/* ---------------------------------------------------------------------------
 * Places and views (T496, roadmap 1.15 and 2.18)
 *
 * The traveller sees three places and an icon: Explore, Plan, My trips and
 * Account, plus Home behind the logo and the Trip Pass prices. The app still
 * renders a few views inside two of them, so a place is the address and a view
 * is what is drawn:
 *
 *   place     view(s)        address
 *   explore   map            (no tab)  or ?tab=explore      Places, the catalogue
 *             places         ?tab=explore&cat=trails        the trips and outdoor layers
 *   plan      planstart      ?tab=plan&mode=new             "Plan something new"
 *             trip           ?tab=plan&mode=trip            the trip planner
 *             day            ?tab=plan&mode=day             one day
 *   trips     (a page)       ?tab=trips                     My trips
 *   account   (a page)       ?tab=account[&view=profile]    Account
 *   together  (a page)       ?tab=together[&tv=add|friend|group&tg=id]  Together (T928)
 *   home      home           ?tab=home
 *   pricing   pricing        ?tab=pricing  (and the path /pricing)
 *
 * `?tab=plan` with no mode opens the plan in progress, else the start page.
 * Every older address still opens: LEGACY_TABS reads it (never writes it).
 * ------------------------------------------------------------------------- */

/** The places, in nav order, then the two that are not in the bar. */
export const PLACE_KEYS = Object.freeze(['explore', 'plan', 'trips', 'account', 'together', 'home', 'pricing']);
/** The views App renders. `trips` and `account` are pages laid over a view. */
export const VIEW_KEYS = Object.freeze(['home', 'map', 'places', 'planstart', 'trip', 'day', 'pricing']);
/** The Destinations categories, reachable inside Explore as `cat=`. */
export const EXPLORE_CATS = Object.freeze(['trips', 'trails', 'beaches', 'lakes', 'mountains', 'cycling']);
/** The Account spokes an address may name (`view=`). */
export const ACCOUNT_VIEWS = Object.freeze(['home', 'profile', 'security', 'yourdata', 'friends', 'faq', 'feedback', 'plan']);
/** The Together sub-screens an address may name (`tv=`, T928); `tg=` is the
 *  friend or group it is about. */
export const TOGETHER_VIEWS = Object.freeze(['home', 'add', 'privacy', 'friend', 'group', 'newgroup']);
const TOGETHER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Every retired `tab=` value and the view it opens now (1.15 section 3). */
export const LEGACY_TABS = Object.freeze({
  map: 'map',
  places: 'places',
  destinations: 'places',
  trip: 'trip',
  day: 'day',
});

/** The place a view belongs to: what the nav marks while it shows. */
export function placeOf(view) {
  if (view === 'map' || view === 'places') return 'explore';
  if (view === 'planstart' || view === 'trip' || view === 'day') return 'plan';
  return view;
}

/**
 * Read an address into what to draw: { view, overlay, cat, accountView }.
 *   view         one of VIEW_KEYS (the view under a page, for trips/account)
 *   overlay      'trips' | 'account' | 'together' | null
 *   cat          a Destinations category for the places view, or null
 *   accountView  the Account spoke named by `view=`, or null
 * `hasPlan` says whether a trip plan is open on this device, which is what
 * a bare `?tab=plan` opens; without one it opens the start page.
 */
export function routeFromSearch(search, { hasPlan = false } = {}) {
  const q = new URLSearchParams(search || '');
  const raw = String(q.get('tab') || '').toLowerCase();
  const cat = q.get('cat');
  const out = { view: 'map', overlay: null, cat: null, accountView: null, togetherView: null, togetherId: null };
  if (LEGACY_TABS[raw]) {
    out.view = LEGACY_TABS[raw];
  } else if (raw === 'explore' || raw === '') {
    out.view = EXPLORE_CATS.includes(cat) ? 'places' : 'map';
  } else if (raw === 'plan') {
    const mode = q.get('mode');
    out.view = mode === 'day' ? 'day'
      : mode === 'new' ? 'planstart'
        // A country seed (cc) is a trip hand-off, whatever is on the device.
        : (mode === 'trip' || hasPlan || q.has('cc')) ? 'trip' : 'planstart';
  } else if (raw === 'home' || raw === 'pricing') {
    out.view = raw;
  } else if (raw === 'trips' || raw === 'account') {
    out.overlay = raw;
    if (raw === 'account' && ACCOUNT_VIEWS.includes(q.get('view'))) out.accountView = q.get('view');
    // The old Friends spoke's address opens Together (T928).
    if (out.accountView === 'friends') { out.overlay = 'together'; out.accountView = null; out.togetherView = 'home'; }
  } else if (raw === 'together') {
    out.overlay = 'together';
    const tv = q.get('tv');
    out.togetherView = TOGETHER_VIEWS.includes(tv) ? tv : 'home';
    const id = q.get('tg');
    if (id && TOGETHER_ID_RE.test(id)) out.togetherId = id;
  }
  if (out.view === 'places' && EXPLORE_CATS.includes(cat)) out.cat = cat;
  return out;
}

/** The query keys that name a place, in the form the address writes them. */
function placeParams(key, { cat } = {}) {
  switch (key) {
    case 'map':
    case 'explore': return { tab: 'explore' };
    case 'places': return { tab: 'explore', cat: EXPLORE_CATS.includes(cat) ? cat : 'trips' };
    case 'plan': return { tab: 'plan' };
    case 'trip': return { tab: 'plan', mode: 'trip' };
    case 'planstart': return { tab: 'plan', mode: 'new' };
    case 'day': return { tab: 'plan', mode: 'day' };
    default: return { tab: key };
  }
}
// `dq` (T600) is the text a category was opened with: it belongs to that
// one hand-off, so any move between places drops it.
const PLACE_PARAM_KEYS = ['tab', 'mode', 'cat', 'view', 'dq', 'tv', 'tg'];

/** Longest search text an address carries (T600). */
const BROWSE_QUERY_MAX = 80;

/**
 * The search text an Explore category opens with (T600): Explore's overview
 * hands its Where field over as `dq`, and DestinationsTab starts with it in
 * its own Where field. Trimmed, capped, '' when there is none.
 */
export function browseQueryFrom(search) {
  try {
    const raw = new URLSearchParams(search || '').get('dq') || '';
    return raw.trim().slice(0, BROWSE_QUERY_MAX);
  } catch {
    return '';
  }
}

/** Build a query string (no leading '?') from the live app state. */
export function encodeState({
  departDate, returnDate, choices, countryFilter, countryNot, dateFlex,
  tripKinds, selectedId, favorites, sortKey, showFavOnly,
  ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick, reachHours, activeTab,
  exploreCat,
}) {
  const q = new URLSearchParams();
  // Explore's Places is the address's default, so it names no tab; every
  // other place writes its own keys (T496).
  if (activeTab && activeTab !== 'map' && activeTab !== 'explore') {
    for (const [k, v] of Object.entries(placeParams(activeTab, { cat: exploreCat }))) q.set(k, v);
  }
  if (departDate) q.set('d', departDate);
  if (returnDate) q.set('r', returnDate);
  if (choices?.group_size) q.set('g', String(choices.group_size));
  // T579: children and babies, only when there are any.
  if (choices?.children > 0) q.set('gc', String(choices.children));
  if (choices?.babies > 0) q.set('gb', String(choices.babies));
  // T578: a month ("m") or any time ("a") instead of the dates themselves.
  if (dateFlex === 'month' || dateFlex === 'any') q.set('df', dateFlex === 'month' ? 'm' : 'a');
  if (choices?.baggage_key) q.set('b', choices.baggage_key);
  // T582: any way is the default, so only a chosen way is stored.
  if (choices?.transport_mode && choices.transport_mode !== 'any') q.set('t', choices.transport_mode);
  if (choices?.stay_tier && choices.stay_tier !== 'home') q.set('st', choices.stay_tier);
  if (choices?.price_view === 'total') q.set('pv', 't');   // T694: the group's total
  if (choices?.price_excluded?.length) q.set('px', choices.price_excluded.join('.'));   // T695
  if (choices?.origin) q.set('o', choices.origin);
  // T860: the home airports in reach ("oa", codes joined by '.') and the
  // reach that ticked them ("ah", hours, or "p" for picked by hand).
  if (Array.isArray(choices?.origins) && choices.origins.length) q.set('oa', choices.origins.join('.'));
  if (choices?.airport_hours) q.set('ah', choices.airport_hours === 'pick' ? 'p' : String(choices.airport_hours));
  // Where a drive starts, packed as "lat,lon,name". The name is free text and
  // can hold commas of its own, so the decoder splits on the first two only.
  const dh = choices?.drive_home;
  if (dh && Number.isFinite(dh.lat) && Number.isFinite(dh.lon)) {
    q.set('dh', `${dh.lat.toFixed(4)},${dh.lon.toFixed(4)},${dh.name || ''}`);
  }
  // T697 (plan 4.4): the old price mode (pm) and price range (pr) filtered
  // nothing and are no longer written; the price view is pv (T694).
  if (countryFilter && countryFilter.length) q.set('cf', countryFilter.join('.'));
  if (countryNot && countryFilter && countryFilter.length) q.set('cn', '1');
  if (tripKinds && tripKinds.length) q.set('tk', tripKinds.join('.'));
  // Note: the open destination (selectedId) is deliberately NOT persisted, so
  // the app always opens on the full map with nothing pre-selected.
  // The shortlist, as `kind:id` keys joined by '.'. Destination ids carry no
  // dots (they are IATA codes or `gem:<slug>`), so the joiner stays safe and
  // the ':' is free to name the layer. See lib/favorites.js for the legacy
  // bare-id reading on the way back in.
  if (favorites && favorites.size) q.set('fav', writeFavList(favorites).join('.'));
  // App default is 'beauty' (App.jsx), so a price sort must be stored too.
  if (sortKey && sortKey !== 'beauty') q.set('sort', sortKey);
  if (showFavOnly) q.set('favonly', '1');
  // Rating band, stored as tenths ("68.100" = 6.8-10.0) so the '.' separator
  // stays integer-safe, and only when it actually narrows the full 0-10 scale.
  if (ratingRange && !isFullRatingRange(ratingRange)) {
    q.set('rr', `${Math.round(ratingRange[0] * 10)}.${Math.round(ratingRange[1] * 10)}`);
  }
  if (gemOnly) q.set('gem', '1');
  if (unescoOnly) q.set('un', '1');
  if (topBeachOnly) q.set('tb', '1');
  // The map's size toggle: cities only, no towns or villages (place_layer.py
  // classes). Off is the default, so only the narrowed state is stored.
  if (bigOnly) q.set('big', '1');
  if (topPick && topPick.by && topPick.n) q.set('top', `${topPick.by}.${topPick.n}`);
  // "Reachable within N hours" cutoff, whole hours. No control sets it now; it rides in shared links (?rh=5).
  if (Number.isFinite(reachHours) && reachHours > 0) q.set('rh', String(Math.round(reachHours)));
  const ls = packLifestyle(choices?.lifestyle);
  if (ls) q.set('ls', ls);
  // T764: the taste profile (lib/taste.js), compact, only when something is set.
  const ty = encodeTaste(choices?.taste);
  if (ty) q.set('ty', ty);
  return q.toString();
}

/** Parse the current URL (or a stored mirror) into a partial state object. */
export function decodeState(search) {
  const q = new URLSearchParams(search || '');
  const has = (k) => q.has(k);
  const out = {};
  // The view the address names, old names included (LEGACY_TABS, T496). A
  // page over a view (trips, account) keeps its own key here.
  if (has('tab')) {
    const route = routeFromSearch(search);
    out.activeTab = route.overlay || route.view;
  }
  if (has('d')) out.departDate = q.get('d');
  if (has('r')) out.returnDate = q.get('r');
  if (has('g')) out.group_size = Math.max(1, parseInt(q.get('g'), 10) || 1);
  if (has('gc')) out.children = Math.max(0, parseInt(q.get('gc'), 10) || 0);
  if (has('gb')) out.babies = Math.max(0, parseInt(q.get('gb'), 10) || 0);
  if (has('df')) out.dateFlex = q.get('df') === 'm' ? 'month' : q.get('df') === 'a' ? 'any' : null;
  if (has('b')) out.baggage_key = q.get('b');
  if (has('t')) out.transport_mode = q.get('t');
  if (has('st')) out.stay_tier = q.get('st');
  if (has('pv')) out.price_view = q.get('pv') === 't' ? 'total' : 'pp';
  if (has('px')) out.price_excluded = q.get('px').split('.').filter((k) => /^[a-z]{2,12}$/.test(k)).slice(0, 8);
  if (has('o')) out.origin = q.get('o');
  if (has('oa')) out.origins = q.get('oa').split('.').filter((c) => /^[A-Z]{3}$/.test(c)).slice(0, 12);
  if (has('ah')) {
    const h = q.get('ah');
    out.airport_hours = h === 'p' ? 'pick' : ([1, 2, 3].includes(Number(h)) ? Number(h) : null);
  }
  if (has('dh')) {
    const raw = q.get('dh');
    const cut = raw.indexOf(',');
    const cut2 = cut >= 0 ? raw.indexOf(',', cut + 1) : -1;
    const lat = cut >= 0 ? Number(raw.slice(0, cut)) : NaN;
    const lon = cut >= 0 ? Number(raw.slice(cut + 1, cut2 < 0 ? undefined : cut2)) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      out.drive_home = { lat, lon, name: cut2 < 0 ? '' : raw.slice(cut2 + 1) };
    }
  }
  // iso2 codes joined by '.', legacy links stored a single code (still parses).
  if (has('cf')) out.countryFilter = q.get('cf').split('.').filter((c) => c && c !== 'all');
  if (has('cn')) out.countryNot = q.get('cn') === '1';
  if (has('tk')) out.tripKinds = q.get('tk').split('.').filter(Boolean);
  // 'sel' is intentionally ignored on load (see encodeState), open the full map.
  // Keys now, bare destination ids in older links: readFavList migrates the
  // second onto the first, so a link shared before the shortlist grew past
  // destinations still opens with its places starred.
  if (has('fav')) out.favorites = [...readFavList(q.get('fav').split('.').filter(Boolean))];
  if (has('sort')) out.sortKey = q.get('sort');
  if (has('favonly')) out.showFavOnly = q.get('favonly') === '1';
  // Rating band ("rr", tenths). Older links carried a minimum-tier ('mt', 1-3)
  // or an even older min-gems beauty floor ('mb', 1-5); both migrate onto the
  // equivalent [cutoff, 10] band so shared URLs still narrow sensibly.
  if (has('rr')) {
    const [lo, hi] = q.get('rr').split('.').map((n) => Number(n) / 10);
    out.ratingRange = clampRatingRange([lo, hi]);
  } else if (has('mt')) {
    out.ratingRange = rangeFromMinTier(parseInt(q.get('mt'), 10));
  } else if (has('mb')) {
    const mb = parseInt(q.get('mb'), 10) || 1;
    out.ratingRange = rangeFromMinTier(mb >= 5 ? 3 : mb >= 4 ? 2 : mb >= 2 ? 1 : 0);
  }
  if (has('gem')) out.gemOnly = q.get('gem') === '1';
  if (has('un')) out.unescoOnly = q.get('un') === '1';
  if (has('tb')) out.topBeachOnly = q.get('tb') === '1';
  if (has('big')) out.bigOnly = q.get('big') === '1';
  if (has('top')) {
    const [by, n] = q.get('top').split('.');
    const count = parseInt(n, 10);
    if ((by === 'price' || by === 'beauty') && count > 0) out.topPick = { by, n: count };
  }
  if (has('rh')) {
    const h = parseInt(q.get('rh'), 10);
    if (Number.isFinite(h) && h > 0 && h <= 48) out.reachHours = h;
  }
  const ls = unpackLifestyle(q.get('ls'));
  if (ls) out.lifestyle = ls;
  if (has('ty')) out.taste = decodeTaste(q.get('ty'));
  // Planner seeds, the shareable form of the hand-offs out of a destination
  // or feature page (App.openTripForCountry / openDayForDest / openDayForFeature).
  //   tab=trip&cc=BE           the trip wizard's Where step with Belgium picked
  //   tab=day&dest=BRU         the day flow's When step, staying in that city
  //   tab=day&feat=trail:AT:63478   the same, with that feature as the idea
  // Read once at load and consumed by the planner they name; persistState then
  // drops them (they are OWN keys the encoder never writes back), so a reload
  // after the hand-off does not re-seed over whatever the traveller did next.
  if (has('cc') && /^[A-Za-z]{2}$/.test(q.get('cc'))) out.tripSeedCc = q.get('cc').toUpperCase();
  if (has('dest') && /^[A-Za-z0-9_:.-]{1,80}$/.test(q.get('dest'))) out.daySeedDest = q.get('dest');
  if (has('feat')) {
    const m = /^(trail|beach|lake|mountain):([A-Za-z]{2}):([A-Za-z0-9_.-]{1,60})$/.exec(q.get('feat'));
    if (m) out.daySeedFeat = { kind: m[1], cc: m[2].toUpperCase(), id: m[3] };
  }
  return out;
}

/** The query string a hand-off link carries, for share buttons. */
export function seedQuery(seed) {
  const q = new URLSearchParams();
  if (seed?.cc) { q.set('tab', 'plan'); q.set('cc', seed.cc); }
  else if (seed?.dest) { q.set('tab', 'plan'); q.set('mode', 'day'); q.set('dest', seed.dest); }
  else if (seed?.feat) { q.set('tab', 'plan'); q.set('mode', 'day'); q.set('feat', `${seed.feat.kind}:${seed.feat.cc}:${seed.feat.id}`); }
  return q.toString();
}

/**
 * The address of one place or view (T381, the navigation rule; T496 the
 * places): the current query with the place keys swapped, so a link opened in
 * a new tab or copied keeps the traveller's dates, party and filters. Explore
 * is the address's implicit default, but its link still names it
 * (`tab=explore`): a link with no query at all opens on the visit's default
 * place instead (App.jsx), and persistState drops it again once the app runs.
 * Takes a place key (explore, plan, trips, account, home, pricing) or a view
 * key (map, places, planstart, trip, day).
 */
export function tabHref(key, search = (typeof window !== 'undefined' ? window.location.search : ''), opts = {}) {
  const q = new URLSearchParams(search);
  for (const k of PLACE_PARAM_KEYS) q.delete(k);
  for (const [k, v] of Object.entries(placeParams(key, opts))) q.set(k, v);
  if (key === 'account' && opts.view && opts.view !== 'home' && ACCOUNT_VIEWS.includes(opts.view)) q.set('view', opts.view);
  if (key === 'together' && opts.view && opts.view !== 'home' && TOGETHER_VIEWS.includes(opts.view)) {
    q.set('tv', opts.view);
    if (opts.id && TOGETHER_ID_RE.test(String(opts.id))) q.set('tg', String(opts.id));
  }
  // T600: the Where text a category is opened with.
  const dq = key === 'places' ? String(opts.q || '').trim().slice(0, BROWSE_QUERY_MAX) : '';
  if (dq) q.set('dq', dq);
  return `?${q.toString()}`;
}

/* ---------------------------------------------------------------------------
 * The country page's address (T498, roadmap 1.3b D): #country=IT, a hash
 * like #dest= and #region=, so a shared country opens over whatever view the
 * link lands on and Back closes it. Read-only for every older key: a hash
 * that names no country, or a malformed code, opens nothing. The Explore
 * categories keep `cat=` (EXPLORE_CATS); Places is the address's default.
 * ------------------------------------------------------------------------- */

/** The ISO2 code a hash names (#country=IT, any case), or null. */
export function countryFromHash(hash) {
  const m = /(?:^#|&)country=([A-Za-z]{2})(?:&|$)/.exec(String(hash || ''));
  return m ? m[1].toUpperCase() : null;
}

/** The hash that opens one country's page. */
export function countryHash(iso2) {
  return `#country=${String(iso2 || '').toUpperCase()}`;
}

/** The view a query names, in the same terms App reads at load. */
export function tabFromSearch(search, opts) {
  const route = routeFromSearch(search, opts);
  return route.overlay || route.view;
}

/** Best-effort: read URL first, then fall back to the localStorage mirror. */
export function loadInitialState() {
  if (typeof window === 'undefined') return {};
  const fromUrl = window.location.search ? decodeState(window.location.search) : {};
  let stored = null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) stored = decodeState(raw);
  } catch { /* ignore */ }
  if (Object.keys(fromUrl).length) {
    // T764: the taste is the traveller's own, not the view's, so a link that
    // carries none keeps the one this device stored.
    if (!fromUrl.taste && stored?.taste && !isEmptyTaste(stored.taste)) return { ...fromUrl, taste: stored.taste };
    return fromUrl;
  }
  return stored || {};
}


// Every key encodeState can write; persistState replaces exactly these.
const OWN_KEYS = ['ah', 'b', 'big', 'cat', 'cc', 'cf', 'd', 'dest', 'dh', 'fav', 'favonly', 'feat', 'g', 'gem', 'ls', 'mode', 'o', 'oa', 'pm', 'pr', 'pv', 'px', 'r', 'rh', 'rr', 'sort', 'st', 't', 'tab', 'tb', 'tk', 'top', 'ty', 'un'];

/** Push the encoded state into the URL (replaceState) and the localStorage mirror.
 *
 * Foreign query params are PRESERVED: the Explore rebuild keeps its filter
 * state (xk/xv/xr/xm/xp/xc/xg/xu/xs) and the member anchor (dm) in the URL,
 * and this writer used to rebuild the query from scratch and silently wipe
 * them 300 ms after any state change. Own keys are replaced wholesale; keys
 * this encoder never writes are left standing. Only the OWN keys go to the
 * localStorage mirror, exactly as before.
 */
export function persistState(state) {
  if (typeof window === 'undefined') return;
  const current = new URLSearchParams(window.location.search);
  // The places view writes the category Destinations is on (its own `dc`
  // key), so a reload or a copied link opens the same layer (T496).
  const qs = encodeState({ ...state, exploreCat: state.exploreCat || current.get('dc') || undefined });
  const own = new URLSearchParams(qs);
  const merged = current;
  // `view` names an Account spoke at boot only (App reads it once).
  merged.delete('view');
  // Together's sub-screen keys (T928) belong to that page only.
  if (state.activeTab !== 'together') { merged.delete('tv'); merged.delete('tg'); }
  for (const key of OWN_KEYS) merged.delete(key);
  for (const [k, v] of own) merged.set(k, v);
  const ms = merged.toString();
  // A journey's address is its hash (#journey=<id>, lib/journeys.js): the
  // week stays open across a reload, so this writer keeps that one hash
  // rather than dropping it (T391, row T387-a). An open place's is too
  // (#dest=, T444), with the history step that opened it (its state), so
  // Back still closes the place. A finder trip's page (#tf=, T870) is kept the
  // same way. Every other hash is read once at startup and is meant to go.
  const hash = /(?:^#|&)(?:journey|dest|tf)=/.test(window.location.hash || '') ? window.location.hash : '';
  const url = (ms ? `${window.location.pathname}?${ms}` : window.location.pathname) + hash;
  try { window.history.replaceState(window.history.state, '', url); } catch { /* ignore */ }
  try { window.localStorage.setItem(STORAGE_KEY, qs); } catch { /* ignore */ }
}
