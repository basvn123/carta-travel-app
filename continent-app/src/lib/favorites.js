/**
 * favorites.js, the shortlist as one kind of thing.
 *
 * The shortlist used to hold destination ids and nothing else: a bare Set of
 * strings in App.jsx, packed into the URL as `fav=LIS.OPO`. Everything else
 * this app opens - a trail, a beach, a lake, a mountain, a cycle route, a
 * ready-made trip - had no way to be kept, so the star on a destination card
 * was the only wish the app could hold.
 *
 * A favourite is now a {kind, id} pair, and the whole app addresses one
 * through its KEY, `kind:id`, which is what a Set can actually hold. Keys are
 * what App.jsx stores, what the URL carries, what the account syncs and what
 * every `has()` test compares, so there is exactly one string form and no
 * component has to know the pair shape to ask "is this one saved?".
 *
 * Five of the kinds carry a country inside the id part, `kind:cc/id`, because
 * their layers are published one file per country and the id alone cannot
 * find them again. See COUNTRY_KINDS below.
 *
 * MIGRATION. A bare id in a stored or shared link is read as a destination,
 * `{kind:'dest', id}`, because that is the only thing the old form could
 * mean. Old links therefore keep working, and a link made today stays
 * readable by an older build for its destinations (they round-trip as
 * `dest:LIS`, which an older build would simply treat as an unknown id and
 * drop, rather than mis-select something).
 *
 * The kinds are the layers a page exists for. `dest` is the priced catalogue;
 * the rest each open their own full-screen page from the Destinations tab.
 */

/** Every kind that can be shortlisted, in the order the Favorites tab groups
 *  them. `dest` leads because it is the priced catalogue and the oldest. */
export const FAV_KINDS = ['dest', 'trip', 'trail', 'beach', 'lake', 'mountain', 'cycle'];

const KIND_SET = new Set(FAV_KINDS);

/**
 * Kinds whose id does not locate the thing on its own.
 *
 * Trails, beaches, lakes, mountains and cycle routes are published one file
 * per COUNTRY (public/trails/AT.json and so on), so `id` alone cannot be
 * resolved back into a name and a photograph without opening every file in
 * Europe. Every share link for these layers already carries the country
 * alongside the id for exactly this reason (see readTrailFromUrl,
 * readBeachFromUrl...), and a shortlist entry has the same problem, so it
 * carries the same pair: the id part of the key is `<cc>/<id>`.
 *
 * Destinations and trips are not here: a destination id is globally unique in
 * one catalogue file, and a trip is addressed by slug in one index.
 */
const COUNTRY_KINDS = new Set(['trail', 'beach', 'lake', 'mountain', 'cycle']);

/** Does this kind need a country to be found again? */
export const needsCountry = (kind) => COUNTRY_KINDS.has(kind);

/** The i18n key naming each group in the Favorites tab. */
export const FAV_KIND_LABEL = {
  dest: 'fav.kindDest',
  trip: 'fav.kindTrip',
  trail: 'fav.kindTrail',
  beach: 'fav.kindBeach',
  lake: 'fav.kindLake',
  mountain: 'fav.kindMountain',
  cycle: 'fav.kindCycle',
};

/**
 * The one string form of a favourite: `kind:id`, or `kind:cc/id` for the
 * kinds that need a country (COUNTRY_KINDS above).
 *
 * Ids are not clean: a gem destination is already `gem:valbona`, and a cycle
 * route is a number. So the key splits on the FIRST colon only, and
 * parseFavKey puts the rest back together untouched.
 *
 * Returns null rather than a half-formed key when a country-kind arrives
 * without its country, so an unresolvable wish is never written down.
 */
export function favKey(kind, id, cc = '') {
  if (!kind || id == null || id === '') return null;
  const k = String(kind);
  if (!KIND_SET.has(k)) return null;
  if (COUNTRY_KINDS.has(k)) {
    // Without a country this entry could never be resolved back into a name,
    // so refuse to mint a key that would show up as a permanently blank row.
    const c = String(cc || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return null;
    return `${k}:${c}/${id}`;
  }
  return `${k}:${id}`;
}

/** `kind:id` (or `kind:cc/id`) back into {kind, id, cc}, or null if it is not
 *  one of ours. `cc` is '' for the kinds that do not carry one. */
export function parseFavKey(key) {
  if (!key) return null;
  const s = String(key);
  const cut = s.indexOf(':');
  if (cut <= 0) return null;
  const kind = s.slice(0, cut);
  let id = s.slice(cut + 1);
  if (!KIND_SET.has(kind) || !id) return null;
  let cc = '';
  if (COUNTRY_KINDS.has(kind)) {
    const slash = id.indexOf('/');
    if (slash <= 0) return null;
    cc = id.slice(0, slash).toUpperCase();
    id = id.slice(slash + 1);
    if (!/^[A-Z]{2}$/.test(cc) || !id) return null;
  }
  return { kind, id, cc };
}

/**
 * Read one stored/URL token into a key.
 *
 * Two shapes arrive here: the current `kind:id`, and the legacy bare
 * destination id. A bare id is anything that does not start with a known
 * kind, which includes `gem:valbona` - `gem` is not a kind, so it falls
 * through to the destination reading and becomes `dest:gem:valbona`, exactly
 * as it should.
 */
export function readFavToken(token) {
  if (!token) return null;
  const parsed = parseFavKey(token);
  if (parsed) return favKey(parsed.kind, parsed.id, parsed.cc);
  return favKey('dest', token);
}

/** A stored/URL list (array of tokens) into a Set of keys. */
export function readFavList(list) {
  const out = new Set();
  if (!Array.isArray(list)) return out;
  for (const token of list) {
    const key = readFavToken(token);
    if (key) out.add(key);
  }
  return out;
}

/** A Set of keys back out to a plain array, for the URL and the account. */
export function writeFavList(favorites) {
  return favorites ? [...favorites] : [];
}

/** Is this thing on the shortlist? The one test every card and page uses. */
export function isFav(favorites, kind, id, cc = '') {
  const key = favKey(kind, id, cc);
  return !!(key && favorites && favorites.has(key));
}

/** Add or drop one favourite, returning a NEW Set (state, not mutation). */
export function toggleFav(favorites, kind, id, cc = '') {
  const key = favKey(kind, id, cc);
  const next = new Set(favorites || []);
  if (!key) return next;
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

/** Just the destination ids on the shortlist, for the surfaces that price
 *  and compare destinations and cannot do anything with a trail. */
export function favDestIds(favorites) {
  const out = [];
  for (const key of favorites || []) {
    const p = parseFavKey(key);
    if (p && p.kind === 'dest') out.push(p.id);
  }
  return out;
}

/** The shortlist grouped for display: [{kind, items}] in FAV_KINDS order,
 *  empty kinds dropped, each item {kind, id, cc, key}. Insertion order is
 *  preserved inside each kind, so the most recently starred thing sits last
 *  in its own group. */
export function groupFavs(favorites) {
  const by = new Map();
  for (const key of favorites || []) {
    const p = parseFavKey(key);
    if (!p) continue;
    if (!by.has(p.kind)) by.set(p.kind, []);
    by.get(p.kind).push({ ...p, key });
  }
  return FAV_KINDS
    .filter((kind) => by.has(kind))
    .map((kind) => ({ kind, items: by.get(kind) }));
}
