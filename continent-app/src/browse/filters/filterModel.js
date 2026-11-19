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

/** The sort choices the sheet and the desktop row offer (decision.md). */
export const SORT_OPTIONS = Object.freeze([
  { key: 'beauty', labelKey: 'filters.sortMatch' },
  { key: 'cost', labelKey: 'filters.sortPrice' },
  { key: 'rating', labelKey: 'filters.sortScore' },
  { key: 'name', labelKey: 'filters.sortAz' },
]);
/** "For you" (T765, lib/match.js: the rating moved by the active style's
 *  explore half) leads the choices once the traveller has a taste. Best
 *  match does not read the taste while config/rating.json
 *  match.for_you_default is off, so without this the order was lost in
 *  round 2 of G12. */
export const FOR_YOU_SORT = Object.freeze({ key: 'foryou', labelKey: 'fit.sort' });
export const sortOptionsFor = (hasTaste) => (hasTaste ? [FOR_YOU_SORT, ...SORT_OPTIONS] : SORT_OPTIONS);
/** The sort as one of the choices: an older link's sort shows as Best match. */
export const sortShown = (key, hasTaste = false) => (sortOptionsFor(hasTaste).some((o) => o.key === key) ? key : 'beauty');

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
