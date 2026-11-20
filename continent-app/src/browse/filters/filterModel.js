/*
 * The Explore filters' model (G12, Explore top round 2, decision.md section
 * 2): what each option reads, how options combine, the shortcuts and the one
 * label a filter wears everywhere. Pure, so the node tests hold the rules
 * without rendering the tab.
 *
 * Every option reads a field the lite boot record already carries, so a
 * filter never waits for a country file:
 *
 *   Average day high   taste.tmax_by_month (NASA POWER mean day highs; all
 *                      3,855 places carry it, measured 2026-11-19)
 *   By the sea         the `coast` category outside a landlocked country
 *   By a lake          the `lake` category, or a `coast` tag in a landlocked
 *                      country (Balaton's shore is tagged coast)
 *   Hiking bases,      the guided search's vibe scores (the same threshold a
 *   Old towns          typed "hiking" uses): proxies, named as what they are
 *   Cities, Towns,     place.class (metro and city are Cities)
 *   Villages
 *   Islands, Mountains the category tags, or the guided vibe
 *
 * Why not the guided `nb.beach` distance for "By the sea": the beach layer
 * holds lake beaches too (Switzerland has nine places within 10 km of one),
 * so it cannot claim the sea.
 */
import { vibeScore, VIBE_MIN } from '../../lib/guidedSearch.js';

/** The day-high bands, in °C: [lo, hi), the last open-ended. */
export const TEMP_BANDS = Object.freeze([
  { id: '15', lo: 15, hi: 20 },
  { id: '20', lo: 20, hi: 25 },
  { id: '25', lo: 25, hi: 30 },
  { id: '30', lo: 30, hi: null },
]);
const BAND_IDS = new Set(TEMP_BANDS.map((b) => b.id));

/** A place's mean day high in a month (1 to 12), or null without a figure. */
export function tempOf(p, month) {
  const v = p?.taste?.tmax_by_month?.[month - 1];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** True when the place's day high falls in any chosen band. A place with no
 *  figure never matches: the sheet says how many have none. */
export function tempOk(p, month, temps) {
  const v = tempOf(p, month);
  if (v == null) return false;
  return temps.some((id) => {
    const b = TEMP_BANDS.find((x) => x.id === id);
    return !!b && v >= b.lo && (b.hi == null || v < b.hi);
  });
}

/** How many rows have no day high for the month. */
export function countNoTemp(rows, month) {
  let n = 0;
  for (const p of rows || []) if (tempOf(p, month) == null) n += 1;
  return n;
}

// A coast tag in these countries is a lake shore.
const LANDLOCKED = new Set(['AD', 'AT', 'BY', 'CH', 'CZ', 'HU', 'LI', 'LU', 'MD', 'MK', 'RS', 'SK', 'SM', 'VA', 'XK']);
const hasCat = (p, cats) => (p.categories || []).some((c) => cats.includes(c));
const vibeOk = (p, guided, vibe) => vibeScore(guided, p.id, vibe) >= VIBE_MIN;
// A castle on its own (Neuschwanstein, Burg Eltz, Egeskov) scores high on the
// guided old-town vibe but is not an old town (flow-filters m3): a castle or
// fortress with no town, village, city or historic tag of its own is left
// out of Old towns (14 of the 634 old-town places in the 2026-11 data).
const TOWN_CATS = ['town', 'village', 'city', 'historic', 'oldtown'];
export const castleOnly = (p) => hasCat(p, ['castle', 'fortress']) && !hasCat(p, TOWN_CATS);

/**
 * The picks, by group. Inside a group the options combine as `mode` says
 * ('any': one of them is enough, 'all': each must hold); groups combine with
 * AND. Walking is 'all' because each option is a property the traveller
 * wants on top of the others; a size or a water is one of a kind.
 */
export const PICK_GROUPS = Object.freeze({
  water: 'any',
  walk: 'all',
  size: 'any',
  feel: 'any',
});

export const PICKS = Object.freeze({
  sea: { group: 'water', labelKey: 'filters.sea', rank: 'beach',
    test: (p) => hasCat(p, ['coast']) && !LANDLOCKED.has(p.iso2) },
  lake: { group: 'water', labelKey: 'filters.lake', rank: 'lake',
    test: (p) => hasCat(p, ['lake', 'lakes']) || (hasCat(p, ['coast']) && LANDLOCKED.has(p.iso2)) },
  hiking: { group: 'walk', labelKey: 'filters.hiking', rank: 'hiking',
    test: (p, guided) => vibeOk(p, guided, 'hiking') },
  oldtown: { group: 'walk', labelKey: 'filters.oldtown', rank: 'oldtown',
    test: (p, guided) => vibeOk(p, guided, 'oldtown') && !castleOnly(p) },
  city: { group: 'size', labelKey: 'filters.city',
    test: (p) => p.place?.class === 'metro' || p.place?.class === 'city' },
  town: { group: 'size', labelKey: 'filters.town', test: (p) => p.place?.class === 'town' },
  village: { group: 'size', labelKey: 'filters.village', test: (p) => p.place?.class === 'village' },
  island: { group: 'feel', labelKey: 'filters.island', rank: 'island',
    test: (p, guided) => hasCat(p, ['island', 'islands']) || vibeOk(p, guided, 'island') },
  mountains: { group: 'feel', labelKey: 'filters.mountains', rank: 'mountain',
    test: (p, guided) => hasCat(p, ['mountains', 'alps']) || vibeOk(p, guided, 'mountain') },
});

/** Every pick in the sheet's order, per group. */
export const GROUP_PICKS = Object.freeze({
  water: ['sea', 'lake'],
  walk: ['hiking', 'oldtown'],
  size: ['city', 'town', 'village'],
  feel: ['island', 'mountains'],
});

/** Known ids only, in a stable order, without repeats (a URL may carry
 *  anything, including an old link's trip kinds under the same key). */
export function parsePicks(list) {
  const want = new Set((list || []).filter((id) => Object.hasOwn(PICKS, id)));
  return Object.keys(PICKS).filter((id) => want.has(id));
}
export function parseTemps(list) {
  const want = new Set((list || []).filter((id) => BAND_IDS.has(id)));
  return TEMP_BANDS.map((b) => b.id).filter((id) => want.has(id));
}

/** True when the place passes every chosen pick (see PICK_GROUPS). */
export function picksOk(p, picks, guided) {
  if (!picks || !picks.length) return true;
  for (const [group, mode] of Object.entries(PICK_GROUPS)) {
    const on = picks.filter((id) => PICKS[id]?.group === group);
    if (!on.length) continue;
    const pass = (id) => PICKS[id].test(p, guided);
    if (mode === 'all' ? !on.every(pass) : !on.some(pass)) return false;
  }
  return true;
}

/** The vibe that orders a list under "Best match" while picks are on and no
 *  typed question does: the first pick that has a vibe to rank by. */
export function rankVibe(picks) {
  for (const id of Object.keys(PICKS)) {
    if (picks?.includes(id) && PICKS[id].rank) return PICKS[id].rank;
  }
  return null;
}

/** A day, a person: fixed steps (not data-derived), so the chosen step
 *  never relabels itself when another filter or a price changes. */
export const BUDGET_STEPS = Object.freeze([50, 75, 100, 150]);

/** The sort choices the sheet and the desktop row offer (decision.md). G12
 *  map view round 2 adds price high to low, distance from the From place
 *  and hidden gems first; A to Z stays last, after a rule (`rule`). The
 *  distance choice shows only while a From place is known (`needsHome`). */
export const SORT_OPTIONS = Object.freeze([
  { key: 'beauty', labelKey: 'filters.sortMatch' },
  { key: 'rating', labelKey: 'filters.sortScore' },
  { key: 'cost', labelKey: 'filters.sortPriceUp' },
  { key: 'costDesc', labelKey: 'filters.sortPriceDown' },
  { key: 'distance', labelKey: 'filters.sortDistance', needsHome: true },
  { key: 'gemsFirst', labelKey: 'filters.sortGems' },
  { key: 'name', labelKey: 'filters.sortAz', rule: true },
]);

/** The minimum Score the "Score 8+" chip and the sheet's Score steps set. */
export const SCORE_STEPS = Object.freeze([7, 8]);
/** A place passes a minimum Score when it has one at least that high; an
 *  unrated place never passes (honest: no Score is not a high Score). */
export function scoreOk(p, min) {
  if (!min) return true;
  const s = p?.rating?.score;
  return typeof s === 'number' && Number.isFinite(s) && s >= min;
}

/** The match the "Match 70%+" chip asks for (a share, 0 to 1). */
export const MATCH_MIN = 0.7;
/** A place passes a minimum match when its fit (lib/match.js) reaches it;
 *  without a taste the filter holds nothing back (the chip is not offered). */
export function matchOk(p, min, fitOf) {
  if (!min || typeof fitOf !== 'function') return true;
  const f = fitOf(p);
  if (!f) return false;
  return f.F >= min;
}

const scoreOf = (p) => (p?.rating?.score ?? p?.beauty?.score ?? -Infinity);
const dayOf = (p) => (Number.isFinite(p?.cost?.dayEur) ? p.cost.dayEur : null);
const latOf = (p) => p?.city_lat ?? p?.lat;
const lonOf = (p) => p?.city_lon ?? p?.lon;

/** Great-circle km between two points (the same formula as lib/nearby.js). */
function km(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The orders the catalogue's own sort does not know (G12 map view round 2),
 * applied to a list already in Best match order, so ties keep that order:
 *   costDesc   the dearest day first; a place with no figure last
 *   distance   nearest to `home` ({ lat, lon }) first; no position last;
 *              without a home the list is returned as it is
 *   gemsFirst  the hidden gems first, each part in the order it came
 * Any other key returns the list unchanged. Returns a new array.
 */
export function sortExtra(rows, key, { home = null } = {}) {
  const list = [...(rows || [])];
  const keyed = list.map((p, i) => ({ p, i }));
  const by = (fn) => keyed.sort((a, b) => fn(a.p, b.p) || (a.i - b.i)).map((k) => k.p);
  if (key === 'costDesc') {
    return by((a, b) => {
      const x = dayOf(a); const y = dayOf(b);
      if (x == null || y == null) return (x == null) - (y == null);
      return (y - x) || (scoreOf(b) - scoreOf(a));
    });
  }
  if (key === 'distance') {
    if (!home || !Number.isFinite(home.lat) || !Number.isFinite(home.lon)) return list;
    const d = new Map(list.map((p) => {
      const at = { lat: latOf(p), lon: lonOf(p) };
      return [p, Number.isFinite(at.lat) && Number.isFinite(at.lon) ? km(home, at) : Infinity];
    }));
    return by((a, b) => d.get(a) - d.get(b));
  }
  if (key === 'gemsFirst') return by((a, b) => (!!b.rating?.hidden_gem) - (!!a.rating?.hidden_gem));
  return list;
}

/** The keys sortExtra orders (the catalogue sorts them as Best match first). */
export const EXTRA_SORTS = Object.freeze(['costDesc', 'distance', 'gemsFirst']);

/**
 * The quick chips of the map (G12 map view round 2, decision.md: row 3 on a
 * phone, the map's top edge on a desktop). Each is one filter the sheet also
 * holds; `when` says when it is offered:
 *   score8   Score 8+                 xf.minScore = 8
 *   budget   Up to €100 in the basis  xf.budget = 100
 *   warm     20 °C+ in the When month xf.temps 20, 25 and 30 (a month only)
 *   water    By the water             the sea or a lake (picks sea + lake)
 *   hiking   Hiking base              the hiking pick
 *   gems     Hidden gems              gemOnly
 *   match    Match 70%+               xf.minMatch = 0.7 (a taste only)
 *   saved    Saved                    showFavOnly
 */
export const QUICK = Object.freeze(['score8', 'budget', 'warm', 'water', 'hiking', 'gems', 'match', 'saved']);
export const QUICK_BUDGET = 100;
const WARM = ['20', '25', '30'];

/** Whether a quick chip is on, from { xf, gemOnly, showFavOnly }. */
export function quickOn(id, { xf, gemOnly = false, showFavOnly = false }) {
  if (id === 'score8') return xf?.minScore === 8;
  if (id === 'budget') return xf?.budget === QUICK_BUDGET;
  if (id === 'warm') return WARM.every((b) => xf?.temps?.includes(b)) && !xf?.temps?.includes('15');
  if (id === 'water') return !!xf?.picks?.includes('sea') && !!xf?.picks?.includes('lake');
  if (id === 'hiking') return !!xf?.picks?.includes('hiking');
  if (id === 'gems') return !!gemOnly;
  if (id === 'match') return xf?.minMatch === MATCH_MIN;
  if (id === 'saved') return !!showFavOnly;
  return false;
}

/** The state change a quick chip makes: { xf?, gemOnly?, showFavOnly? }. */
export function quickPatch(id, on, xf) {
  const picks = (add, ids) => {
    const rest = (xf?.picks || []).filter((x) => !ids.includes(x));
    return parsePicks(add ? [...rest, ...ids] : rest);
  };
  if (id === 'score8') return { xf: { minScore: on ? 8 : null } };
  if (id === 'budget') return { xf: { budget: on ? QUICK_BUDGET : null } };
  if (id === 'warm') return { xf: { temps: on ? [...WARM] : (xf?.temps || []).filter((x) => !WARM.includes(x)) } };
  if (id === 'water') return { xf: { picks: picks(on, ['sea', 'lake']) } };
  if (id === 'hiking') return { xf: { picks: picks(on, ['hiking']) } };
  if (id === 'gems') return { gemOnly: !!on };
  if (id === 'match') return { xf: { minMatch: on ? MATCH_MIN : null } };
  if (id === 'saved') return { showFavOnly: !!on };
  return {};
}

/** The quick chips to draw: the offered ones, an active chip moved to the
 *  front (in its own order), each { id, on }. */
export function quickChips({ xf, gemOnly, showFavOnly, hasMonth, hasTaste }) {
  const offered = QUICK.filter((id) => (id !== 'warm' || hasMonth) && (id !== 'match' || hasTaste));
  const state = { xf, gemOnly, showFavOnly };
  const all = offered.map((id) => ({ id, on: quickOn(id, state) }));
  return [...all.filter((c) => c.on), ...all.filter((c) => !c.on)];
}
/** "For you" (T765, lib/match.js: the rating moved by the active style's
 *  explore half) leads the choices once the traveller has a taste. Best
 *  match does not read the taste while config/rating.json
 *  match.for_you_default is off, so without this the order was lost in
 *  round 2 of G12. */
export const FOR_YOU_SORT = Object.freeze({ key: 'foryou', labelKey: 'fit.sort' });
/** The choices for this traveller: For you first with a taste; Distance
 *  only with a From place (`home`, { name }), its label naming the place
 *  (`args`). */
export const sortOptionsFor = (hasTaste, home = null) => {
  const own = SORT_OPTIONS
    .filter((o) => !o.needsHome || (home && home.name))
    .map((o) => (o.needsHome ? { ...o, args: { place: home.name } } : o));
  return hasTaste ? [FOR_YOU_SORT, ...own] : own;
};
/** The sort as one of the choices: an older link's sort shows as Best match. */
export const sortShown = (key, hasTaste = false, home = null) => (sortOptionsFor(hasTaste, home).some((o) => o.key === key) ? key : 'beauty');

/**
 * The shortcuts (the search panel's Browse list and the rails' See all):
 * each sets exactly one filter in place, and the chip it leaves wears the
 * same words (labelForApplied), so "Hiking bases" never comes back as
 * "Hiking base".
 */
export const SHORTCUTS = Object.freeze([
  { id: 'top', labelKey: 'filters.topRated' },
  { id: 'hiking', labelKey: 'filters.hiking' },
  { id: 'oldtown', labelKey: 'filters.oldtown' },
  { id: 'sea', labelKey: 'filters.sea' },
  { id: 'island', labelKey: 'filters.island' },
  { id: 'lake', labelKey: 'filters.lake' },
  { id: 'gems', labelKey: 'filters.gems' },
]);

/** Top rated is the Excellent band and nothing else. */
const isTop = (verdicts) => Array.isArray(verdicts) && verdicts.length === 1 && verdicts[0] === 'excellent';

/** Whether a shortcut's filter is on, from { xf, gemOnly }. */
export function shortcutOn(id, { xf, gemOnly }) {
  if (id === 'top') return isTop(xf?.verdicts);
  if (id === 'gems') return !!gemOnly;
  return !!xf?.picks?.includes(id);
}

/**
 * The state change a shortcut makes, as { xf, gemOnly } patches (either may
 * be absent). `on` false takes it off again.
 */
export function shortcutPatch(id, on, xf) {
  if (id === 'top') return { xf: { verdicts: on ? ['excellent'] : [] } };
  if (id === 'gems') return { gemOnly: !!on };
  if (!Object.hasOwn(PICKS, id)) return {};
  const rest = (xf?.picks || []).filter((x) => x !== id);
  return { xf: { picks: parsePicks(on ? [...rest, id] : rest) } };
}

/**
 * The one label an applied filter wears: a shortcut's words when the state
 * is that shortcut's, else null (the chip keeps its own label).
 */
export function labelForApplied(key, t, { verdicts } = {}) {
  if (key === 'rating' && isTop(verdicts)) return t('filters.topRated');
  if (key === 'gem') return t('filters.gems');
  if (key.startsWith('p:') && Object.hasOwn(PICKS, key.slice(2))) return t(PICKS[key.slice(2)].labelKey);
  return null;
}

/** A band's words: "20 to 25 °C", "Over 30 °C". */
export function bandLabel(id, t) {
  const b = TEMP_BANDS.find((x) => x.id === id);
  if (!b) return id;
  return b.hi == null ? t('filters.tempOver', { lo: b.lo }) : t('filters.tempBand', { lo: b.lo, hi: b.hi });
}

/** The chips the applied row draws: the search text is in the field, so its
 *  chip is not drawn twice. */
export const appliedChips = (chips) => chips.filter((c) => c.key !== 'q');
